export function startGamoroSession(opts) {
  const { auth, gameId, apiUrl, adSelector = '#gamoro-ad', idleSec = 60,
    onPoints = () => {}, onChallenge = () => {}, onAdsBlocked = () => {}, onError = () => {} } = opts;
  let sid = null, seq = 0, activeSec = 0, adSec = 0, lastAct = Date.now();
  let paused = false, stopped = false, lastToken = '', adRatio = 0, timer = null;

  const act = () => { lastAct = Date.now(); };
  ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel', 'scroll'].forEach((ev) =>
    window.addEventListener(ev, act, { passive: true, capture: true }));
  // একই ডোমেইনের iframe গেম থেকে সংকেত
  window.addEventListener('message', (e) => {
    if (e.origin === location.origin && e.data && e.data.type === 'gamoro-activity') act();
  });

  const adEl = document.querySelector(adSelector);
  if (adEl && 'IntersectionObserver' in window) {
    new IntersectionObserver((en) => { adRatio = en[0].intersectionRatio; }, { threshold: [0, 0.5, 1] }).observe(adEl);
  }
  // বিজ্ঞাপন সত্যিই দেখানো হলে বিজ্ঞাপনের কোড data-loaded="true" বসাবে
  const adVisible = () => !!adEl && adEl.dataset.loaded === 'true' && adRatio >= 0.5;

  setInterval(() => {
    if (paused || stopped || document.visibilityState !== 'visible') return;
    if (Date.now() - lastAct > idleSec * 1000) return;
    activeSec++;
    if (adVisible()) adSec++;
  }, 1000);

  async function call(body) {
    const user = auth.currentUser;
    if (!user) throw new Error('login');
    lastToken = await user.getIdToken();
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + lastToken },
      body: JSON.stringify(body),
    });
    let data = {};
    try { data = await res.json(); } catch {}
    return { ok: res.ok, data };
  }

  async function begin() {
    const platform = window.matchMedia('(display-mode: standalone)').matches ? 'app' : 'web';
    const r = await call({ action: 'start', gameId, platform });
    if (!r.ok) { onError(r.data.error || 'start'); return; }
    sid = r.data.sid; seq = 0;
    clearInterval(timer);
    timer = setInterval(checkpoint, (r.data.intervalSec || 600) * 1000);
  }

  function showChallenge(ch) {
    paused = true;
    onChallenge(ch, async (answer) => {
      const r = await call({ action: 'answer', sid, id: ch.id, answer });
      const ok = r.ok && r.data.ok === true;
      if (ok) { paused = false; lastAct = Date.now(); }
      return { ok, challenge: r.data && r.data.challenge };
    });
  }

  async function checkpoint() {
    if (!sid || stopped) return;
    const a = activeSec, v = adSec;
    activeSec = 0; adSec = 0;
    try {
      const r = await call({ action: 'checkpoint', sid, seq: seq + 1, activeSec: a, adVisibleSec: v });
      if (!r.ok) {
        if (['session_replaced', 'expired', 'seq', 'no_session'].includes(r.data.error)) await begin();
        else onError(r.data.error || 'checkpoint');
        return;
      }
      seq += 1;
      onPoints(r.data.points, r.data.credited);
      if (r.data.adsBlocked) onAdsBlocked();
      if (r.data.challenge) showChallenge(r.data.challenge);
    } catch { activeSec += a; adSec += v; }
  }

  function end() {
    if (!sid || stopped) return;
    stopped = true;
    const body = JSON.stringify({ action: 'end', sid, seq: seq + 1, activeSec, adVisibleSec: adSec, idToken: lastToken });
    navigator.sendBeacon(apiUrl, new Blob([body], { type: 'text/plain' }));
  }
  window.addEventListener('pagehide', end);

  begin();
  return { stop: end };
}
