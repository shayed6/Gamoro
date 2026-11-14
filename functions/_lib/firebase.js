// functions/_lib/firebase.js
// Shared Cloudflare Pages Functions helpers (Web APIs only: fetch, crypto.subtle, TextEncoder, URL).
// Underscore prefix ensures Cloudflare Pages does not expose this directory as a route.

export const PLAY_SEC_PER_POINT = 120;
export const PLAY_MAX_SEC_PER_DAY = 35000;
export const AD_REWARD_POINTS = 20;
export const AD_MAX_PER_DAY = 5;

export const PIN_PBKDF2_ITERATIONS = 100000;
export const PIN_MAX_FAILS = 5;
export const PIN_LOCK_MS = 15 * 60 * 1000;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export function b64u(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64uToBytes(s) {
  const norm = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm + '='.repeat((4 - (norm.length % 4)) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256Hex(str) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(String(str)));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// বাংলাদেশ সময় (UTC+6) অনুযায়ী তারিখ (YYYY-MM-DD)
export function bdDate(offsetDays = 0) {
  const t = Date.now() + 6 * 3600e3 + offsetDays * 86400e3;
  return new Date(t).toISOString().slice(0, 10);
}

export function bdPeriod(offsetDays = 0) {
  return bdDate(offsetDays).slice(0, 7);
}

export function formatBnDateTime(val) {
  if (!val) return '';
  try {
    const d = val instanceof Date ? val : new Date(val);
    if (Number.isNaN(d.getTime())) return String(val);
    return (
      d.toLocaleDateString('bn-BD', {
        timeZone: 'Asia/Dhaka',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }) +
      ', ' +
      d.toLocaleTimeString('bn-BD', {
        timeZone: 'Asia/Dhaka',
        hour: '2-digit',
        minute: '2-digit',
      })
    );
  } catch {
    return String(val);
  }
}

export function maskName(name) {
  const s = String(name || '').trim();
  if (!s) return 'ব্যবহারকারী***';
  const chars = Array.from(s);
  const prefix = chars.slice(0, Math.min(4, Math.max(2, Math.floor(chars.length / 2)))).join('');
  return `${prefix}***`;
}

// ১) Firebase ID Token যাচাই
export async function verifyIdToken(token, projectId) {
  if (!token || !projectId) throw new Error('missing token or project');
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('bad token');
  const [h, p, s] = parts;
  const header = JSON.parse(dec.decode(b64uToBytes(h)));
  const payload = JSON.parse(dec.decode(b64uToBytes(p)));

  const jwksRes = await fetch(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
    { cf: { cacheTtl: 3600, cacheEverything: true } }
  );
  if (!jwksRes.ok) throw new Error('jwks fetch failed');
  const jwks = await jwksRes.json();
  const jwk = (jwks.keys || []).find((k) => k.kid === header.kid);
  if (!jwk || header.alg !== 'RS256') throw new Error('bad key');

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64uToBytes(s),
    enc.encode(`${h}.${p}`)
  );
  const now = Math.floor(Date.now() / 1000);
  if (
    !ok ||
    payload.aud !== projectId ||
    payload.iss !== `https://securetoken.google.com/${projectId}` ||
    payload.exp < now ||
    !payload.sub
  ) {
    throw new Error('invalid token');
  }
  return payload;
}

export async function requireAuth(request, env) {
  const pid = env?.FIREBASE_PROJECT_ID;
  if (!pid) return { ok: false, response: json({ ok: false, error: 'server' }, 500) };

  const authHeader = request.headers.get('Authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!bearer) return { ok: false, response: json({ ok: false, error: 'login' }, 401) };

  try {
    const user = await verifyIdToken(bearer, pid);
    return { ok: true, user };
  } catch {
    return { ok: false, response: json({ ok: false, error: 'login' }, 401) };
  }
}

export async function requireAdmin(request, env) {
  const authRes = await requireAuth(request, env);
  if (!authRes.ok) return authRes;
  if (authRes.user?.admin !== true) {
    return { ok: false, response: json({ ok: false, error: 'forbidden' }, 403) };
  }
  return authRes;
}

// ২) Google OAuth2 Service Account Access Token
export async function getAccessToken(env, scope = 'https://www.googleapis.com/auth/datastore') {
  if (!env?.FIREBASE_CLIENT_EMAIL || !env?.FIREBASE_PRIVATE_KEY) {
    throw new Error('missing service account credentials');
  }
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = b64u(
    enc.encode(
      JSON.stringify({
        iss: env.FIREBASE_CLIENT_EMAIL,
        scope,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      })
    )
  );
  const pem = env.FIREBASE_PRIVATE_KEY
    .replace(/\\n/g, '\n')
    .replace(/-----[^-]+-----/g, '')
    .replace(/\s+/g, '');
  const der = b64ToBytes(pem);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    enc.encode(`${head}.${claim}`)
  );
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${claim}.${b64u(sig)}`,
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('service auth failed');
  return j.access_token;
}

export async function deleteAuthUser(env, uid) {
  const pid = env.FIREBASE_PROJECT_ID;
  const token = await getAccessToken(
    env,
    'https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform'
  );
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(pid)}/accounts:delete`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ localId: uid }),
    }
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    // Ignore USER_NOT_FOUND so deletion remains idempotent if Auth record is already gone
    if (!errText.includes('USER_NOT_FOUND')) {
      throw new Error(`auth delete failed: ${res.status} ${errText}`);
    }
  }
  return true;
}

