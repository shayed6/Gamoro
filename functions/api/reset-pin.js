// functions/api/reset-pin.js  →  POST /api/reset-pin
// Cloudflare Pages Function: ভুলে যাওয়া উইথড্রয়াল পিন রিসেট (PBKDF2 SHA-256)

import {
  json,
  bdDate,
  requireAuth,
  isWeakPin,
  randomSaltB64,
  hashPin,
  fsCtx,
  fsPatch,
  fsBeginTx,
  fsGet,
  fsCommitTx,
  fsRollbackTx,
  txUpdateWrite,
  tsValue,
} from '../_lib/firebase.js';

const RECENT_LOGIN_MAX_SEC = 300; // ৫ মিনিট
const MAX_RESETS_PER_DAY = 3;

function randomAuditId() {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `aud_${Date.now()}_${hex}`;
}

function buildAuditFields(user, result, details, nowIso) {
  return {
    uid: user.sub,
    admin: user.email || user.sub,
    action: 'user.resetPin',
    target: user.sub,
    result,
    details,
    createdAt: tsValue(nowIso),
  };
}

async function logResetAudit(ctx, user, result, details) {
  try {
    const nowIso = new Date().toISOString();
    const fields = buildAuditFields(user, result, details, nowIso);
    await fsPatch(ctx, `auditLogs/${randomAuditId()}`, fields, Object.keys(fields));
  } catch {
    // non-fatal audit logging failure
  }
}

export async function onRequestPost({ request, env }) {
  let ctx = null;
  let tx = null;
  try {
    const authRes = await requireAuth(request, env);
    if (!authRes.ok) return authRes.response;
    const user = authRes.user;

    ctx = await fsCtx(env);

    if (!user.email_verified) {
      await logResetAudit(ctx, user, 'email_not_verified', 'ইমেইল ভেরিফাই না থাকায় পিন রিসেট ব্যর্থ');
      return json({ ok: false, error: 'email_not_verified' }, 403);
    }

    // মালিকানা যাচাই: টোকেনের auth_time ৫ মিনিটের মধ্যে হতে হবে
    const nowSec = Math.floor(Date.now() / 1000);
    const authTime = Number(user.auth_time || 0);
    if (!authTime || nowSec - authTime > RECENT_LOGIN_MAX_SEC) {
      await logResetAudit(ctx, user, 'recent_login_required', 'সাম্প্রতিক লগইন না থাকায় পিন রিসেট ব্যর্থ');
      return json({ ok: false, error: 'recent_login_required' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const newPin = String(body.newPin || '').trim();

    if (!/^\d{6}$/.test(newPin) || isWeakPin(newPin)) {
      await logResetAudit(ctx, user, 'weak_pin', 'অবৈধ বা দুর্বল পিন দেওয়ায় রিসেট ব্যর্থ');
      return json({ ok: false, error: 'weak_pin' }, 400);
    }

    const userPath = `users/${user.sub}`;
    const pinPath = `pins/${user.sub}`;
    const today = bdDate(0);

    tx = await fsBeginTx(ctx, true);
    const [uRes, pRes] = await Promise.all([
      fsGet(ctx, userPath, tx),
      fsGet(ctx, pinPath, tx),
    ]);

    if (!uRes.exists) {
      await fsRollbackTx(ctx, tx);
      tx = null;
      await logResetAudit(ctx, user, 'no-profile', 'প্রোফাইল না পাওয়ায় পিন রিসেট ব্যর্থ');
      return json({ ok: false, error: 'no-profile' }, 404);
    }

    const uData = uRes.data || {};
    if (uData.status === 'suspended') {
      await fsRollbackTx(ctx, tx);
      tx = null;
      await logResetAudit(ctx, user, 'suspended', 'স্থগিত অ্যাকাউন্ট হওয়ায় পিন রিসেট ব্যর্থ');
      return json({ ok: false, error: 'suspended' }, 403);
    }

    const pData = pRes.data || {};
    const prevDate = String(pData.pinResetDate || '');
    const prevCount = prevDate === today ? Number(pData.pinResetCount || 0) : 0;

    if (prevCount >= MAX_RESETS_PER_DAY) {
      await fsRollbackTx(ctx, tx);
      tx = null;
      await logResetAudit(ctx, user, 'reset_limit', 'দৈনিক ৩ বারের সীমা অতিক্রম করায় পিন রিসেট ব্যর্থ');
      return json({ ok: false, error: 'reset_limit' }, 429);
    }

    const hadPin = uData.pinSet === true && Boolean(pData.pinHash) && Boolean(pData.pinSalt);
    const nextCount = prevCount + 1;
    const nowIso = new Date().toISOString();
    const salt = randomSaltB64(16);
    const pinHash = await hashPin(newPin, salt);

    const pinDocFields = {
      uid: user.sub,
      pinHash,
      pinSalt: salt,
      pinFailCount: 0,
      pinLockedUntil: null,
      pinResetDate: today,
      pinResetCount: nextCount,
      pinResetAt: hadPin ? tsValue(nowIso) : null,
      updatedAt: tsValue(nowIso),
    };

    const auditFields = buildAuditFields(
      user,
      'success',
      hadPin
        ? 'ভুলে যাওয়া পিন রিসেট সফল (২৪ ঘণ্টা উইথড্র কুলডাউন সক্রিয়)'
        : 'প্রথমবার পিন সেট সম্পন্ন (রিসেট এন্ডপয়েন্ট)',
      nowIso
    );

    const writes = [
      txUpdateWrite(ctx, pinPath, pinDocFields, Object.keys(pinDocFields)),
      txUpdateWrite(ctx, userPath, { pinSet: true }, ['pinSet'], { exists: true }),
      txUpdateWrite(
        ctx,
        `auditLogs/${randomAuditId()}`,
        auditFields,
        Object.keys(auditFields),
        { exists: false }
      ),
    ];

    const commitRes = await fsCommitTx(ctx, tx, writes);
    tx = null;
    if (!commitRes.ok) return json({ ok: false, error: 'busy' }, 409);

    return json({ ok: true, cooldown: hadPin });
  } catch {
    if (ctx && tx) await fsRollbackTx(ctx, tx);
    return json({ ok: false, error: 'server' }, 500);
  }
}
