import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  BellRing,
  CheckCheck,
  Flame,
  Target,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatBnDateTime, toBn } from '../lib/format';
import { getWebPushSupport, requestWebPushPermission } from '../lib/webPush';
import { isWebPushOptedIn } from '../lib/storage';
import { EmptyState } from '../components/Skeleton';

export const NotificationsPage: React.FC = () => {
  const {
    user,
    notifications,
    unreadCount,
    readNotifIds,
    markNotificationRead,
    markAllNotificationsRead,
  } = useAuth();
  const { showToast } = useToast();
  const [pushState, setPushState] = useState(getWebPushSupport());
  const [pushOpted, setPushOpted] = useState(isWebPushOptedIn());

  const readSet = new Set(readNotifIds);

  async function handleEnablePush() {
    const res = await requestWebPushPermission();
    setPushState(res.permission);
    setPushOpted(res.ok);
    showToast(res.message, res.ok ? 'success' : 'info');
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">নোটিফিকেশন কেন্দ্র</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            উইথড্রয়াল আপডেট, মিশন পুরস্কার ও স্ট্রিক রিমাইন্ডার ({toBn(unreadCount)}টি অপঠিত)
          </p>
        </div>

        {user && notifications.length > 0 && unreadCount > 0 && (
          <button
            type="button"
            onClick={() => {
              markAllNotificationsRead();
              showToast('সব নোটিফিকেশন পঠিত হিসেবে চিহ্নিত হয়েছে।', 'success');
            }}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-teal-200 bg-white px-3.5 py-2 text-xs font-bold text-teal-800 hover:bg-teal-50 dark:border-teal-800 dark:bg-[#11221C] dark:text-teal-200"
          >
            <CheckCheck className="h-4 w-4" />
            <span>সব পঠিত চিহ্নিত করুন</span>
          </button>
        )}
      </div>

      {/* Browser Web Push Future-Ready Opt-in */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-950/10 bg-white p-4 dark:border-emerald-200/10 dark:bg-[#11221C]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
            <BellRing className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold">ব্রাউজার পুশ অ্যালার্ট</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {pushState === 'granted' && pushOpted
                ? 'ব্রাউজার পুশ নোটিফিকেশন সক্রিয় রয়েছে।'
                : pushState === 'unsupported'
                ? 'এই ব্রাউজারে পুশ নোটিফিকেশন সমর্থিত নয়।'
                : 'স্ট্রিক ভাঙার আগে ও পেমেন্ট আপডেট পেতে পুশ অনুমতি চালু করুন।'}
            </p>
          </div>
        </div>

        {pushState !== 'unsupported' && !(pushState === 'granted' && pushOpted) && (
          <button
            type="button"
            onClick={handleEnablePush}
            className="min-h-[40px] rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800"
          >
            চালু করুন
          </button>
        )}
      </div>

      {!user ? (
        <EmptyState
          icon={<Bell className="h-6 w-6" />}
          title="নোটিফিকেশন দেখতে লগইন করুন"
          description="আপনার উইথড্রয়াল স্ট্যাটাস, মিশন বোনাস ও দৈনিক স্ট্রিক রিমাইন্ডার এখানে দেখতে পাবেন।"
          action={
            <Link
              to="/auth"
              className="inline-flex min-h-[42px] items-center rounded-xl bg-teal-700 px-5 py-2 text-xs font-bold text-white"
            >
              লগইন করুন
            </Link>
          }
        />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-6 w-6" />}
          title="এখনো কোনো নোটিফিকেশন নেই"
          description="উইথড্রয়াল স্ট্যাটাস বদলালে বা সাপ্তাহিক মিশন সম্পন্ন হলে এখানে সাথে সাথে জানানো হবে।"
        />
      ) : (
        <div className="space-y-2.5">
          {notifications.map((item) => {
            const isRead = readSet.has(item.id);
            return (
              <div
                key={item.id}
                onClick={() => markNotificationRead(item.id)}
                className={`cursor-pointer rounded-2xl border p-4 transition-colors ${
                  isRead
                    ? 'border-emerald-950/10 bg-white/80 dark:border-emerald-200/10 dark:bg-[#11221C]/80'
                    : 'border-teal-300 bg-teal-50/60 shadow-sm dark:border-teal-700 dark:bg-teal-950/35'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      item.type === 'withdrawal'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : item.type === 'streak'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300'
                    }`}
                  >
                    {item.type === 'withdrawal' && <Wallet className="h-4.5 w-4.5" />}
                    {item.type === 'streak' && <Flame className="h-4.5 w-4.5" />}
                    {item.type !== 'withdrawal' && item.type !== 'streak' && (
                      <Target className="h-4.5 w-4.5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold">{item.title}</h3>
                      {!isRead && (
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-teal-600 dark:bg-teal-400" />
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {item.body}
                    </p>
                    <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                      {formatBnDateTime(item.createdAt)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