// ৩) PIN PBKDF2 WebCrypto Helpers
export function isWeakPin(pin) {
  if (!/^\d{6}$/.test(pin)) return true;
  if (/^(\d)\1{5}$/.test(pin)) return true; // 000000, 111111, etc.
  if ('0123456789'.includes(pin)) return true; // 012345, 123456, etc.
  if ('9876543210'.includes(pin)) return true; // 987654, 654321, etc.
  if (/^(\d{2})\1\1$/.test(pin)) return true; // 121212, 101010
  if (/^(\d{3})\1$/.test(pin)) return true; // 123123
  if (/^(\d)\1(\d)\2(\d)\3$/.test(pin)) return true; // 112233, 001122
  if (['123321', '654456', '102030', '696969', '159753'].includes(pin)) return true;
  return false;
}

export function randomSaltB64(len = 16) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return bytesToB64(bytes);
}

export async function hashPin(pin, saltB64) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(String(pin)),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: b64ToBytes(saltB64),
      iterations: PIN_PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return bytesToB64(new Uint8Array(bits));
}

export function constantTimeEqual(a, b) {
  const ba = enc.encode(String(a || ''));
  const bb = enc.encode(String(b || ''));
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

// ৪) Firestore REST Value Converters & CRUD Helpers
export function toFsValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map((item) => toFsValue(item)) } };
  }
  if (typeof val === 'object') {
    if (val._type === 'timestamp' && val.value) {
      return { timestampValue: val.value };
    }
    return { mapValue: { fields: toFsFields(val) } };
  }
  return { stringValue: String(val) };
}

export function toFsFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined) continue;
    fields[k] = toFsValue(v);
  }
  return fields;
}

export function fromFsValue(v) {
  if (!v || typeof v !== 'object') return undefined;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return Boolean(v.booleanValue);
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) {
    return (v.arrayValue?.values || []).map((item) => fromFsValue(item));
  }
  if ('mapValue' in v) {
    const out = {};
    for (const [k, mv] of Object.entries(v.mapValue?.fields || {})) {
      out[k] = fromFsValue(mv);
    }
    return out;
  }
  return null;
}

export function fromFsDoc(doc) {
  if (!doc || !doc.name) return null;
  const parts = doc.name.split('/');
  const id = parts[parts.length - 1];
  const data = {};
  for (const [k, v] of Object.entries(doc.fields || {})) {
    data[k] = fromFsValue(v);
  }
  return { id, _name: doc.name, ...data };
}

