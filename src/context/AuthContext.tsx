import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError } from '../lib/firebase';
import { fsTsToIso, getDhakaDate, getDhakaPeriod, getDhakaWeekId } from '../lib/format';
import {
  getReadNotificationIds,
  markAllNotificationsReadLocal,
  markNotificationReadLocal,
  savePendingReferral,
} from '../lib/storage';
import type { NotificationItem, UserProfile, WeeklyMissionProgress } from '../types';
import { WEEKLY_PRIMARY_MISSION } from '../data/missions';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  mission: WeeklyMissionProgress | null;
  notifications: NotificationItem[];
  unreadCount: number;
  readNotifIds: string[];
  referralCount: number;
  isAdmin: boolean;
  loading: boolean;
  refreshUserData: () => Promise<void>;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [mission, setMission] = useState<WeeklyMissionProgress | null>(null);
  const [rawNotifications, setRawNotifications] = useState<NotificationItem[]>([]);
  const [readNotifIds, setReadNotifIds] = useState<string[]>([]);
  const [referralCount, setReferralCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Capture ?ref= link attribution automatically in localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      savePendingReferral(ref);
    }
  }, []);

  const loadUserDetails = useCallback(async (u: User) => {
    try {
      const tokenRes = await u.getIdTokenResult();
      const claims = tokenRes.claims || {};
      setIsAdmin(claims.admin === true || claims.role === 'admin');
    } catch {
      setIsAdmin(false);
    }

    const currentPeriod = getDhakaPeriod(0);
    const weekId = getDhakaWeekId(0);
    setReadNotifIds(getReadNotificationIds(u.uid));

    try {
      const userSnap = await getDoc(doc(db, 'users', u.uid));
      if (userSnap.exists()) {
        const d = userSnap.data();
        const pts = d.pointsPeriod === currentPeriod ? Number(d.points || 0) : 0;
        const bal =
          typeof d.balanceUsd === 'number' ? d.balanceUsd : Number(d.balance || 0);
        setProfile({
          uid: u.uid,
          name: String(d.name || u.displayName || 'খেলোয়াড়'),
          email: String(d.email || u.email || ''),
          country: d.country === 'INTL' ? 'INTL' : 'BD',
          mobile: d.mobile ? String(d.mobile) : undefined,
          points: pts,
          pointsPeriod: String(d.pointsPeriod || currentPeriod),
          balanceUsd: Number(bal.toFixed(2)),
          totalEarnedUsd: Number(d.totalEarnedUsd || 0),
          streak: Number(d.streak || 0),
          lastClaimDate: d.lastClaimDate ? String(d.lastClaimDate) : '',
          lastActiveDate: d.lastActiveDate ? String(d.lastActiveDate) : '',
          totalActiveSec: Number(d.totalActiveSec || 0),
          totalActiveMinutes: Number(d.totalActiveMinutes || 0),
          ownCode: d.ownCode ? String(d.ownCode) : '',
          referredBy: d.referredBy ? String(d.referredBy) : '',
          referredByMasked: d.referredByMasked ? String(d.referredByMasked) : '',
          referralCode: d.referralCode ? String(d.referralCode) : null,
          status: d.status === 'suspended' ? 'suspended' : 'active',
          suspendReason: d.suspendReason ? String(d.suspendReason) : '',
          createdAt: fsTsToIso(d.createdAt),
        });
      } else {
        setProfile(null);
      }
    } catch (err) {
      handleFirestoreError(err, 'get', `users/${u.uid}`);
      setProfile(null);
    }

    // Fetch single weekly mission doc (max 1 read per session)
    try {
      const mSnap = await getDoc(doc(db, 'users', u.uid, 'missions', weekId));
      if (mSnap.exists()) {
        const md = mSnap.data();
        setMission({
          weekId,
          missionId: String(md.missionId || WEEKLY_PRIMARY_MISSION.id),
          title: String(md.title || WEEKLY_PRIMARY_MISSION.title),
          daysPlayed: Array.isArray(md.daysPlayed) ? md.daysPlayed.map(String) : [],
          targetDays: Number(md.targetDays || WEEKLY_PRIMARY_MISSION.targetDays),
          completed: Boolean(md.completed),
          rewardClaimed: Boolean(md.rewardClaimed),
          rewardPoints: Number(md.rewardPoints || WEEKLY_PRIMARY_MISSION.rewardPoints),
          badgeId: String(md.badgeId || WEEKLY_PRIMARY_MISSION.badgeId),
          completedAt: fsTsToIso(md.completedAt) || null,
        });
      } else {
        setMission({
          weekId,
          missionId: WEEKLY_PRIMARY_MISSION.id,
          title: WEEKLY_PRIMARY_MISSION.title,
          daysPlayed: [],
          targetDays: WEEKLY_PRIMARY_MISSION.targetDays,
          completed: false,
          rewardClaimed: false,
          rewardPoints: WEEKLY_PRIMARY_MISSION.rewardPoints,
          badgeId: WEEKLY_PRIMARY_MISSION.badgeId,
          completedAt: null,
        });
      }
    } catch {
      setMission(null);
    }

    // Fetch referrals count (for badges & profile)
    try {
      const refSnap = await getDocs(query(collection(db, 'users', u.uid, 'referrals'), limit(50)));
      setReferralCount(refSnap.size);
    } catch {
      setReferralCount(0);
    }

    // Fetch latest 20 in-app notifications (mark-as-read is localStorage only)
    try {
      const nSnap = await getDocs(
        query(
          collection(db, 'notifications', u.uid, 'items'),
          orderBy('createdAt', 'desc'),
          limit(20)
        )
      );
      const items: NotificationItem[] = nSnap.docs.map((d) => {
        const nd = d.data();
        return {
          id: d.id,
          type: (nd.type as NotificationItem['type']) || 'system',
          title: String(nd.title || ''),
          body: String(nd.body || ''),
          refId: nd.refId ? String(nd.refId) : undefined,
          createdAt: fsTsToIso(nd.createdAt) || new Date().toISOString(),
        };
      });
      setRawNotifications(items);
    } catch {
      setRawNotifications([]);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        await loadUserDetails(u);
      } else {
        setProfile(null);
        setMission(null);
        setRawNotifications([]);
        setReadNotifIds([]);
        setReferralCount(0);
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [loadUserDetails]);

  const refreshUserData = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      await auth.currentUser.reload();
    } catch {
      // ignore reload network issues
    }
    setUser(auth.currentUser);
    await loadUserDetails(auth.currentUser);
  }, [loadUserDetails]);

  // Inject zero-write client-side Streak Reminder notification if user has not claimed/played today
  const notifications = useMemo(() => {
    if (!user || !profile) return [];
    const today = getDhakaDate(0);
    const needsStreakReminder =
      profile.lastClaimDate !== today && profile.lastActiveDate !== today;

    const list = [...rawNotifications];
    if (needsStreakReminder) {
      const hasTodayStreak = list.some(
        (n) => n.type === 'streak' && n.refId === today
      );
      if (!hasTodayStreak) {
        list.unshift({
          id: `streak_reminder_${today}`,
          type: 'streak',
          title: 'আজকের স্ট্রিক রিমাইন্ডার',
          body: 'আপনার স্ট্রিক ভাঙার আগে আজ একবার খেলুন এবং দৈনিক বোনাস সংগ্রহ করুন!',
          refId: today,
          createdAt: new Date().toISOString(),
          synthetic: true,
        });
      }
    }
    return list;
  }, [user, profile, rawNotifications]);

  const unreadCount = useMemo(() => {
    const readSet = new Set(readNotifIds);
    return notifications.filter((n) => !readSet.has(n.id)).length;
  }, [notifications, readNotifIds]);

  const markNotificationRead = useCallback(
    (id: string) => {
      if (!user) return;
      setReadNotifIds(markNotificationReadLocal(user.uid, id));
    },
    [user]
  );

  const markAllNotificationsRead = useCallback(() => {
    if (!user) return;
    setReadNotifIds(
      markAllNotificationsReadLocal(
        user.uid,
        notifications.map((n) => n.id)
      )
    );
  }, [user, notifications]);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        mission,
        notifications,
        unreadCount,
        readNotifIds,
        referralCount,
        isAdmin,
        loading,
        refreshUserData,
        markNotificationRead,
        markAllNotificationsRead,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
