// functions/api/set-pin.js  →  POST /api/set-pin
// Cloudflare Pages Function: ৬-ডিজিট উইথড্রয়াল পিন সেট ও পরিবর্তন (PBKDF2 SHA-256)

import {
  PIN_MAX_FAILS,
  PIN_LOCK_MS,
  json,
  requireAuth,
  isWeakPin,
  randomSaltB64,
  hashPin,
  constantTimeEqual,
  fsCtx,
  fsBeginTx,
  fsGet,
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

    const body = await request.json().catch(() => ({}));
    const newPin = String(body.pin || '').trim();
    const currentPin = body.currentPin !== undefined ? String(body.currentPin).trim() : '';

    if (!/^\d{6}$/.test(newPin)) {
      return json({ ok: false, error: 'weak_pin' }, 400);
    }
    if (isWeakPin(newPin)) {
      return json({ ok: false, error: 'weak_pin' }, 400);
    }

    ctx = await fsCtx(env);
    const userPath = `users/${user.sub}`;
    const pinPath = `pins/${user.sub}`;

    tx = await fsBeginTx(ctx, true);
    const [uRes, pRes] = await Promise.all([
      fsGet(ctx, userPath, tx),
      fsGet(ctx, pinPath, tx),
    ]);

    if (!uRes.exists) {
      await fsRollbackTx(ctx, tx);
      return json({ ok: false, error: 'no-profile' }, 404);
    }

    const uData = uRes.data || {};
    if (uData.status === 'suspended') {
      await fsRollbackTx(ctx, tx);
      return json({ ok: false, error: 'suspended' }, 403);
    }

    const pData = pRes.data;
    const hasPin = uData.pinSet === true && pData && pData.pinHash && pData.pinSalt;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    if (hasPin) {
      if (!currentPin) {
        await fsRollbackTx(ctx, tx);
        return json({ ok: false, error: 'pin_exists' }, 400);
      }

      const lockedUntilMs = pData.pinLockedUntil ? Date.parse(pData.pinLockedUntil) || 0 : 0;
      if (lockedUntilMs > nowMs) {
        await fsRollbackTx(ctx, tx);
        return json({ ok: false, error: 'pin_locked' }, 423);
      }

      const validFormat = /^\d{6}$/.test(currentPin);
      const currentHash = validFormat ? await hashPin(currentPin, pData.pinSalt) : '';
      if (!validFormat || !constantTimeEqual(currentHash, pData.pinHash)) {
        const nextFails = (Number(pData.pinFailCount) || 0) + 1;
        const shouldLock = nextFails >= PIN_MAX_FAILS;
        const commitFail = await fsCommitTx(ctx, tx, [
          txUpdateWrite(
            ctx,
            pinPath,
            {
              pinFailCount: shouldLock ? 0 : nextFails,
              pinLockedUntil: shouldLock ? tsValue(new Date(nowMs + PIN_LOCK_MS).toISOString()) : null,
              updatedAt: tsValue(nowIso),
            },
            ['pinFailCount', 'pinLockedUntil', 'updatedAt'],
            { exists: true }
          ),
        ]);
        tx = null;
        if (!commitFail.ok) return json({ ok: false, error: 'busy' }, 409);
        return json(
          { ok: false, error: shouldLock ? 'pin_locked' : 'wrong_pin' },
          shouldLock ? 423 : 403
        );
      }
    }

    const salt = randomSaltB64(16);
    const pinHash = await hashPin(newPin, salt);

    const writes = [
      txUpdateWrite(
        ctx,
        pinPath,
        {
          uid: user.sub,
          pinHash,
          pinSalt: salt,
          pinFailCount: 0,
          pinLockedUntil: null,
          updatedAt: tsValue(nowIso),
        },
        ['uid', 'pinHash', 'pinSalt', 'pinFailCount', 'pinLockedUntil', 'updatedAt']
      ),
      txUpdateWrite(
        ctx,
        userPath,
        {
          pinSet: true,
        },
        ['pinSet'],
        { exists: true }
      ),
    ];

    const commitRes = await fsCommitTx(ctx, tx, writes);
    tx = null;
    if (!commitRes.ok) return json({ ok: false, error: 'busy' }, 409);

    return json({ ok: true });
  } catch {
    if (ctx && tx) await fsRollbackTx(ctx, tx);
    return json({ ok: false, error: 'server' }, 500);
  }
}
