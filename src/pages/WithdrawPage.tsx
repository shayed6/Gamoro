import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Wallet } from 'lucide-react';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { submitWithdrawRequest } from '../lib/api';
import { formatBdt, formatUsd, fsTsToIso, toBn } from '../lib/format';
import type { WithdrawConfig, WithdrawalRecord, WithdrawalStatus } from '../types';
import { WithdrawalTracker } from '../components/WithdrawalTracker';
import { CardSkeleton, EmptyState } from '../components/Skeleton';

const DEFAULT_WD_CFG: WithdrawConfig = {
  usdToBdt: 110,
  carryBelowUsd: 1,
  mobileRechargeMin: 1,
  mobileRechargeMax: 19.99,
  binanceMin: 10,
  giftCardMin: 20,
  donationMin: 1,
  maxPending: 1,
};

export const WithdrawPage: React.FC = () => {
  const { user, profile, refreshUserData } = useAuth();
  const { showToast } = useToast();

  const [cfg, setCfg] = useState<WithdrawConfig>(DEFAULT_WD_CFG);
  const [donationOrgs, setDonationOrgs] = useState<Array<{ id: string; name: string; active: boolean }>>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [method, setMethod] = useState<string>('mobile_recharge');
  const [amountInput, setAmountInput] = useState('1.00');
  const [operator, setOperator] = useState('gp');
  const [binanceId, setBinanceId] = useState('');
  const [giftBrand, setGiftBrand] = useState('google_play');
  const [orgId, setOrgId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Recent-login re-authentication state
  const [needsReauth, setNeedsReauth] = useState(false);
  const [reauthPass, setReauthPass] = useState('');

  const loadWithdrawData = useCallback(async () => {
    if (!user) {
      setLoadingList(false);
      return;
    }
    setLoadingList(true);
    try {
      const [cfgSnap, donSnap] = await Promise.all([
        getDoc(doc(db, 'config', 'withdraw')),
        getDoc(doc(db, 'config', 'donation')),
      ]);

      if (cfgSnap.exists()) {
        const d = cfgSnap.data();
        setCfg({
          usdToBdt: Number(d.usdToBdt || 110),
          carryBelowUsd: Number(d.carryBelowUsd ?? 1),
          mobileRechargeMin: Number(d.mobileRechargeMin ?? 1),
          mobileRechargeMax: Number(d.mobileRechargeMax ?? 19.99),
          binanceMin: Number(d.binanceMin ?? 10),
          giftCardMin: Number(d.giftCardMin ?? 20),
          donationMin: Number(d.donationMin ?? 1),
          maxPending: Number(d.maxPending ?? 1),
        });
      }

      if (donSnap.exists()) {
        const orgs = Array.isArray(donSnap.data()?.orgs)
          ? (donSnap.data().orgs as Array<{ id: string; name: string; active: boolean }>).filter(
              (o) => o && o.active
            )
          : [];
        setDonationOrgs(orgs);
        if (orgs.length > 0 && !orgId) setOrgId(orgs[0].id);
      }

      const wdSnap = await getDocs(
        query(
          collection(db, 'withdrawals'),
          where('uid', '==', user.uid),
          orderBy('createdAt', 'desc'),
          limit(20)
        )
      );
      setWithdrawals(
        wdSnap.docs.map((docItem) => {
          const w = docItem.data();
          return {
            id: docItem.id,
            uid: String(w.uid || user.uid),
            method: String(w.method || ''),
            methodLabel: String(w.methodLabel || w.method || ''),
            label: String(w.label || w.accountDetails || w.accountNo || ''),
            amountUsd: Number(w.amountUsd || 0),
            amountBdt: Number(w.amountBdt || 0),
            status: (w.status as WithdrawalStatus) || 'pending',
            txId: w.txId ? String(w.txId) : undefined,
            rejectReason: w.rejectReason ? String(w.rejectReason) : undefined,
            submittedAt: fsTsToIso(w.submittedAt || w.createdAt),
            verifyingAt: fsTsToIso(w.verifyingAt),
            approvedAt: fsTsToIso(w.approvedAt),
            sentAt: fsTsToIso(w.sentAt || w.paidAt),
            rejectedAt: fsTsToIso(w.rejectedAt),
            createdAt: fsTsToIso(w.createdAt),
          };
        })
      );
    } catch {
      // ignore missing index fallback if needed
      try {
        const paySnap = await getDocs(
          query(collection(db, 'users', user.uid, 'payouts'), orderBy('createdAt', 'desc'), limit(20))
        );
        setWithdrawals(
          paySnap.docs.map((d) => {
            const w = d.data();
            return {
              id: d.id,
              uid: user.uid,
              method: String(w.methodKey || w.method || ''),
              methodLabel: String(w.method || ''),
              label: String(w.label || w.accountDetails || ''),
              amountUsd: Number(w.amountUsd || 0),
              amountBdt: Number(w.amountBdt || 0),
              status: (w.status as WithdrawalStatus) || 'pending',
              txId: w.txId ? String(w.txId) : undefined,
              rejectReason: w.rejectReason ? String(w.rejectReason) : undefined,
              submittedAt: fsTsToIso(w.submittedAt || w.createdAt),
              verifyingAt: fsTsToIso(w.verifyingAt),
              approvedAt: fsTsToIso(w.approvedAt),
              sentAt: fsTsToIso(w.sentAt || w.paidAt),
              rejectedAt: fsTsToIso(w.rejectedAt),
              createdAt: fsTsToIso(w.createdAt),
            };
          })
        );
      } catch {
        setWithdrawals([]);
      }
    } finally {
      setLoadingList(false);
    }
  }, [user, orgId]);

  useEffect(() => {
    void loadWithdrawData();
  }, [loadWithdrawData]);

  useEffect(() => {
    if (profile?.country === 'INTL' && method === 'mobile_recharge') {
      setMethod('binance');
      setAmountInput(String(cfg.binanceMin));
    }
  }, [profile?.country, method, cfg.binanceMin]);

  async function handleWithdrawSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !profile) return;
    if (!user.emailVerified) {
      showToast('উইথড্র করতে আগে ইমেইল ভেরিফাই করুন।', 'error');
      return;
    }

    const amt = Number(amountInput);
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast('সঠিক পরিমাণ লিখুন।', 'error');
      return;
    }
    if (amt > profile.balanceUsd) {
      showToast('আপনার পর্যাপ্ত ব্যালেন্স নেই।', 'error');
      return;
    }

    const details: Record<string, unknown> = {};
    if (method === 'mobile_recharge') details.operator = operator;
    if (method === 'binance') details.binanceId = binanceId.trim();
    if (method === 'gift_card') details.brand = giftBrand;
    if (method === 'donation') details.orgId = orgId;

    setSubmitting(true);
    try {
      const res = await submitWithdrawRequest({ method, amountUsd: amt, details });
      if (res.ok) {
        showToast('উইথড্রয়াল আবেদন সফলভাবে জমা হয়েছে!', 'success');
        await Promise.all([refreshUserData(), loadWithdrawData()]);
      } else if (res.error === 'recent_login_required') {
        setNeedsReauth(true);
        showToast('নিরাপত্তার জন্য পুনরায় লগইন নিশ্চিত করুন।', 'info');
      } else if (res.error === 'pending_exists') {
        showToast(res.message || 'আপনার একটি আবেদন আগে থেকেই প্রক্রিয়াধীন রয়েছে।', 'error');
      } else if (res.error === 'account_used') {
        showToast('এই পেমেন্ট অ্যাকাউন্ট অন্য ইউজার ব্যবহার করছেন।', 'error');
      } else if (res.error === 'below_min') {
        showToast('ন্যূনতম সীমার চেয়ে কম পরিমাণ দেওয়া যাবে না।', 'error');
      } else {
        showToast('আবেদন জমা দেওয়া যায়নি, তথ্য যাচাই করে আবার চেষ্টা করুন।', 'error');
      }
    } catch {
      showToast('সার্ভারের সাথে সংযোগ হয়নি।', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReauthGoogle() {
    if (!user) return;
    try {
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
      setNeedsReauth(false);
      showToast('পুনরায় যাচাই সফল! এখন আবেদন জমা দিন।', 'success');
    } catch {
      showToast('Google যাচাই ব্যর্থ হয়েছে।', 'error');
    }
  }

  async function handleReauthPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !user.email || !reauthPass) return;
    try {
      const cred = EmailAuthProvider.credential(user.email, reauthPass);
      await reauthenticateWithCredential(user, cred);
      setReauthPass('');
      setNeedsReauth(false);
      showToast('পাসওয়ার্ড যাচাই সফল! এখন আবেদন জমা দিন।', 'success');
    } catch {
      showToast('পাসওয়ার্ড সঠিক নয়।', 'error');
    }
  }

  if (!user) {
    return (
      <EmptyState
        icon={<Wallet className="h-6 w-6" />}
        title="উইথড্র ও স্ট্যাটাস দেখতে লগইন করুন"
        description="আপনার ব্যালেন্স তুলতে এবং চলমান আবেদনের প্রতিটি ধাপ ট্র্যাক করতে লগইন করুন।"
        action={
          <Link
            to="/auth"
            className="inline-flex min-h-[44px] items-center rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-bold text-white"
          >
            লগইন করুন
          </Link>
        }
      />
    );
  }

  const amtNum = Number(amountInput) || 0;
  const estBdt = Math.round(amtNum * cfg.usdToBdt);
  const isGoogleUser = user.providerData.some((p) => p.providerId === 'google.com');

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Request Form */}
      <section className="space-y-4 lg:col-span-5">
        <div className="rounded-2xl bg-gradient-to-br from-[#0D6E5B] to-[#084C3F] p-5 text-white">
          <p className="text-xs font-medium text-teal-100">উত্তোলনযোগ্য ব্যালেন্স</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">
            {formatUsd(profile?.balanceUsd)}
          </p>
          <p className="mt-1 text-xs text-teal-100">
            আনুমানিক {formatBdt((profile?.balanceUsd || 0) * cfg.usdToBdt)} (১ ডলার = {toBn(cfg.usdToBdt)} ৳)
          </p>
        </div>

        <form
          onSubmit={handleWithdrawSubmit}
          className="space-y-4 rounded-2xl border border-emerald-950/10 bg-white p-5 dark:border-emerald-200/10 dark:bg-[#11221C]"
        >
          <h1 className="text-lg font-bold">নতুন উইথড্রয়াল আবেদন</h1>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">
              পেমেন্ট পদ্ধতি
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm font-semibold outline-none dark:border-slate-700 dark:bg-slate-900"
            >
              {profile?.country !== 'INTL' && (
                <option value="mobile_recharge">
                  মোবাইল রিচার্জ (${cfg.mobileRechargeMin} – ${cfg.mobileRechargeMax})
                </option>
              )}
              {profile?.country === 'INTL' && (
                <option value="binance">Binance Pay (ন্যূনতম ${cfg.binanceMin})</option>
              )}
              <option value="gift_card">গিফট কার্ড (ন্যূনতম ${cfg.giftCardMin})</option>
              {donationOrgs.length > 0 && (
                <option value="donation">ডোনেশন (ন্যূনতম ${cfg.donationMin})</option>
              )}
            </select>
          </div>

          {method === 'mobile_recharge' && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">
                  অপারেটর
                </label>
                <select
                  value={operator}
                  onChange={(e) => setOperator(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="gp">গ্রামীণফোন</option>
                  <option value="robi">রবি</option>
                  <option value="bl">বাংলালিংক</option>
                  <option value="airtel">এয়ারটেল</option>
                  <option value="teletalk">টেলিটক</option>
                </select>
              </div>
              <p className="rounded-xl bg-[#F4FAF7] px-3 py-2 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                নিবন্ধিত নম্বর: <span className="font-bold">{profile?.mobile || 'নম্বর যুক্ত নেই'}</span>
              </p>
            </div>
          )}

          {method === 'binance' && (
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">
                Binance Pay ID
              </label>
              <input
                type="text"
                value={binanceId}
                onChange={(e) => setBinanceId(e.target.value)}
                placeholder="আপনার Binance Pay ID দিন"
                className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          )}

          {method === 'gift_card' && (
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">
                গিফট কার্ড ব্র্যান্ড
              </label>
              <select
                value={giftBrand}
                onChange={(e) => setGiftBrand(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="google_play">Google Play গিফট কার্ড</option>
                <option value="other">অন্যান্য গিফট কার্ড</option>
              </select>
            </div>
          )}

          {method === 'donation' && donationOrgs.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">
                সংস্থা নির্বাচন করুন
              </label>
              <select
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
              >
                {donationOrgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">
              পরিমাণ (USD)
            </label>
            <input
              type="number"
              step="0.01"
              min="1"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm font-bold tabular-nums outline-none dark:border-slate-700 dark:bg-slate-900"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              বাংলাদেশি টাকায় প্রায় {formatBdt(estBdt)}
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="min-h-[44px] w-full rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {submitting ? 'আবেদন পাঠানো হচ্ছে...' : 'আবেদন জমা দিন'}
          </button>
        </form>

        {needsReauth && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/60">
            <h3 className="flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-200">
              <ShieldCheck className="h-4 w-4" />
              <span>নিরাপত্তা যাচাই (গত ৫ মিনিটে লগইন প্রয়োজন)</span>
            </h3>
            {isGoogleUser ? (
              <button
                type="button"
                onClick={handleReauthGoogle}
                className="mt-3 min-h-[40px] w-full rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700"
              >
                Google দিয়ে পুনরায় যাচাই করুন
              </button>
            ) : (
              <form onSubmit={handleReauthPassword} className="mt-3 flex gap-2">
                <input
                  type="password"
                  value={reauthPass}
                  onChange={(e) => setReauthPass(e.target.value)}
                  placeholder="আপনার পাসওয়ার্ড দিন"
                  className="flex-1 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs outline-none dark:bg-slate-900"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-amber-700 px-3.5 py-2 text-xs font-bold text-white"
                >
                  যাচাই
                </button>
              </form>
            )}
          </div>
        )}
      </section>

      {/* Status Tracker List */}
      <section className="space-y-4 lg:col-span-7">
        <div>
          <h2 className="text-xl font-bold">উইথড্রয়াল স্ট্যাটাস ট্র্যাকার</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            প্রতিটি ধাপের অবস্থা (জমা → যাচাই → অনুমোদিত → পাঠানো হয়েছে) এখানে রিয়েল-টাইমে দেখুন।
          </p>
        </div>

        {loadingList ? (
          <div className="space-y-3">
            <CardSkeleton lines={3} />
            <CardSkeleton lines={3} />
          </div>
        ) : withdrawals.length === 0 ? (
          <EmptyState
            icon={<Wallet className="h-6 w-6" />}
            title="এখনো কোনো উইথড্রয়াল আবেদন নেই"
            description="বাম পাশের ফর্ম ব্যবহার করে আপনার প্রথম আবেদন জমা দিন।"
          />
        ) : (
          <div className="space-y-3">
            {withdrawals.map((item) => (
              <WithdrawalTracker key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
