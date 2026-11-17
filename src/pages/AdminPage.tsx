import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  Ticket,
  Users,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { callAdminApi } from '../lib/api';
import { formatUsd, toBn } from '../lib/format';
import type {
  DailyAnalyticsPoint,
  SupportTicket,
  SuspiciousAlert,
  WithdrawalStatus,
} from '../types';
import { CardSkeleton, EmptyState } from '../components/Skeleton';

interface AdminPayoutRow {
  id: string;
  uid: string;
  userName: string;
  methodLabel?: string;
  method: string;
  accountNo: string;
  amountUsd: number;
  amountBdt: number;
  status: WithdrawalStatus;
  txId: string;
  createdAt: string;
}

type AdminTab = 'analytics' | 'alerts' | 'withdrawals' | 'tickets' | 'users';

export const AdminPage: React.FC = () => {
  const { user, isAdmin, loading } = useAuth();
  const { showToast } = useToast();

  const [tab, setTab] = useState<AdminTab>('analytics');
  const [busy, setBusy] = useState(false);

  // Analytics
  const [series, setSeries] = useState<DailyAnalyticsPoint[]>([]);
  const [latestStats, setLatestStats] = useState<DailyAnalyticsPoint>({
    date: '',
    newUsers: 0,
    dau: 0,
    mau: 0,
    totalPayoutsUsd: 0,
    pendingWithdrawalsCount: 0,
    pendingWithdrawalsUsd: 0,
  });

  // Alerts
  const [alerts, setAlerts] = useState<SuspiciousAlert[]>([]);

  // Withdrawals
  const [wdFilter, setWdFilter] = useState('pending');
  const [payouts, setPayouts] = useState<AdminPayoutRow[]>([]);

  // Tickets
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  // Users Search
  const [userQuery, setUserQuery] = useState('');
  const [usersResult, setUsersResult] = useState<
    Array<{ uid: string; name: string; email: string; balanceUsd: number; totalPoints: number; status: string }>
  >([]);

  const loadAnalytics = useCallback(async () => {
    setBusy(true);
    try {
      const res = await callAdminApi<{ latest: DailyAnalyticsPoint; series: DailyAnalyticsPoint[] }>(
        'analytics.overview'
      );
      if (res.ok) {
        setSeries(res.series || []);
        if (res.latest) setLatestStats(res.latest);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    setBusy(true);
    try {
      const res = await callAdminApi<{ alerts: SuspiciousAlert[] }>('alerts.list', { status: 'open' });
      if (res.ok) setAlerts(res.alerts || []);
    } finally {
      setBusy(false);
    }
  }, []);

  const loadWithdrawals = useCallback(async () => {
    setBusy(true);
    try {
      const res = await callAdminApi<{ payouts: AdminPayoutRow[] }>('payouts.list', {
        status: wdFilter,
      });
      if (res.ok) setPayouts(res.payouts || []);
    } finally {
      setBusy(false);
    }
  }, [wdFilter]);

  const loadTickets = useCallback(async () => {
    setBusy(true);
    try {
      const res = await callAdminApi<{ tickets: SupportTicket[] }>('tickets.list');
      if (res.ok) setTickets(res.tickets || []);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!user || !isAdmin) return;
    if (tab === 'analytics') void loadAnalytics();
    if (tab === 'alerts') void loadAlerts();
    if (tab === 'withdrawals') void loadWithdrawals();
    if (tab === 'tickets') void loadTickets();
  }, [user, isAdmin, tab, loadAnalytics, loadAlerts, loadWithdrawals, loadTickets]);

  async function handleRefreshRollup() {
    setBusy(true);
    try {
      const res = await callAdminApi('analytics.refreshDaily');
      if (res.ok) {
        showToast('দৈনিক অ্যানালিটিক্স সফলভাবে রিফ্রেশ হয়েছে।', 'success');
        await loadAnalytics();
      } else {
        showToast('রিফ্রেশ করা যায়নি।', 'error');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleAlertAction(id: string, action: 'alerts.review' | 'alerts.dismiss') {
    const res = await callAdminApi(action, { id });
    if (res.ok) {
      showToast(action === 'alerts.review' ? 'পর্যালোচিত হিসেবে চিহ্নিত।' : 'সতর্কতা খারিজ হয়েছে।', 'success');
      await loadAlerts();
    } else {
      showToast('আপডেট করা যায়নি।', 'error');
    }
  }

  async function handleSetWithdrawalStatus(
    id: string,
    status: 'verifying' | 'approved' | 'sent' | 'rejected'
  ) {
    const res = await callAdminApi('payouts.setStatus', {
      id,
      status,
      refundBalance: status === 'rejected',
      reason: status === 'rejected' ? 'যাচাইয়ে অনুমোদিত হয়নি' : undefined,
    });
    if (res.ok) {
      showToast('উইথড্রয়াল স্ট্যাটাস আপডেট ও ইউজারকে নোটিফাই করা হয়েছে।', 'success');
      await loadWithdrawals();
    } else {
      showToast('স্ট্যাটাস আপডেট করা যায়নি।', 'error');
    }
  }

  async function handleResolveTicket(id: string) {
    const res = await callAdminApi('tickets.resolve', { id });
    if (res.ok) {
      showToast('টিকিট সমাধান হিসেবে চিহ্নিত হয়েছে।', 'success');
      await loadTickets();
    }
  }

  async function handleSearchUsers(e: React.FormEvent) {
    e.preventDefault();
    if (!userQuery.trim()) return;
    setBusy(true);
    try {
      const res = await callAdminApi<{
        users: Array<{
          uid: string;
          name: string;
          email: string;
          balanceUsd: number;
          totalPoints: number;
          status: string;
        }>;
      }>('users.search', { query: userQuery.trim() });
      if (res.ok) setUsersResult(res.users || []);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleSuspend(uid: string, currentlySuspended: boolean) {
    const action = currentlySuspended ? 'users.unsuspend' : 'users.suspend';
    const res = await callAdminApi(action, {
      uid,
      reason: currentlySuspended ? undefined : 'সন্দেহজনক কার্যকলাপ',
    });
    if (res.ok) {
      showToast(currentlySuspended ? 'অ্যাকাউন্ট সক্রিয় করা হয়েছে।' : 'অ্যাকাউন্ট স্থগিত হয়েছে।', 'success');
      setUsersResult((prev) =>
        prev.map((u) =>
          u.uid === uid ? { ...u, status: currentlySuspended ? 'active' : 'suspended' } : u
        )
      );
    }
  }

  if (loading) {
    return <CardSkeleton lines={5} />;
  }

  if (!user || !isAdmin) {
    return (
      <EmptyState
        icon={<ShieldAlert className="h-6 w-6" />}
        title="শুধুমাত্র অ্যাডমিনের জন্য সংরক্ষিত"
        description="এই পেজে প্রবেশের জন্য আপনার অ্যাকাউন্টে Firebase Admin Custom Claim (role: admin অথবা admin: true) থাকতে হবে।"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Gamoro অ্যাডমিন অ্যানালিটিক্স</h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            প্রি-অ্যাগ্রিগেটেড দৈনিক রিপোর্ট, সন্দেহজনক সতর্কতা এবং উইথড্রয়াল পরিচালনা
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefreshRollup}
          disabled={busy}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
          <span>অ্যানালিটিক্স রিফ্রেশ</span>
        </button>
      </div>

      {/* Admin Tabs */}
      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-emerald-950/10 bg-white p-2 dark:border-emerald-200/10 dark:bg-[#11221C]">
        {[
          { id: 'analytics', label: 'অ্যানালিটিক্স', icon: BarChart3 },
          { id: 'alerts', label: 'সতর্কতা (Alerts)', icon: AlertTriangle },
          { id: 'withdrawals', label: 'উইথড্রয়াল', icon: Wallet },
          { id: 'tickets', label: 'সাপোর্ট টিকিট', icon: Ticket },
          { id: 'users', label: 'ইউজার খুঁজুন', icon: Users },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as AdminTab)}
              className={`flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${
                tab === item.id
                  ? 'bg-teal-700 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. ANALYTICS TAB */}
      {tab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 tabular-nums">
            <div className="rounded-2xl border border-emerald-950/10 bg-white p-4 dark:border-emerald-200/10 dark:bg-[#11221C]">
              <p className="text-xs text-slate-500 dark:text-slate-400">আজকের নতুন ইউজার</p>
              <p className="mt-1 text-2xl font-bold">{toBn(latestStats.newUsers)}</p>
            </div>
            <div className="rounded-2xl border border-emerald-950/10 bg-white p-4 dark:border-emerald-200/10 dark:bg-[#11221C]">
              <p className="text-xs text-slate-500 dark:text-slate-400">DAU / MAU</p>
              <p className="mt-1 text-2xl font-bold text-teal-700 dark:text-teal-300">
                {toBn(latestStats.dau)} / {toBn(latestStats.mau)}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-950/10 bg-white p-4 dark:border-emerald-200/10 dark:bg-[#11221C]">
              <p className="text-xs text-slate-500 dark:text-slate-400">মোট পেআউট ($)</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                {formatUsd(latestStats.totalPayoutsUsd)}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-950/10 bg-white p-4 dark:border-emerald-200/10 dark:bg-[#11221C]">
              <p className="text-xs text-slate-500 dark:text-slate-400">অপেক্ষমাণ উইথড্রয়াল</p>
              <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
                {toBn(latestStats.pendingWithdrawalsCount)}টি ({formatUsd(latestStats.pendingWithdrawalsUsd)})
              </p>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-emerald-950/10 bg-white p-5 dark:border-emerald-200/10 dark:bg-[#11221C]">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-bold">
                <Activity className="h-4 w-4 text-teal-600" />
                <span>দৈনিক ও মাসিক সক্রিয় খেলোয়াড় (DAU / MAU)</span>
              </h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="date" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Area type="monotone" dataKey="mau" name="MAU" stroke="#0D9488" fill="#0D9488" fillOpacity={0.18} />
                    <Area type="monotone" dataKey="dau" name="DAU" stroke="#059669" fill="#059669" fillOpacity={0.35} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-950/10 bg-white p-5 dark:border-emerald-200/10 dark:bg-[#11221C]">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-bold">
                <BarChart3 className="h-4 w-4 text-amber-500" />
                <span>নতুন ইউজার ও অপেক্ষমাণ উইথড্রয়াল</span>
              </h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="date" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="newUsers" name="নতুন ইউজার" fill="#0D9488" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="pendingWithdrawalsCount" name="অপেক্ষমাণ উইথড্র" fill="#F59E0B" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. SUSPICIOUS ALERTS TAB */}
      {tab === 'alerts' && (
        <div className="space-y-3">
          {alerts.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-6 w-6" />}
              title="কোনো খোলা সতর্কতা নেই"
              description="সব অ্যাকাউন্ট স্বাভাবিক অবস্থায় রয়েছে।"
            />
          ) : (
            alerts.map((al) => (
              <div
                key={al.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-white p-4 dark:border-rose-900/40 dark:bg-[#11221C]"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase text-rose-600 dark:text-rose-400">
                      {al.severity === 'high' ? 'উচ্চ ঝুঁকি' : 'মাঝারি ঝুঁকি'} · {al.type}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-bold">
                    {al.userName} ({al.uid})
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{al.details}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{al.createdAt}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleAlertAction(al.id, 'alerts.review')}
                    className="min-h-[38px] rounded-xl bg-teal-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-teal-800"
                  >
                    Review
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAlertAction(al.id, 'alerts.dismiss')}
                    className="min-h-[38px] rounded-xl border border-slate-200 px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 3. WITHDRAWALS TAB */}
      {tab === 'withdrawals' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'pending', label: 'জমা (Pending)' },
              { key: 'verifying', label: 'যাচাই চলছে' },
              { key: 'approved', label: 'অনুমোদিত' },
              { key: 'sent', label: 'পাঠানো হয়েছে' },
              { key: 'rejected', label: 'বাতিল' },
              { key: 'all', label: 'সবগুলো' },
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setWdFilter(f.key)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                  wdFilter === f.key
                    ? 'bg-teal-700 text-white'
                    : 'bg-white text-slate-600 dark:bg-[#11221C] dark:text-slate-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {payouts.length === 0 ? (
            <EmptyState
              icon={<Wallet className="h-6 w-6" />}
              title="এই ফিল্টারে কোনো আবেদন নেই"
              description="অন্যান্য ট্যাব বা ফিল্টার নির্বাচন করে দেখুন।"
            />
          ) : (
            <div className="space-y-3">
              {payouts.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-950/10 bg-white p-4 dark:border-emerald-200/10 dark:bg-[#11221C]"
                >
                  <div>
                    <p className="text-sm font-bold">
                      {p.userName} · {p.methodLabel || p.method} ({p.accountNo})
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      পরিমাণ: {formatUsd(p.amountUsd)} ({toBn(p.amountBdt)} ৳) · স্ট্যাটাস: {p.status}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{p.createdAt}</p>
                  </div>

                  {p.status !== 'sent' && p.status !== 'paid' && p.status !== 'rejected' && (
                    <div className="flex flex-wrap gap-2">
                      {p.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => void handleSetWithdrawalStatus(p.id, 'verifying')}
                          className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950"
                        >
                          যাচাই চলছে
                        </button>
                      )}
                      {(p.status === 'pending' || p.status === 'verifying') && (
                        <button
                          type="button"
                          onClick={() => void handleSetWithdrawalStatus(p.id, 'approved')}
                          className="rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-bold text-white"
                        >
                          অনুমোদন
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleSetWithdrawalStatus(p.id, 'sent')}
                        className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"
                      >
                        পাঠানো হয়েছে
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSetWithdrawalStatus(p.id, 'rejected')}
                        className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-bold text-white"
                      >
                        বাতিল ও রিফান্ড
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. SUPPORT TICKETS TAB */}
      {tab === 'tickets' && (
        <div className="space-y-3">
          {tickets.length === 0 ? (
            <EmptyState
              icon={<Ticket className="h-6 w-6" />}
              title="কোনো সাপোর্ট টিকিট নেই"
              description="ব্যবহারকারীরা FAQ পেজ থেকে টিকিট পাঠালে এখানে দেখাবে।"
            />
          ) : (
            tickets.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-emerald-950/10 bg-white p-4 dark:border-emerald-200/10 dark:bg-[#11221C]"
              >
                <div className="max-w-2xl">
                  <p className="text-xs font-bold text-teal-700 dark:text-teal-300">
                    {t.category} · {t.status === 'resolved' ? 'সমাধান হয়েছে' : 'অপেক্ষমাণ'}
                  </p>
                  <h3 className="mt-1 text-sm font-bold">{t.subject}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {t.message}
                  </p>
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    {t.name} ({t.email}) · {t.createdAt}
                  </p>
                </div>
                {t.status !== 'resolved' && (
                  <button
                    type="button"
                    onClick={() => void handleResolveTicket(t.id)}
                    className="rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-bold text-white"
                  >
                    সমাধান চিহ্নিত করুন
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* 5. USER SEARCH TAB */}
      {tab === 'users' && (
        <div className="space-y-4">
          <form onSubmit={handleSearchUsers} className="flex gap-2">
            <input
              type="text"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="ইউজার UID, ইমেইল, নাম বা মোবাইল লিখুন..."
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none dark:border-slate-700 dark:bg-[#11221C]"
            />
            <button
              type="submit"
              className="rounded-xl bg-teal-700 px-5 py-2.5 text-xs font-bold text-white"
            >
              খুঁজুন
            </button>
          </form>

          <div className="space-y-2.5">
            {usersResult.map((u) => {
              const suspended = u.status === 'suspended';
              return (
                <div
                  key={u.uid}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-950/10 bg-white p-4 dark:border-emerald-200/10 dark:bg-[#11221C]"
                >
                  <div>
                    <p className="text-sm font-bold">{u.name}</p>
                    <p className="text-xs text-slate-500">
                      {u.email} · {u.uid}
                    </p>
                    <p className="mt-1 text-xs font-semibold tabular-nums">
                      পয়েন্ট: {toBn(u.totalPoints)} · ব্যালেন্স: {formatUsd(u.balanceUsd)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleToggleSuspend(u.uid, suspended)}
                    className={`rounded-xl px-3.5 py-2 text-xs font-bold text-white ${
                      suspended ? 'bg-emerald-600' : 'bg-rose-600'
                    }`}
                  >
                    {suspended ? 'পুনরায় সক্রিয় করুন' : 'স্থগিত (Suspend)'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
