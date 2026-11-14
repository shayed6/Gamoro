// functions/api/daily-claim.js  →  POST /api/daily-claim
// Cloudflare Pages Function: দৈনিক বোনাস + স্ট্রিক (সব হিসাব সার্ভারে)
//
// Secrets (Cloudflare Pages → Settings → Variables and Secrets):
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY

import {
  json,
  bdDate,
  requireAuth,
  fsCtx,
  fsBeginTx,
  fsGet,
  fsCommitTx,
  fsRollbackTx,
  txUpdateWrite,
} from '../_lib/firebase.js';

// স্ট্রিকের দিন অনুযায়ী বোনাস (৭ দিনের চক্র)।
const BONUS = [5, 5, 10, 10, 15, 15, 50];
const POINTS_FIELD = 'points';

export async function onRequestPost({ request, env }) {
  let ctx = null;
  let tx = null;
  try {
    const authRes = await requireAuth(request, env);
    if (!authRes.ok) return authRes.response;
    const user = authRes.user;

    // ইমেইল ভেরিফাই না থাকলে ক্লেইম নয়
    if (!user.email_verified) return json({ ok: false, error: 'verify-email' }, 403);

    ctx = await fsCtx(env);
    const docPath = `users/${user.sub}`;

    // ট্রানজ্যাকশন: একই সময়ে দুবার ক্লেইম ঠেকায়
    tx = await fsBeginTx(ctx, true);
    const uRes = await fsGet(ctx, docPath, tx);
    if (!uRes.exists) {
      await fsRollbackTx(ctx, tx);
      return json({ ok: false, error: 'no-profile' }, 404);
    }

    const f = uRes.fields || {};
    const today = bdDate(0);
    const yesterday = bdDate(-1);
    const last = f.lastClaimDate?.stringValue || '';
    const oldStreak = Number(f.streak?.integerValue || 0);

    if (last === today) {
      await fsRollbackTx(ctx, tx);
      return json({ ok: false, error: 'already', streak: oldStreak });
    }

    const streak = last === yesterday ? oldStreak + 1 : 1;
    const bonus = BONUS[(streak - 1) % BONUS.length];

    const commitRes = await fsCommitTx(ctx, tx, [
      txUpdateWrite(
        ctx,
        docPath,
        { streak, lastClaimDate: today },
        ['streak', 'lastClaimDate'],
        { exists: true },
        [{ fieldPath: POINTS_FIELD, increment: { integerValue: String(bonus) } }]
      ),
    ]);
    tx = null;

    if (!commitRes.ok) return json({ ok: false, error: 'busy' }, 409);

    return json({ ok: true, bonus, streak });
  } catch {
    if (ctx && tx) await fsRollbackTx(ctx, tx);
    return json({ ok: false, error: 'server' }, 500);
  }
}
