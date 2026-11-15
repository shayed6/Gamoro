// functions/api/heartbeat.js  →  POST /api/heartbeat
// Cloudflare Pages Function: সক্রিয় খেলার সময় ও পয়েন্ট গণনা (৫-মিনিট চেকপয়েন্ট + pagehide sendBeacon)
//
// Secrets (Cloudflare Pages → Settings → Variables and Secrets):
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY

import {
  PLAY_SEC_PER_POINT,
  PLAY_MAX_SEC_PER_DAY,
  AD_REWARD_POINTS,
  AD_MAX_PER_DAY,
  json,
  bdDate,
  verifyIdToken,
  fsCtx,
  fsBeginTx,
  fsGet,
  fsPatch,
  fsCommitTx,
  fsRollbackTx,
  txUpdateWrite,
  tsValue,
} from '../_lib/firebase.js';

const MAX_CHECKPOINT_SEC = 330;
const ELAPSED_TOLERANCE_SEC = 10;

export async function onRequestPost({ request, env }) {
  let ctx = null;
  let tx = null;
  try {
    const pid = env?.FIREBASE_PROJECT_ID;
    if (!pid) return json({ ok: false, error: 'server' }, 500);

    const rawBody = await request.text().catch(() => '');
    let body = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      body = {};
    }
    if (!body || typeof body !== 'object') body = {};

    const authHeader = request.headers.get('Authorization') || '';
    const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const bodyToken = typeof body.token === 'string' ? body.token.trim() : '';
    const token = headerToken || bodyToken;
    if (!token) return json({ ok: false, error: 'login' }, 401);

    let user;
    try {
      user = await verifyIdToken(token, pid);
    } catch {
      return json({ ok: false, error: 'login' }, 401);
    }

    // ইমেইল ভেরিফাইড না হলে পয়েন্ট নয়
    if (!user.email_verified) return json({ ok: false, error: 'verify-email' }, 403);

    const gameId = typeof body.gameId === 'string' ? body.gameId.slice(0, 64) : '';
    const rawClaim = Number(body.activeSec);
    const claimedSec =
      Number.isFinite(rawClaim) && rawClaim > 0 ? Math.floor(rawClaim) : 0;

    ctx = await fsCtx(env);
    const today = bdDate(0);
    const period = today.slice(0, 7);
    const userPath = `users/${user.sub}`;
    const dailyPath = `playDaily/${user.sub}_${today}`;

    tx = await fsBeginTx(ctx, true);

    const [uRes, dRes] = await Promise.all([
      fsGet(ctx, userPath, tx),
      fsGet(ctx, dailyPath, tx),
    ]);

    if (!uRes.exists) {
      await fsRollbackTx(ctx, tx);
      return json({ ok: false, error: 'no-profile' }, 404);
    }

    const uFields = uRes.fields || {};
    if (uFields.status?.stringValue === 'suspended') {
      await fsRollbackTx(ctx, tx);
      return json({ ok: false, error: 'suspended' }, 403);
    }

    let prevActiveSec = 0;
    let prevPointsGiven = 0;
    let lastBeatMs = 0;
    let dailyExists = false;
    let dFields = {};

    if (dRes.exists) {
      dailyExists = true;
      dFields = dRes.fields || {};
      prevActiveSec = Number(dFields.activeSec?.integerValue || 0);
      prevPointsGiven = Number(dFields.playPointsGiven?.integerValue || 0);
      if (dFields.lastBeat?.timestampValue) {
        lastBeatMs = Date.parse(dFields.lastBeat.timestampValue) || 0;
      } else if (dFields.lastBeat?.integerValue) {
        lastBeatMs = Number(dFields.lastBeat.integerValue) || 0;
      }
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    // গ্রহণযোগ্য সেকেন্ড ≤ min(দাবি, শেষ গ্রহণের পর আসল ব্যবধান + ১০ সেকেন্ড সহনীয়তা, ৩৩০)
    let acceptedSec = 0;
    if (claimedSec > 0) {
      if (dailyExists && lastBeatMs > 0) {
        const elapsedSec = Math.max(0, Math.round((nowMs - lastBeatMs) / 1000));
        acceptedSec = Math.max(
          0,
          Math.min(claimedSec, elapsedSec + ELAPSED_TOLERANCE_SEC, MAX_CHECKPOINT_SEC)
        );
      } else {
        acceptedSec = Math.max(0, Math.min(claimedSec, MAX_CHECKPOINT_SEC));
      }
    }

    const newActiveSec = Math.min(PLAY_MAX_SEC_PER_DAY, prevActiveSec + acceptedSec);
    const actualAddedSec = Math.max(0, newActiveSec - prevActiveSec);
    const capReached = newActiveSec >= PLAY_MAX_SEC_PER_DAY;

    // ১২০ সেকেন্ডে ১ পূর্ণসংখ্যা পয়েন্ট, ভাগশেষ সেকেন্ড (playRemainderSec) জমা থাকবে
    const rawPrevRemainder = Number(
      uFields.playRemainderSec?.integerValue ?? dFields.playRemainderSec?.integerValue ?? 0
    );
    const prevRemainderSec =
      Number.isFinite(rawPrevRemainder) && rawPrevRemainder >= 0
        ? rawPrevRemainder % PLAY_SEC_PER_POINT
        : 0;
    const totalCreditSec = prevRemainderSec + actualAddedSec;
    const pointsToAdd = Math.floor(totalCreditSec / PLAY_SEC_PER_POINT);
    const newRemainderSec = totalCreditSec % PLAY_SEC_PER_POINT;
    const newPlayPointsGiven = prevPointsGiven + pointsToAdd;

    const prevPeriod = uFields.pointsPeriod?.stringValue || '';
    const prevPoints = prevPeriod === period ? Number(uFields.points?.integerValue || 0) : 0;
    const newUserPoints = prevPoints + pointsToAdd;
    const prevTotalSec = Number(
      uFields.totalActiveSec?.integerValue ??
        Math.round(
          Number(
            uFields.totalActiveMinutes?.doubleValue ??
              uFields.totalActiveMinutes?.integerValue ??
              0
          ) * 60
        )
    );
    const newTotalSec = prevTotalSec + actualAddedSec;
    const newTotalMinutes = Number((newTotalSec / 60).toFixed(2));

    const writes = [
      txUpdateWrite(
        ctx,
        dailyPath,
        {
          uid: user.sub,
          date: today,
          lastGameId: gameId,
          lastBeat: tsValue(nowIso),
          activeSec: newActiveSec,
          playPointsGiven: newPlayPointsGiven,
          playRemainderSec: newRemainderSec,
        },
        [
          'uid',
          'date',
          'lastGameId',
          'lastBeat',
          'activeSec',
          'playPointsGiven',
          'playRemainderSec',
        ]
      ),
      txUpdateWrite(
        ctx,
        userPath,
        {
          points: newUserPoints,
          pointsPeriod: period,
          totalActiveSec: newTotalSec,
          totalActiveMinutes: newTotalMinutes,
          playRemainderSec: newRemainderSec,
        },
        [
          'points',
          'pointsPeriod',
          'totalActiveSec',
          'totalActiveMinutes',
          'playRemainderSec',
        ],
        { exists: true }
      ),
    ];

    const commitRes = await fsCommitTx(ctx, tx, writes);
    tx = null;
    if (!commitRes.ok) return json({ ok: false, error: 'busy' }, 409);

    // রেফারেল অগ্রগতি হালনাগাদ
    const referrerUid = uFields.referredBy?.stringValue || '';
    if (referrerUid && actualAddedSec > 0) {
      try {
        const [cfgRes, refSubRes, refTopRes] = await Promise.all([
          fsGet(ctx, 'config/referral'),
          fsGet(ctx, `users/${referrerUid}/referrals/${user.sub}`),
          fsGet(ctx, `referrals/${user.sub}`),
        ]);
        const reqHours = Number(cfgRes.data?.requiredHours ?? 25);
        const meetsHours = newTotalSec >= reqHours * 3600;
        const emailVerified = user.email_verified === true;

        if (refSubRes.exists) {
          const curSubStatus = refSubRes.data?.status || 'pending';
          const nextSubStatus =
            curSubStatus === 'pending' && meetsHours && emailVerified ? 'review' : curSubStatus;
          await fsPatch(
            ctx,
            `users/${referrerUid}/referrals/${user.sub}`,
            {
              activeSec: newTotalSec,
              playedMinutes: newTotalMinutes,
              emailVerified,
              verified: emailVerified,
              status: nextSubStatus,
            },
            ['activeSec', 'playedMinutes', 'emailVerified', 'verified', 'status']
          );
        }
        if (refTopRes.exists) {
          const curTopStatus = refTopRes.data?.status || 'pending';
          const nextTopStatus =
            curTopStatus === 'pending' && meetsHours && emailVerified ? 'verifying' : curTopStatus;
          await fsPatch(
            ctx,
            `referrals/${user.sub}`,
            {
              activeSec: newTotalSec,
              playedMinutes: newTotalMinutes,
              emailVerified,
              status: nextTopStatus,
            },
            ['activeSec', 'playedMinutes', 'emailVerified', 'status']
          );
        }
      } catch {
        // non-fatal
      }
    }

    return json({
      ok: true,
      activeSec: newActiveSec,
      acceptedSec,
      playPointsToday: newPlayPointsGiven,
      playRemainderSec: newRemainderSec,
      capReached,
      points: newUserPoints,
      addedPoints: pointsToAdd,
      adConfig: { AD_REWARD_POINTS, AD_MAX_PER_DAY },
    });
  } catch {
    if (ctx && tx) await fsRollbackTx(ctx, tx);
    return json({ ok: false, error: 'server' }, 500);
  }
}
