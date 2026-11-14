// functions/api/referral.js  →  POST /api/referral
// Cloudflare Pages Function: রেফারেল কোড তৈরি, রেফারেল কোড যাচাই ও যোগসূত্র স্থাপন

import {
  json,
  sha256Hex,
  maskName,
  requireAuth,
  fsCtx,
  fsGet,
  fsPatch,
  fsRunQuery,
  fsBeginTx,
  fsCommitTx,
  fsRollbackTx,
  txUpdateWrite,
  tsValue,
} from '../_lib/firebase.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRefCode() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return `GMR-${suffix}`;
}

function randomFlagId() {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return 'flg_' + Date.now() + '_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost({ request, env }) {
  let ctx = null;
  let tx = null;
  try {
    const authRes = await requireAuth(request, env);
    if (!authRes.ok) return authRes.response;
    const user = authRes.user;
    const uid = user.sub;

    ctx = await fsCtx(env);
    const userPath = `users/${uid}`;
    const uRes = await fsGet(ctx, userPath);
    if (!uRes.exists) {
      return json({ ok: false, error: 'no-profile' }, 404);
    }

    const uData = uRes.data || {};
    const nowIso = new Date().toISOString();
    const clientIp =
      request.headers.get('CF-Connecting-IP') ||
      (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim() ||
      '';
    const ipHash = clientIp ? await sha256Hex(clientIp) : '';

    if (ipHash) {
      const metaRes = await fsGet(ctx, `userMeta/${uid}`);
      if (!metaRes.exists || !metaRes.data?.signupIpHash) {
        await fsPatch(
          ctx,
          `userMeta/${uid}`,
          { uid, signupIpHash: ipHash, updatedAt: tsValue(nowIso) },
          ['uid', 'signupIpHash', 'updatedAt']
        );
      }
    }

    // ১) নিজস্ব রেফারেল কোড (ownCode) না থাকলে তৈরি করা
    let ownCode = uData.ownCode || '';
    if (!ownCode) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const candidate = generateRefCode();
        const codePath = `referralCodes/${candidate}`;
        const existingCode = await fsGet(ctx, codePath);
        if (existingCode.exists) continue;

        tx = await fsBeginTx(ctx, true);
        const [uTx, cTx] = await Promise.all([
          fsGet(ctx, userPath, tx),
          fsGet(ctx, codePath, tx),
        ]);
        if (uTx.data?.ownCode) {
          await fsRollbackTx(ctx, tx);
          tx = null;
          ownCode = uTx.data.ownCode;
          break;
        }
        if (cTx.exists) {
          await fsRollbackTx(ctx, tx);
          tx = null;
          continue;
        }
        const commitCode = await fsCommitTx(ctx, tx, [
          txUpdateWrite(
            ctx,
            codePath,
            { uid, createdAt: tsValue(nowIso) },
            ['uid', 'createdAt'],
            { exists: false }
          ),
          txUpdateWrite(
            ctx,
            userPath,
            { ownCode: candidate },
            ['ownCode'],
            { exists: true }
          ),
        ]);
        tx = null;
        if (commitCode.ok) {
          ownCode = candidate;
          break;
        }
      }
    }

    // ২) প্রদত্ত referralCode যাচাই ও লিংক করা (একবারই)
    let referredByMasked = uData.referredByMasked || '';
    let referrerUid = uData.referredBy || '';
    const submittedCode = String(uData.referralCode || '').trim().toUpperCase();

    if (submittedCode && !referrerUid && uData.referralProcessed !== true) {
      let foundReferrerUid = '';
      const codeDoc = await fsGet(ctx, `referralCodes/${submittedCode}`);
      if (codeDoc.exists && codeDoc.data?.uid) {
        foundReferrerUid = codeDoc.data.uid;
      } else {
        const matchedUsers = await fsRunQuery(ctx, {
          from: [{ collectionId: 'users' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'ownCode' },
              op: 'EQUAL',
              value: { stringValue: submittedCode },
            },
          },
          limit: 1,
        });
        if (matchedUsers.length > 0) foundReferrerUid = matchedUsers[0].id;
      }

      let rejectFlagReason = '';
      let refUser = null;
      if (!foundReferrerUid || foundReferrerUid === uid) {
        rejectFlagReason = 'invalid_or_self';
      } else {
        const [refUserRes, refMetaRes] = await Promise.all([
          fsGet(ctx, `users/${foundReferrerUid}`),
          fsGet(ctx, `userMeta/${foundReferrerUid}`),
        ]);
        if (!refUserRes.exists || refUserRes.data?.status === 'suspended') {
          rejectFlagReason = 'referrer_unavailable';
        } else {
          refUser = refUserRes.data;
          if (uData.mobile && refUser.mobile && uData.mobile === refUser.mobile) {
            rejectFlagReason = 'same_mobile';
          } else if (ipHash && refMetaRes.data?.signupIpHash && refMetaRes.data.signupIpHash === ipHash) {
            rejectFlagReason = 'same_ip_cluster';
          }
        }
      }

      if (rejectFlagReason === 'same_ip_cluster' || rejectFlagReason === 'same_mobile') {
        await fsPatch(
          ctx,
          `flags/${randomFlagId()}`,
          {
            type: 'same_ip_cluster',
            severity: 'high',
            uid,
            userName: uData.name || 'ব্যবহারকারী',
            details:
              rejectFlagReason === 'same_mobile'
                ? 'রেফারেল ও আমন্ত্রিতের মোবাইল নম্বর এক'
                : 'একই আইপি থেকে রেফারেল সাইনআপ শনাক্ত',
            status: 'open',
            detectedAt: tsValue(nowIso),
          },
          ['type', 'severity', 'uid', 'userName', 'details', 'status', 'detectedAt']
        );
        await fsPatch(ctx, userPath, { referralProcessed: true }, ['referralProcessed'], true);
      } else if (rejectFlagReason) {
        await fsPatch(ctx, userPath, { referralProcessed: true }, ['referralProcessed'], true);
      } else if (refUser) {
        const refMasked = maskName(refUser.name);
        const invMasked = maskName(uData.name);
        const initSec = Number(uData.totalActiveSec || 0);
        const initMin = Number((initSec / 60).toFixed(2));
        const emailVerified = user.email_verified === true;

        tx = await fsBeginTx(ctx, true);
        const uTx = await fsGet(ctx, userPath, tx);
        if (uTx.exists && !uTx.data?.referredBy && uTx.data?.referralProcessed !== true) {
          const commitRef = await fsCommitTx(ctx, tx, [
            txUpdateWrite(
              ctx,
              userPath,
              {
                referredBy: foundReferrerUid,
                referredByMasked: refMasked,
                referralProcessed: true,
              },
              ['referredBy', 'referredByMasked', 'referralProcessed'],
              { exists: true }
            ),
            txUpdateWrite(
              ctx,
              `users/${foundReferrerUid}/referrals/${uid}`,
              {
                inviteeUid: uid,
                maskedName: invMasked,
                emailVerified,
                verified: emailVerified,
                activeSec: initSec,
                playedMinutes: initMin,
                status: 'pending',
                referrerReward: 0,
                createdAt: tsValue(nowIso),
              },
              [
                'inviteeUid',
                'maskedName',
                'emailVerified',
                'verified',
                'activeSec',
                'playedMinutes',
                'status',
                'referrerReward',
                'createdAt',
              ],
              { exists: false }
            ),
            txUpdateWrite(
              ctx,
              `referrals/${uid}`,
              {
                referrerUid: foundReferrerUid,
                referrerName: refUser.name || refMasked,
                inviteeUid: uid,
                inviteeName: uData.name || invMasked,
                activeSec: initSec,
                playedMinutes: initMin,
                emailVerified,
                status: 'pending',
                createdAt: tsValue(nowIso),
              },
              [
                'referrerUid',
                'referrerName',
                'inviteeUid',
                'inviteeName',
                'activeSec',
                'playedMinutes',
                'emailVerified',
                'status',
                'createdAt',
              ],
              { exists: false }
            ),
          ]);
          tx = null;
          if (commitRef.ok) {
            referredByMasked = refMasked;
            referrerUid = foundReferrerUid;
          }
        } else {
          await fsRollbackTx(ctx, tx);
          tx = null;
        }
      }
    }

    // ৩) রেফারেল থাকলে বর্তমান ইমেইল ও সক্রিয় সময় সিঙ্ক করা
    if (referrerUid) {
      try {
        const [cfgRes, refSubRes, refTopRes] = await Promise.all([
          fsGet(ctx, 'config/referral'),
          fsGet(ctx, `users/${referrerUid}/referrals/${uid}`),
          fsGet(ctx, `referrals/${uid}`),
        ]);
        const reqHours = Number(cfgRes.data?.requiredHours || 25);
        const totalSec = Number(uData.totalActiveSec || 0);
        const totalMin = Number((totalSec / 60).toFixed(2));
        const emailVerified = user.email_verified === true;
        const meetsHours = totalSec >= reqHours * 3600;

        if (refSubRes.exists) {
          const curStatus = refSubRes.data?.status || 'pending';
          const nextStatus = curStatus === 'pending' && meetsHours && emailVerified ? 'review' : curStatus;
          await fsPatch(
            ctx,
            `users/${referrerUid}/referrals/${uid}`,
            {
              activeSec: totalSec,
              playedMinutes: totalMin,
              emailVerified,
              verified: emailVerified,
              status: nextStatus,
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
            `referrals/${uid}`,
            {
              activeSec: totalSec,
              playedMinutes: totalMin,
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

    return json({ ok: true, ownCode, referredByMasked });
  } catch {
    if (ctx && tx) await fsRollbackTx(ctx, tx);
    return json({ ok: false, error: 'server' }, 500);
  }
}
