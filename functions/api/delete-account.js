// functions/api/delete-account.js  →  POST /api/delete-account
// Cloudflare Pages Function: অ্যাকাউন্ট স্থায়ীভাবে মুছে ফেলা (পিন সেট থাকলে যাচাই, না থাকলে ছাড়া)

import {
  json,
  requireAuth,
  verifyAndTrackUserPin,
  deleteAuthUser,
  fsCtx,
  fsGet,
  fsPatch,
  fsDelete,
  fsRunQuery,
  fsDeleteCollection,
  tsValue,
} from '../_lib/firebase.js';

const RECENT_LOGIN_MAX_SEC = 300; // ৫ মিনিট

export async function onRequestPost({ request, env }) {
  try {
    const authRes = await requireAuth(request, env);
    if (!authRes.ok) return authRes.response;
    const user = authRes.user;

    const body = await request.json().catch(() => ({}));
    if (String(body.confirmText || '').trim() !== 'মুছে ফেলুন') {
      return json({ ok: false, error: 'confirm_required' }, 400);
    }

    // ১) সাম্প্রতিক লগইন যাচাই (৫ মিনিট)
    const nowSec = Math.floor(Date.now() / 1000);
    const authTime = Number(user.auth_time || 0);
    if (!authTime || nowSec - authTime > RECENT_LOGIN_MAX_SEC) {
      return json({ ok: false, error: 'recent_login_required' }, 403);
    }

    const ctx = await fsCtx(env);
    const uid = user.sub;
    const userPath = `users/${uid}`;
    const pinPath = `pins/${uid}`;

    const [uRes, pRes] = await Promise.all([
      fsGet(ctx, userPath),
      fsGet(ctx, pinPath),
    ]);

    const uData = uRes.data || {};
    const hasPin = uData.pinSet === true && pRes.exists && pRes.data?.pinHash && pRes.data?.pinSalt;

    // ২) পিন সেট থাকলে পিন বাধ্যতামূলক ও যাচাই (ভুলে ৫ বার ১৫ মিনিট লক); পিন না থাকলে লাগবে না
    if (hasPin) {
      const pinCheck = await verifyAndTrackUserPin(ctx, uid, body.pin);
      if (!pinCheck.ok) {
        return json({ ok: false, error: pinCheck.error }, pinCheck.status || 403);
      }
    }

    // ৩) অপেক্ষমাণ উইথড্রয়াল আবেদন থাকলে মুছতে দেওয়া হবে না
    const pendingWithdrawals = await fsRunQuery(ctx, {
      from: [{ collectionId: 'withdrawals' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'uid' },
                op: 'EQUAL',
                value: { stringValue: uid },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'status' },
                op: 'EQUAL',
                value: { stringValue: 'pending' },
              },
            },
          ],
        },
      },
      limit: 1,
    });

    if (pendingWithdrawals.length > 0) {
      return json({ ok: false, error: 'pending_payout' }, 409);
    }

    // ৪) users/{uid}-এর সাবকালেকশনগুলো মুছে ফেলা
    const subcollections = ['sessions', 'payouts', 'points', 'referrals', 'dailyClaims'];
    await Promise.all(
      subcollections.map((sub) => fsDeleteCollection(ctx, `${userPath}/${sub}`))
    );

    // ৫) নিজস্ব ডকুমেন্ট ও সেশন মুছে ফেলা
    const deletes = [
      fsDelete(ctx, userPath),
      fsDelete(ctx, pinPath),
      fsDelete(ctx, `activeSessions/${uid}`),
      fsDelete(ctx, `userMeta/${uid}`),
    ];
    if (uData.ownCode) {
      deletes.push(fsDelete(ctx, `referralCodes/${uData.ownCode}`));
    }
    await Promise.all(deletes);

    // ৬) withdrawals পরিচয়হীন (anonymize) করা — uid বদলে অজ্ঞাত চিহ্ন, ইমেইল/মোবাইল/আইপি/details মুছে ফেলা
    const nowIso = new Date().toISOString();
    const userWithdrawals = await fsRunQuery(ctx, {
      from: [{ collectionId: 'withdrawals' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'uid' },
          op: 'EQUAL',
          value: { stringValue: uid },
        },
      },
      limit: 200,
    });

    for (const wd of userWithdrawals) {
      await fsPatch(
        ctx,
        `withdrawals/${wd.id}`,
        {
          uid: 'deleted',
          userName: 'মুছে ফেলা অ্যাকাউন্ট',
          accountNo: '[anonymized]',
          accountDetails: '[anonymized]',
          label: '[anonymized]',
          anonymizedAt: tsValue(nowIso),
        },
        [
          'uid',
          'userName',
          'userEmail',
          'mobile',
          'ip',
          'ipHash',
          'details',
          'accountNo',
          'accountDetails',
          'label',
          'anonymizedAt',
        ]
      );
    }

    // payoutAccounts-এ হ্যাশ রাখা (ownerUid বদলে অজ্ঞাত করা)
    const ownedPayoutAccounts = await fsRunQuery(ctx, {
      from: [{ collectionId: 'payoutAccounts' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'ownerUid' },
          op: 'EQUAL',
          value: { stringValue: uid },
        },
      },
      limit: 100,
    });

    for (const acc of ownedPayoutAccounts) {
      await fsPatch(
        ctx,
        `payoutAccounts/${acc.id}`,
        {
          ownerUid: 'deleted',
          anonymizedAt: tsValue(nowIso),
        },
        ['ownerUid', 'anonymizedAt']
      );
    }

    // ৭) Firebase Auth ইউজার মুছে ফেলা (Identity Toolkit REST)
    await deleteAuthUser(env, uid);

    return json({ ok: true });
  } catch {
    return json({ ok: false, error: 'server' }, 500);
  }
}
