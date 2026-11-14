import { onAuthStateChanged } from 'firebase/auth';

const HEARTBEAT_INTERVAL_MS = 30000;
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
  let beatTimer = null;
  let activeMonitorTimer = null;
  let activeSinceChallenge = 0;
  let activeUid = null;
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
        sendHeartbeat();
        return { ok: true };
      }
      current = createMathChallenge();
      return { ok: false, challenge: { id: current.id, q: current.q } };
    });
  }

  async function sendHeartbeat() {
    if (!isActive() || inFlight) return;
    const user = auth?.currentUser;
    if (!user) return;

    inFlight = true;
    try {
      const token = await user.getIdToken();
      if (!auth?.currentUser || stopped || paused) return;

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ gameId }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError(data.error || 'heartbeat');
        return;
      }

      if (data.capReached) capReached = true;
      onHeartbeat(data);
      if (typeof data.points === 'number') {
        onPoints(data.points, data.addedPoints || 0, data);
      }
    } catch {
      onError('network');
    } finally {
      inFlight = false;
    }
  }

  function resetTimers() {
    clearInterval(beatTimer);
    clearInterval(activeMonitorTimer);
    beatTimer = null;
    activeMonitorTimer = null;
    activeSinceChallenge = 0;
    paused = false;
    capReached = false;
  }

  function startTimers() {
    resetTimers();
    if (!auth?.currentUser || stopped) return;

    lastAct = Date.now();
    sendHeartbeat();

    beatTimer = setInterval(() => {
      if (isActive()) sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    activeMonitorTimer = setInterval(() => {
      if (!isActive()) return;
      activeSinceChallenge++;
      if (challengeIntervalSec > 0 && activeSinceChallenge >= challengeIntervalSec) {
        triggerChallenge();
      }
    }, 1000);
  }

  const unsubscribeAuth = auth
    ? onAuthStateChanged(auth, (user) => {
        if (stopped) return;
        if (!user) {
          activeUid = null;
          resetTimers();
          return;
        }
        if (activeUid !== user.uid || !beatTimer) {
          activeUid = user.uid;
          startTimers();
        }
      })
    : () => {};

  return {
    stop() {
      stopped = true;
      resetTimers();
      if (typeof unsubscribeAuth === 'function') unsubscribeAuth();
      activityEvents.forEach((ev) => window.removeEventListener(ev, act, { capture: true }));
      window.removeEventListener('message', onMessage);
    },
  };
}
