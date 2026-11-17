// functions/api/delete-account.js  →  POST /api/delete-account
// Cloudflare Pages Function: অ্যাকাউন্ট স্থায়ীভাবে মুছে ফেলা (সাম্প্রতিক লগইন যাচাইসহ)

import {
  json,
  requireAuth,
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

    const uRes = await fsGet(ctx, userPath);
    const uData = uRes.data || {};

    // ২) অপেক্ষমাণ উইথড্রয়াল আবেদন থাকলে মুছতে দেওয়া হবে না
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

    // ৩) users/{uid}-এর সাবকালেকশনগুলো মুছে ফেলা
    const subcollections = ['sessions', 'payouts', 'points', 'referrals', 'dailyClaims'];
    await Promise.all(
      subcollections.map((sub) => fsDeleteCollection(ctx, `${userPath}/${sub}`))
    );

    // ৪) নিজস্ব ডকুমেন্ট, পুরোনো pins/{uid} ও সেশন মুছে ফেলা
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

    // ৫) withdrawals পরিচয়হীন (anonymize) করা — uid বদলে অজ্ঞাত চিহ্ন, ইমেইল/মোবাইল/আইপি/details মুছে ফেলা
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

    // ৬) Firebase Auth ইউজার মুছে ফেলা (Identity Toolkit REST)
    await deleteAuthUser(env, uid);

    return json({ ok: true });
  } catch {
    return json({ ok: false, error: 'server' }, 500);
  }
}
