// functions/api/heartbeat.js  →  POST /api/heartbeat
// Cloudflare Pages Function: সক্রিয় খেলার সময় ও পয়েন্ট গণনা (সব হিসাব সার্ভারে)
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
  requireAuth,
  fsCtx,
  fsBeginTx,
  fsGet,
  fsPatch,
  fsCommitTx,
  fsRollbackTx,
  txUpdateWrite,
  tsValue,
} from '../_lib/firebase.js';

export async function onRequestPost({ request, env }) {
  let ctx = null;
  let tx = null;
  try {
    const authRes = await requireAuth(request, env);
    if (!authRes.ok) return authRes.response;
    const user = authRes.user;

    // ইমেইল ভেরিফাইড না হলে পয়েন্ট নয়
    if (!user.email_verified) return json({ ok: false, error: 'verify-email' }, 403);

    const body = await request.json().catch(() => ({}));
    const gameId = typeof body.gameId === 'string' ? body.gameId.slice(0, 64) : '';

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

    if (dRes.exists) {
      dailyExists = true;
      const dFields = dRes.fields || {};
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
    const delta = lastBeatMs > 0 ? Math.round((nowMs - lastBeatMs) / 1000) : null;

    // delta < 20 সেকেন্ড হলে beat উপেক্ষা (বেশি ঘন ঘন)
    if (dailyExists && delta !== null && delta < 20) {
      await fsRollbackTx(ctx, tx);
      tx = null;

      const currentPoints =
        (uFields.pointsPeriod?.stringValue || '') === period
          ? Number(uFields.points?.integerValue || 0)
          : 0;
      return json({
        ok: true,
        activeSec: prevActiveSec,
        playPointsToday: prevPointsGiven,
        capReached: prevActiveSec >= PLAY_MAX_SEC_PER_DAY,
        points: currentPoints,
        ignored: true,
      });
    }

    // 20 <= delta <= 45 হলে delta সেকেন্ড যোগ, > 45 হলে শুধু lastBeat নতুন করা (idle ছিল)
    const addSec = delta !== null && delta >= 20 && delta <= 45 ? delta : 0;
    const newActiveSec = Math.min(PLAY_MAX_SEC_PER_DAY, prevActiveSec + addSec);
    const actualAddedSec = Math.max(0, newActiveSec - prevActiveSec);
    const capReached = newActiveSec >= PLAY_MAX_SEC_PER_DAY;

    // মোট প্রাপ্য পয়েন্ট = floor(activeSec / PLAY_SEC_PER_POINT) (পূর্ণসংখ্যা)
    const totalEarnedToday = Math.floor(newActiveSec / PLAY_SEC_PER_POINT);
    const pointsToAdd = Math.max(0, totalEarnedToday - prevPointsGiven);
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
        },
        ['uid', 'date', 'lastGameId', 'lastBeat', 'activeSec', 'playPointsGiven']
      ),
      txUpdateWrite(
        ctx,
        userPath,
        {
          points: newUserPoints,
          pointsPeriod: period,
          totalActiveSec: newTotalSec,
          totalActiveMinutes: newTotalMinutes,
        },
        ['points', 'pointsPeriod', 'totalActiveSec', 'totalActiveMinutes'],
        { exists: true }
      ),
    ];

    const commitRes = await fsCommitTx(ctx, tx, writes);
    tx = null;
    if (!commitRes.ok) return json({ ok: false, error: 'busy' }, 409);

    // রেফারেল অগ্রগতি হালনাগাদ (সর্বোচ্চ প্রচেষ্টা; মূল heartbeat-কে প্রভাবিত করবে না)
    const referrerUid = uFields.referredBy?.stringValue || '';
    if (referrerUid && actualAddedSec > 0) {
      try {
        const [cfgRes, refSubRes, refTopRes] = await Promise.all([
          fsGet(ctx, 'config/referral'),
          fsGet(ctx, `users/${referrerUid}/referrals/${user.sub}`),
          fsGet(ctx, `referrals/${user.sub}`),
        ]);
        const reqHours = Number(cfgRes.data?.requiredHours || 25);
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
      playPointsToday: newPlayPointsGiven,
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
