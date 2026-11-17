import { getDhakaWeekId } from './format';

const KEYS = {
  THEME: 'gamoro-theme',
  FAVORITES: 'gamoro:favorites',
  RECENT_GAMES: 'gamoro:recent-games',
  LOCAL_PLAY_COUNT: 'gamoro:play-count',
  READ_NOTIFS_PREFIX: 'gamoro:read-notifs:',
  VOTE_PREFIX: 'gamoro:game-vote:',
  PENDING_REF: 'gamoro:pending-ref',
  PUSH_ENABLED: 'gamoro:web-push-optin',
};

export interface RecentPlayEntry {
  gameId: string;
  playedAt: string;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

/* Favorites (localStorage only — 0 Firestore writes) */
export function getFavoriteGameIds(): string[] {
  const list = readJson<string[]>(KEYS.FAVORITES, []);
  return Array.isArray(list) ? list : [];
}

export function toggleFavoriteGameId(gameId: string): string[] {
  const current = new Set(getFavoriteGameIds());
  if (current.has(gameId)) {
    current.delete(gameId);
  } else {
    current.add(gameId);
  }
  const next = Array.from(current);
  writeJson(KEYS.FAVORITES, next);
  return next;
}

/* Recently Played ("আবার খেলুন") */
export function getRecentPlayed(): RecentPlayEntry[] {
  const list = readJson<RecentPlayEntry[]>(KEYS.RECENT_GAMES, []);
  return Array.isArray(list) ? list : [];
}

export function recordGamePlayed(gameId: string): RecentPlayEntry[] {
  const existing = getRecentPlayed().filter((entry) => entry.gameId !== gameId);
  const next: RecentPlayEntry[] = [{ gameId, playedAt: new Date().toISOString() }, ...existing].slice(0, 10);
  writeJson(KEYS.RECENT_GAMES, next);

  const count = getLocalPlayCount() + 1;
  try {
    localStorage.setItem(KEYS.LOCAL_PLAY_COUNT, String(count));
  } catch {
    // ignore
  }
  return next;
}

export function getLocalPlayCount(): number {
  try {
    return Number(localStorage.getItem(KEYS.LOCAL_PLAY_COUNT) || 0) || 0;
  } catch {
    return 0;
  }
}

/* Notifications mark-as-read (localStorage only — 0 Firestore writes) */
export function getReadNotificationIds(uid: string | null | undefined): string[] {
  if (!uid) return [];
  const list = readJson<string[]>(`${KEYS.READ_NOTIFS_PREFIX}${uid}`, []);
  return Array.isArray(list) ? list : [];
}

export function markNotificationReadLocal(uid: string | null | undefined, notifId: string): string[] {
  if (!uid) return [];
  const set = new Set(getReadNotificationIds(uid));
  set.add(notifId);
  const next = Array.from(set).slice(-200);
  writeJson(`${KEYS.READ_NOTIFS_PREFIX}${uid}`, next);
  return next;
}

export function markAllNotificationsReadLocal(uid: string | null | undefined, notifIds: string[]): string[] {
  if (!uid) return [];
  const set = new Set(getReadNotificationIds(uid));
  notifIds.forEach((id) => set.add(id));
  const next = Array.from(set).slice(-200);
  writeJson(`${KEYS.READ_NOTIFS_PREFIX}${uid}`, next);
  return next;
}

/* Weekly Game Rating / Vote Client Guard */
export interface LocalGameVote {
  weekId: string;
  upvote: boolean;
  stars: number;
  votedAt: string;
}

export function getWeeklyGameVote(gameId: string): LocalGameVote | null {
  const weekId = getDhakaWeekId(0);
  const stored = readJson<LocalGameVote | null>(`${KEYS.VOTE_PREFIX}${gameId}`, null);
  if (stored && stored.weekId === weekId) return stored;
  return null;
}

export function saveWeeklyGameVote(gameId: string, upvote: boolean, stars: number): LocalGameVote {
  const vote: LocalGameVote = {
    weekId: getDhakaWeekId(0),
    upvote,
    stars,
    votedAt: new Date().toISOString(),
  };
  writeJson(`${KEYS.VOTE_PREFIX}${gameId}`, vote);
  return vote;
}

/* Referral Link Attribution */
export function savePendingReferral(ref: string): void {
  if (!ref) return;
  try {
    localStorage.setItem(KEYS.PENDING_REF, ref.trim().slice(0, 64));
  } catch {
    // ignore
  }
}

export function getPendingReferral(): string {
  try {
    return localStorage.getItem(KEYS.PENDING_REF) || '';
  } catch {
    return '';
  }
}

export function clearPendingReferral(): void {
  try {
    localStorage.removeItem(KEYS.PENDING_REF);
  } catch {
    // ignore
  }
}

/* Theme & Web Push Opt-In */
export function getSavedTheme(): 'light' | 'dark' {
  try {
    const val = localStorage.getItem(KEYS.THEME);
    if (val === 'dark' || val === 'light') return val;
  } catch {
    // ignore
  }
  return 'light';
}

export function saveTheme(theme: 'light' | 'dark'): void {
  try {
    localStorage.setItem(KEYS.THEME, theme);
  } catch {
    // ignore
  }
}

export function isWebPushOptedIn(): boolean {
  try {
    return localStorage.getItem(KEYS.PUSH_ENABLED) === '1';
  } catch {
    return false;
  }
}

export function setWebPushOptIn(enabled: boolean): void {
  try {
    localStorage.setItem(KEYS.PUSH_ENABLED, enabled ? '1' : '0');
  } catch {
    // ignore
  }
}
