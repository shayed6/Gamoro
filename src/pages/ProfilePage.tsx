import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  Check,
  HelpCircle,
  LogOut,
  Pencil,
  ShieldAlert,
  Trash2,
  Trophy,
  User,
  Wallet,
} from 'lucide-react';
import { collection, doc, getDoc, getDocs, limit, query, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatUsd, toBn } from '../lib/format';
import { ShareReferralCard } from '../components/ShareReferralCard';
import { EmptyState } from '../components/Skeleton';
import type { ReferralConfig, ReferralEntry } from '../types';
import { syncReferralInit } from '../lib/api';

export const ProfilePage: React.FC = () => {
  const { user, profile, referralCount, isAdmin, refreshUserData, logout } = useAuth();
  const { showToast } = useToast();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(profile?.name || '');
  const [savingName, setSavingName] = useState(false);
  const [referrals, setReferrals] = useState<ReferralEntry[]>([]);
  const [refCfg, setRefCfg] = useState<ReferralConfig>({
    totalBonus: 1000,
    referrerPercent: 80,
    inviteePercent: 20,
    requiredHours: 25,
    waitDays: 0,
  });

  useEffect(() => {
    if (profile?.name) setNameInput(profile.name);
  }, [profile?.name]);

  useEffect(() => {
    if (!user) return;
    async function loadReferralsAndConfig() {
      try {
        if (!profile?.ownCode) {
          await syncReferralInit().catch(() => {});
        }
        const [cfgSnap, listSnap] = await Promise.all([
          getDoc(doc(db, 'config', 'referral')),
          getDocs(query(collection(db, 'users', user!.uid, 'referrals'), limit(50))),
        ]);
        if (cfgSnap.exists()) {
          const cd = cfgSnap.data();
          setRefCfg({
            totalBonus: Number(cd.totalBonus ?? 1000),
            referrerPercent: Number(cd.referrerPercent ?? 80),
            inviteePercent: Number(cd.inviteePercent ?? 20),
            requiredHours: Number(cd.requiredHours ?? 25),
            waitDays: Number(cd.waitDays ?? 0),
          });
        }
        setReferrals(
          listSnap.docs.map((d) => {
            const rd = d.data();
            return {
              id: d.id,
              maskedName: String(rd.maskedName || 'বন্ধু'),
              verified: Boolean(rd.verified),
              playedMinutes: Number(rd.playedMinutes || 0),
              status: String(rd.status || 'pending'),
              referrerReward: Number(rd.referrerReward || 0),
            };
          })
        );
      } catch {
        // non-fatal
      }
    }
    void loadReferralsAndConfig();
  }, [user, profile?.ownCode]);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed.length > 100) {
      showToast('সঠিক নাম লিখুন (১–১০০ অক্ষর)।', 'error');
      return;
    }
    setSavingName(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { name: trimmed });
      await refreshUserData();
      setEditingName(false);
      showToast('নাম সফলভাবে আপডেট হয়েছে!', 'success');
    } catch (err) {
      handleFirestoreError(err, 'update', `users/${user.uid}`);
      showToast('নাম আপডেট করা যায়নি।', 'error');
    } finally {
      setSavingName(false);
    }
  }

  if (!user) {
    return (
      <EmptyState
        icon={<User className="h-6 w-6" />}
        title="আপনি এখনো লগইন করেননি"
        description="আপনার প্রোফাইল, রেফারেল লিংক, ব্যাজ এবং উইথড্রয়াল হিস্ট্রি দেখতে লগইন বা সাইন আপ করুন।"
        action={
          <Link
            to="/auth"
            className="inline-flex min-h-[44px] items-center rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-bold text-white"
          >
            লগইন / সাইন আপ করুন
          </Link>
        }
      />
    );
  }

  const earnedReferralBonus = referrals.reduce((sum, r) => sum + Number(r.referrerReward || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header Profile Card */}
      <section className="rounded-2xl border border-emerald-950/10 bg-white p-5 shadow-sm dark:border-emerald-200/10 dark:bg-[#11221C]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-700 text-xl font-bold text-white">
              {(profile?.name || user.email || 'G').charAt(0).toUpperCase()}
            </div>
            <div>
              {editingName ? (
                <form onSubmit={handleSaveName} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="rounded-lg border border-teal-400 bg-transparent px-2.5 py-1 text-sm font-bold outline-none"
                  />
                  <button
                    type="submit"
                    disabled={savingName}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-white"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold">{profile?.name || 'খেলোয়াড়'}</h1>
                  <button
                    type="button"
                    onClick={() => setEditingName(true)}
                    aria-label="নাম পরিবর্তন"
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {profile?.email || user.email} · {profile?.country === 'INTL' ? 'আন্তর্জাতিক' : 'বাংলাদেশ'}
              </p>
              {profile?.ownCode && (
                <p className="mt-1 text-xs font-semibold text-teal-700 dark:text-teal-300">
                  রেফারেল কোড: <span className="font-mono font-bold">{profile.ownCode}</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/withdraw"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-teal-800"
            >
              <Wallet className="h-4 w-4" />
              <span>উইথড্র ({formatUsd(profile?.balanceUsd)})</span>
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <LogOut className="h-4 w-4" />
              <span>লগআউট</span>
            </button>
          </div>
        </div>

        {/* Quick Route Tiles */}
        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Link
            to="/missions"
            className="flex items-center gap-2 rounded-xl bg-[#F4FAF7] p-3 text-xs font-bold text-[#112A22] hover:bg-teal-50 dark:bg-[#172C24] dark:text-[#ECF5F1]"
          >
            <Award className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            <span>মিশন ও ব্যাজ</span>
          </Link>
          <Link
            to="/leaderboard"
            className="flex items-center gap-2 rounded-xl bg-[#F4FAF7] p-3 text-xs font-bold text-[#112A22] hover:bg-teal-50 dark:bg-[#172C24] dark:text-[#ECF5F1]"
          >
            <Trophy className="h-4 w-4 text-amber-500" />
            <span>লিডারবোর্ড</span>
          </Link>
          <Link
            to="/faq"
            className="flex items-center gap-2 rounded-xl bg-[#F4FAF7] p-3 text-xs font-bold text-[#112A22] hover:bg-teal-50 dark:bg-[#172C24] dark:text-[#ECF5F1]"
          >
            <HelpCircle className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            <span>সাহায্য ও FAQ</span>
          </Link>
          {isAdmin ? (
            <Link
              to="/admin"
              className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-200"
            >
              <ShieldAlert className="h-4 w-4" />
              <span>অ্যাডমিন প্যানেল</span>
            </Link>
          ) : (
            <Link
              to="/delete-account"
              className="flex items-center gap-2 rounded-xl bg-rose-50/70 p-3 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300"
            >
              <Trash2 className="h-4 w-4" />
              <span>অ্যাকাউন্ট মুছুন</span>
            </Link>
          )}
        </div>
      </section>

      {/* Share & Referral Card */}
      <ShareReferralCard
        uid={user.uid}
        ownCode={profile?.ownCode}
        referralCount={Math.max(referralCount, referrals.length)}
        earnedBonusPoints={earnedReferralBonus}
      />

      {/* Referral Progress Table */}
      <section className="rounded-2xl border border-emerald-950/10 bg-white p-5 dark:border-emerald-200/10 dark:bg-[#11221C]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold">রেফারেল তালিকা ও শর্ত</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              মোট {toBn(refCfg.totalBonus)} পয়েন্ট ({toBn(refCfg.referrerPercent)}% আপনি /{' '}
              {toBn(refCfg.inviteePercent)}% বন্ধু) · ন্যূনতম খেলা {toBn(refCfg.requiredHours)} ঘণ্টা ·{' '}
              {refCfg.waitDays === 0
                ? 'শর্ত পূরণ হলে যাচাইয়ের পর বোনাস যোগ হয়'
                : `যাচাইয়ের জন্য ${toBn(refCfg.waitDays)} দিন অপেক্ষা`}
            </p>
          </div>
        </div>

        {referrals.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            এখনো কোনো বন্ধু আপনার রেফারেলে যোগ দেননি। ওপরের শেয়ার বাটন থেকে লিংক পাঠান!
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {referrals.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-[#F4FAF7] px-3.5 py-2.5 text-xs dark:border-slate-800 dark:bg-[#172C24]"
              >
                <div>
                  <p className="font-bold">{r.maskedName}</p>
                  <p className="text-slate-500 dark:text-slate-400">
                    খেলা: {toBn(Math.round(r.playedMinutes))} মিনিট · ইমেইল:{' '}
                    {r.verified ? 'ভেরিফাইড' : 'বাকি'}
                  </p>
                </div>
                <span className="font-bold text-teal-700 dark:text-teal-300">
                  {r.status === 'qualified'
                    ? `+${toBn(r.referrerReward)} পয়েন্ট`
                    : r.status === 'review'
                    ? 'যাচাই চলছে'
                    : r.status === 'rejected'
                    ? 'বাতিল'
                    : 'চলমান'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