export async function fsCtx(env, scope = 'https://www.googleapis.com/auth/datastore') {
  const pid = env.FIREBASE_PROJECT_ID;
  const at = await getAccessToken(env, scope);
  const dbName = `projects/${pid}/databases/(default)`;
  const api = `https://firestore.googleapis.com/v1/${dbName}/documents`;
  const headers = { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' };
  return { pid, dbName, api, headers };
}

export async function fsGet(ctx, docPath, tx) {
  const qs = tx ? `?transaction=${encodeURIComponent(tx)}` : '';
  const res = await fetch(`${ctx.api}/${docPath}${qs}`, { headers: ctx.headers });
  if (res.status === 404) {
    return { exists: false, doc: null, fields: {}, data: null, status: 404 };
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`fsGet ${docPath} failed: ${res.status} ${t}`);
  }
  const doc = await res.json();
  return {
    exists: true,
    doc,
    fields: doc.fields || {},
    data: fromFsDoc(doc),
    status: res.status,
  };
}

export async function fsPatch(ctx, docPath, data, maskFields, currentExists) {
  const params = new URLSearchParams();
  const keys = maskFields || Object.keys(data);
  keys.forEach((f) => params.append('updateMask.fieldPaths', f));
  if (typeof currentExists === 'boolean') {
    params.set('currentDocument.exists', String(currentExists));
  }
  const res = await fetch(`${ctx.api}/${docPath}?${params.toString()}`, {
    method: 'PATCH',
    headers: ctx.headers,
    body: JSON.stringify({ fields: toFsFields(data) }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`fsPatch ${docPath} failed: ${res.status} ${t}`);
  }
  return fromFsDoc(await res.json());
}

export async function fsDelete(ctx, docPath) {
  const res = await fetch(`${ctx.api}/${docPath}`, {
    method: 'DELETE',
    headers: ctx.headers,
  });
  if (res.status === 404) return false;
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`fsDelete ${docPath} failed: ${res.status} ${t}`);
  }
  return true;
}

export async function fsList(ctx, collectionPath, pageSize = 200) {
  const docs = [];
  let pageToken = '';
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({ pageSize: String(pageSize) });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`${ctx.api}/${collectionPath}?${params.toString()}`, {
      headers: ctx.headers,
    });
    if (res.status === 404) break;
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`fsList ${collectionPath} failed: ${res.status} ${t}`);
    }
    const body = await res.json();
    for (const d of body.documents || []) {
      const parsed = fromFsDoc(d);
      if (parsed) docs.push(parsed);
    }
    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }
  return docs;
}

