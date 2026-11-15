import { onAuthStateChanged, onIdTokenChanged } from 'firebase/auth';

const CHECKPOINT_SEC = 300;
const MAX_CLAIM_SEC = 330;
const CHALLENGE_INTERVAL_SEC = 900;

const bnDigits = '০১২৩৪৫৬৭৮৯';
function toBn(n) {
  return String(n).replace(/\d/g, (d) => bnDigits[d]);
}
function normalizeDigits(str) {
  return String(str || '').trim().replace(/[০-৯]/g, (d) => String(bnDigits.indexOf(d)));
}

export function startGamoroSession(opts) {
  const {
    auth,
    gameId,
    apiUrl = '/api/heartbeat',
    idleSec = 60,
    challengeIntervalSec = CHALLENGE_INTERVAL_SEC,
    onPoints = () => {},
    onHeartbeat = () => {},
    onChallenge = () => {},
    onError = () => {},
  } = opts;

  let lastAct = Date.now();
  let paused = false;
  let stopped = false;
  let activeMonitorTimer = null;
  let tokenRefreshTimer = null;
  let activeSinceChallenge = 0;
  let pendingSec = 0;
  let activeUid = null;
  let cachedToken = '';
  let inFlight = false;
  let capReached = false;

  const act = () => {
    if (!auth?.currentUser || stopped) return;
    lastAct = Date.now();
  };

  const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel', 'scroll'];
  activityEvents.forEach((ev) => window.addEventListener(ev, act, { passive: true, capture: true }));

  // একই ডোমেইনের iframe গেম থেকে সংকেত
  const onMessage = (e) => {
    if (e.origin === location.origin && e.data && e.data.type === 'gamoro-activity') act();
  };
  window.addEventListener('message', onMessage);

  function isActive() {
    if (!auth?.currentUser || paused || stopped || capReached) return false;
    if (document.visibilityState !== 'visible') return false;
    return Date.now() - lastAct <= idleSec * 1000;
  }

  async function refreshToken() {
    const user = auth?.currentUser;
    if (!user || stopped) {
      cachedToken = '';
      return '';
    }
    try {
      const t = await user.getIdToken();
      if (!stopped && auth?.currentUser?.uid === user.uid) {
        cachedToken = t;
      }
      return t;
    } catch {
      return cachedToken;
    }
  }

  function createMathChallenge() {
    const a = Math.floor(Math.random() * 9) + 2;
    const b = Math.floor(Math.random() * 9) + 1;
    return {
      id: `ch_${Date.now()}`,
      q: `${toBn(a)} + ${toBn(b)} = ?`,
      answer: String(a + b),
    };
  }

  function triggerChallenge() {
    if (paused || stopped || !auth?.currentUser) return;
    paused = true;
    let current = createMathChallenge();
    onChallenge({ id: current.id, q: current.q }, async (given) => {
      if (stopped || !auth?.currentUser) return { ok: false };
      if (normalizeDigits(given) === current.answer) {
        paused = false;
        activeSinceChallenge = 0;
        lastAct = Date.now();
        sendCheckpoint(true);
        return { ok: true };
      }
      current = createMathChallenge();
      return { ok: false, challenge: { id: current.id, q: current.q } };
    });
  }

  async function sendCheckpoint(forceZero = false) {
    if (stopped || inFlight) return;
    const user = auth?.currentUser;
    if (!user) return;
    if (!forceZero && (!isActive() || pendingSec < CHECKPOINT_SEC)) return;

    const sendSec = Math.max(0, Math.min(pendingSec, MAX_CLAIM_SEC));
    if (sendSec === 0 && !forceZero) return;

    pendingSec = Math.max(0, pendingSec - sendSec);
    inFlight = true;
    let didFinish = false;

    try {
      const token = await user.getIdToken();
      if (!stopped && auth?.currentUser?.uid === user.uid) {
        cachedToken = token;
      }
      if (!auth?.currentUser || stopped) return;

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ gameId, activeSec: sendSec }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status >= 500 && sendSec > 0) {
          pendingSec = Math.min(MAX_CLAIM_SEC, pendingSec + sendSec);
        }
        onError(data.error || 'heartbeat');
        return;
      }

      didFinish = true;
      if (data.capReached) capReached = true;
      onHeartbeat(data);
      if (typeof data.points === 'number') {
        onPoints(data.points, data.addedPoints || 0, data);
      }

      // চেকপয়েন্টের উত্তরেই 'আপনি কি এখনো আছেন?' চ্যালেঞ্জ ট্রিগার করা হবে
      if (
        !stopped &&
        !paused &&
        !capReached &&
        challengeIntervalSec > 0 &&
        activeSinceChallenge >= challengeIntervalSec
      ) {
        triggerChallenge();
      }
    } catch {
      if (!didFinish && sendSec > 0) {
        pendingSec = Math.min(MAX_CLAIM_SEC, pendingSec + sendSec);
      }
      onError('network');
    } finally {
      inFlight = false;
    }
  }

  const onPageHide = () => {
    const user = auth?.currentUser;
    if (!user || stopped || !activeUid || pendingSec <= 0 || !cachedToken) return;
    const flushSec = Math.max(0, Math.min(pendingSec, MAX_CLAIM_SEC));
    if (flushSec <= 0) return;
    pendingSec = 0;

    try {
      const payload = JSON.stringify({
        gameId,
        activeSec: flushSec,
        token: cachedToken,
      });
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon(apiUrl, blob);
      }
    } catch {
      // ignore beacon errors during unload
    }
  };
  window.addEventListener('pagehide', onPageHide);

  function resetTimers() {
    clearInterval(activeMonitorTimer);
    clearInterval(tokenRefreshTimer);
    activeMonitorTimer = null;
    tokenRefreshTimer = null;
    activeSinceChallenge = 0;
    pendingSec = 0;
    paused = false;
    capReached = false;
  }

  function startTimers() {
    resetTimers();
    if (!auth?.currentUser || stopped) return;

    lastAct = Date.now();
    refreshToken();
    sendCheckpoint(true);

    tokenRefreshTimer = setInterval(() => {
      refreshToken();
    }, 240000);

    activeMonitorTimer = setInterval(() => {
      if (!isActive()) return;
      pendingSec++;
      activeSinceChallenge++;
      if (pendingSec >= CHECKPOINT_SEC && !inFlight) {
        sendCheckpoint(false);
      }
    }, 1000);
  }

  const unsubscribeToken = auth
    ? onIdTokenChanged(auth, async (user) => {
        if (stopped || !user) {
          cachedToken = '';
          return;
        }
        try {
          cachedToken = await user.getIdToken();
        } catch {
          // ignore
        }
      })
    : () => {};

  const unsubscribeAuth = auth
    ? onAuthStateChanged(auth, (user) => {
        if (stopped) return;
        if (!user) {
          activeUid = null;
          cachedToken = '';
          resetTimers();
          return;
        }
        if (activeUid !== user.uid || !activeMonitorTimer) {
          activeUid = user.uid;
          startTimers();
        }
      })
    : () => {};

  return {
    stop() {
      stopped = true;
      resetTimers();
      cachedToken = '';
      if (typeof unsubscribeAuth === 'function') unsubscribeAuth();
      if (typeof unsubscribeToken === 'function') unsubscribeToken();
      activityEvents.forEach((ev) => window.removeEventListener(ev, act, { capture: true }));
      window.removeEventListener('message', onMessage);
      window.removeEventListener('pagehide', onPageHide);
    },
  };
}
