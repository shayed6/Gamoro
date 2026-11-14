// functions/api/ad-reward.js  →  GET /api/ad-reward
// Cloudflare Pages Function: Google AdMob Rewarded Ad Server-Side Verification (SSV) callback
//
// Secrets (Cloudflare Pages → Settings → Variables and Secrets):
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY

import {
  PLAY_SEC_PER_POINT,
  PLAY_MAX_SEC_PER_DAY,
  AD_REWARD_POINTS,
  AD_MAX_PER_DAY,
  json,
  b64uToBytes,
  b64ToBytes,
  bdDate,
  fsCtx,
  fsBeginTx,
  fsGet,
  fsCommitTx,
  fsRollbackTx,
  txUpdateWrite,
  tsValue,
} from '../_lib/firebase.js';

const ADMOB_VERIFIER_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const enc = new TextEncoder();

// ASN.1 DER ECDSA স্বাক্ষর -> Web Crypto IEEE P1363 (64 বাইট r||s) রূপান্তর
function derToP1363(der) {
  if (der.length === 64 && der[0] !== 0x30) return der;
  if (der[0] !== 0x30) throw new Error('invalid signature format');
  let offset = 2;
  if (der[1] & 0x80) offset = 2 + (der[1] & 0x7f);
  if (der[offset] !== 0x02) throw new Error('invalid r');
  const rLen = der[offset + 1];
  const rBytes = der.slice(offset + 2, offset + 2 + rLen);
  offset += 2 + rLen;
  if (der[offset] !== 0x02) throw new Error('invalid s');
  const sLen = der[offset + 1];
  const sBytes = der.slice(offset + 2, offset + 2 + sLen);

  const out = new Uint8Array(64);
  const rTrim = rBytes.length > 32 ? rBytes.slice(rBytes.length - 32) : rBytes;
  const sTrim = sBytes.length > 32 ? sBytes.slice(sBytes.length - 32) : sBytes;
  out.set(rTrim, 32 - rTrim.length);
  out.set(sTrim, 64 - sTrim.length);
  return out;
}

// AdMob SSV স্বাক্ষর যাচাই (ECDSA P-256, SHA-256)
async function verifyAdMobSignature(rawQuery, signatureB64u, keyId) {
  if (!rawQuery || !signatureB64u || !keyId) return false;

  const signedData = rawQuery
    .split('&')
    .filter((part) => !part.startsWith('signature=') && !part.startsWith('key_id='))
    .join('&');
  if (!signedData) return false;

  const keysRes = await fetch(ADMOB_VERIFIER_KEYS_URL, {
    cf: { cacheTtl: 3600, cacheEverything: true },
  });
  if (!keysRes.ok) return false;
  const keysJson = await keysRes.json();
  const keyObj = (keysJson.keys || []).find((k) => String(k.keyId) === String(keyId));
  if (!keyObj) return false;

  const spkiB64 = keyObj.base64
    ? keyObj.base64
    : String(keyObj.pem || '')
        .replace(/-----[^-]+-----/g, '')
        .replace(/\s+/g, '');
  if (!spkiB64) return false;

  const spkiDer = b64ToBytes(spkiB64);
  const cryptoKey = await crypto.subtle.importKey(
    'spki',
    spkiDer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  );

  const rawSig = b64uToBytes(signatureB64u);
  const p1363Sig = derToP1363(rawSig);

  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    p1363Sig,
    enc.encode(signedData)
  );
}