export async function fsRunQuery(ctx, structuredQuery, parentPath = '') {
  const url = parentPath
    ? `${ctx.api}/${parentPath}:runQuery`
    : `${ctx.api}:runQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: ctx.headers,
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`fsRunQuery failed: ${res.status} ${t}`);
  }
  const rows = await res.json();
  const docs = [];
  for (const row of rows || []) {
    if (row.document) {
      const parsed = fromFsDoc(row.document);
      if (parsed) docs.push(parsed);
    }
  }
  return docs;
}

export async function fsBeginTx(ctx, readWrite = true) {
  const res = await fetch(`${ctx.api}:beginTransaction`, {
    method: 'POST',
    headers: ctx.headers,
    body: JSON.stringify({ options: readWrite ? { readWrite: {} } : { readOnly: {} } }),
  });
  if (!res.ok) throw new Error(`beginTransaction failed: ${res.status}`);
  const j = await res.json();
  if (!j.transaction) throw new Error('no transaction id');
  return j.transaction;
}

export async function fsCommitTx(ctx, tx, writes) {
  const res = await fetch(`${ctx.api}:commit`, {
    method: 'POST',
    headers: ctx.headers,
    body: JSON.stringify({ transaction: tx, writes }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, status: res.status, text };
  }
  return { ok: true, status: res.status, data: await res.json() };
}

export async function fsRollbackTx(ctx, tx) {
  if (!tx) return;
  await fetch(`${ctx.api}:rollback`, {
    method: 'POST',
    headers: ctx.headers,
    body: JSON.stringify({ transaction: tx }),
  }).catch(() => {});
}

export async function fsDeleteCollection(ctx, collectionPath) {
  const docs = await fsList(ctx, collectionPath, 300);
  for (const d of docs) {
    await fsDelete(ctx, `${collectionPath}/${d.id}`);
  }
  return docs.length;
}

export function tsValue(isoString) {
  return { _type: 'timestamp', value: isoString || new Date().toISOString() };
}

export function txUpdateWrite(ctx, docPath, data, maskFields, currentDocument, updateTransforms) {
  const write = {
    update: {
      name: `${ctx.dbName}/documents/${docPath}`,
      fields: toFsFields(data),
    },
    updateMask: {
      fieldPaths: maskFields || Object.keys(data),
    },
  };
  if (currentDocument) write.currentDocument = currentDocument;
  if (updateTransforms && updateTransforms.length > 0) write.updateTransforms = updateTransforms;
  return write;
}

export function txDeleteWrite(ctx, docPath) {
  return { delete: `${ctx.dbName}/documents/${docPath}` };
}

// ৫) PIN যাচাই + ৫ বার ভুলে ১৫ মিনিট লক (Transaction-safe)
export async function verifyAndTrackUserPin(ctx, uid, pin) {
  if (!/^\d{6}$/.test(String(pin || ''))) {
    return { ok: false, error: 'wrong_pin', status: 400 };
  }

  const pinPath = `pins/${uid}`;
  const userPath = `users/${uid}`;
  const tx = await fsBeginTx(ctx, true);

  try {
    const [uRes, pRes] = await Promise.all([
      fsGet(ctx, userPath, tx),
      fsGet(ctx, pinPath, tx),
    ]);

    if (!uRes.exists) {
      await fsRollbackTx(ctx, tx);
      return { ok: false, error: 'no-profile', status: 404 };
    }

    const pinDoc = pRes.data;
    const hasPin = uRes.data.pinSet === true && pinDoc && pinDoc.pinHash && pinDoc.pinSalt;
    if (!hasPin) {
      await fsRollbackTx(ctx, tx);
      return { ok: false, error: 'no_pin', status: 400 };
    }

    const nowMs = Date.now();
    const lockedUntilMs = pinDoc.pinLockedUntil ? Date.parse(pinDoc.pinLockedUntil) || 0 : 0;
    if (lockedUntilMs > nowMs) {
      await fsRollbackTx(ctx, tx);
      return { ok: false, error: 'pin_locked', status: 423 };
    }

    const computed = await hashPin(pin, pinDoc.pinSalt);
    const matches = constantTimeEqual(computed, pinDoc.pinHash);

    if (!matches) {
      const nextFails = (Number(pinDoc.pinFailCount) || 0) + 1;
      const shouldLock = nextFails >= PIN_MAX_FAILS;
      const updateData = {
        pinFailCount: shouldLock ? 0 : nextFails,
        pinLockedUntil: shouldLock ? tsValue(new Date(nowMs + PIN_LOCK_MS).toISOString()) : null,
        updatedAt: tsValue(new Date(nowMs).toISOString()),
      };
      const commitRes = await fsCommitTx(ctx, tx, [
        txUpdateWrite(ctx, pinPath, updateData, ['pinFailCount', 'pinLockedUntil', 'updatedAt'], { exists: true }),
      ]);
      if (!commitRes.ok) return { ok: false, error: 'busy', status: 409 };
      return {
        ok: false,
        error: shouldLock ? 'pin_locked' : 'wrong_pin',
        status: shouldLock ? 423 : 403,
      };
    }

    // Success: reset fail counter if needed
    if ((Number(pinDoc.pinFailCount) || 0) > 0 || pinDoc.pinLockedUntil) {
      const commitRes = await fsCommitTx(ctx, tx, [
        txUpdateWrite(
          ctx,
          pinPath,
          { pinFailCount: 0, pinLockedUntil: null, updatedAt: tsValue(new Date(nowMs).toISOString()) },
          ['pinFailCount', 'pinLockedUntil', 'updatedAt'],
          { exists: true }
        ),
      ]);
      if (!commitRes.ok) return { ok: false, error: 'busy', status: 409 };
    } else {
      await fsRollbackTx(ctx, tx);
    }

    return { ok: true, userDoc: uRes.data };
  } catch (err) {
    await fsRollbackTx(ctx, tx);
    throw err;
  }
}