export async function onRequestGet({ request, env }) {
  let ctx = null;
  let tx = null;
  try {
    const url = new URL(request.url);
    const params = url.searchParams;
    const rawQuery = url.search.startsWith('?') ? url.search.slice(1) : '';

    const adNetwork = params.get('ad_network') || '';
    const adUnit = params.get('ad_unit') || '';
    const timestamp = params.get('timestamp') || '';
    const transactionId = (params.get('transaction_id') || '').trim();
    const userId = (params.get('user_id') || '').trim();
    const signature = params.get('signature') || '';
    const keyId = params.get('key_id') || '';

    if (
      !transactionId ||
      !userId ||
      !signature ||
      !keyId ||
      !/^[a-zA-Z0-9._-]+$/.test(transactionId) ||
      !/^[a-zA-Z0-9_-]+$/.test(userId)
    ) {
      return json({ ok: false, error: 'invalid_params' }, 400);
    }

    let sigOk = false;
    try {
      sigOk = await verifyAdMobSignature(rawQuery, signature, keyId);
    } catch {
      sigOk = false;
    }
    if (!sigOk) {
      return json({ ok: false, error: 'invalid_signature' }, 400);
    }

    ctx = await fsCtx(env);
    const today = bdDate(0);
    const period = today.slice(0, 7);
    const rewardDocPath = `adRewards/${transactionId}`;
    const dailyDocPath = `adDaily/${userId}_${today}`;
    const userDocPath = `users/${userId}`;

    tx = await fsBeginTx(ctx, true);

    const [rRes, dRes, uRes] = await Promise.all([
      fsGet(ctx, rewardDocPath, tx),
      fsGet(ctx, dailyDocPath, tx),
      fsGet(ctx, userDocPath, tx),
    ]);

    // transaction_id ডুপ্লিকেট হলে উপেক্ষা করো
    if (rRes.exists) {
      await fsRollbackTx(ctx, tx);
      tx = null;
      return json({ ok: true, duplicate: true }, 200);
    }

    if (!uRes.exists) {
      await fsRollbackTx(ctx, tx);
      tx = null;
      return json({ ok: false, error: 'no-profile' }, 404);
    }

    const uFields = uRes.fields || {};
    let countToday = 0;
    if (dRes.exists) {
      countToday = Number(dRes.fields?.count?.integerValue || 0);
    }

    // দিনে AD_MAX_PER_DAY-এর বেশি হলে পয়েন্ট নয়
    if (countToday >= AD_MAX_PER_DAY) {
      await fsRollbackTx(ctx, tx);
      tx = null;
      return json({ ok: false, error: 'daily_cap', countToday, maxPerDay: AD_MAX_PER_DAY }, 200);
    }

    const prevPeriod = uFields.pointsPeriod?.stringValue || '';
    const prevPoints = prevPeriod === period ? Number(uFields.points?.integerValue || 0) : 0;
    const newPoints = prevPoints + AD_REWARD_POINTS;
    const nowIso = new Date().toISOString();

    const writes = [
      txUpdateWrite(
        ctx,
        rewardDocPath,
        {
          uid: userId,
          transactionId,
          adNetwork,
          adUnit,
          adTimestamp: timestamp,
          pointsAwarded: AD_REWARD_POINTS,
          date: today,
          createdAt: tsValue(nowIso),
        },
        ['uid', 'transactionId', 'adNetwork', 'adUnit', 'adTimestamp', 'pointsAwarded', 'date', 'createdAt'],
        { exists: false }
      ),
      txUpdateWrite(
        ctx,
        dailyDocPath,
        {
          uid: userId,
          date: today,
          count: countToday + 1,
          updatedAt: tsValue(nowIso),
        },
        ['uid', 'date', 'count', 'updatedAt']
      ),
      txUpdateWrite(
        ctx,
        userDocPath,
        {
          points: newPoints,
          pointsPeriod: period,
        },
        ['points', 'pointsPeriod'],
        { exists: true }
      ),
    ];

    const commitRes = await fsCommitTx(ctx, tx, writes);
    tx = null;
    if (!commitRes.ok) return json({ ok: false, error: 'busy' }, 409);

    return json(
      {
        ok: true,
        awarded: AD_REWARD_POINTS,
        countToday: countToday + 1,
        points: newPoints,
        playConfig: { PLAY_SEC_PER_POINT, PLAY_MAX_SEC_PER_DAY },
      },
      200
    );
  } catch {
    if (ctx && tx) await fsRollbackTx(ctx, tx);
    return json({ ok: false, error: 'server' }, 500);
  }
}
