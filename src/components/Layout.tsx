import React from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Bell,
  Gamepad2,
  Home,
  Moon,
  ShieldAlert,
  Sun,
  Target,
  Trophy,
  User,
  Wallet,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { toBn } from '../lib/format';
import { sendEmailVerification } from 'firebase/auth';
import { useToast } from '../context/ToastContext';

const BOTTOM_TABS = [
  { to: '/', label: 'হোম', icon: Home },
  { to: '/games', label: 'গেম', icon: Gamepad2 },
  { to: '/missions', label: 'মিশন', icon: Target },
  { to: '/notifications', label: 'নোটিফিকেশন', icon: Bell },
  { to: '/profile', label: 'প্রোফাইল', icon: User },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, unreadCount, isAdmin, refreshUserData } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const location = useLocation();

  const isPlayRoute = location.pathname.startsWith('/play/');

  async function handleResendVerification() {
    if (!user) return;
    try {
      await sendEmailVerification(user);
      showToast('আপনার ইমেইলে ভেরিফিকেশন লিংক পুনরায় পাঠানো হয়েছে।', 'success');
    } catch {
      showToast('এই মুহূর্তে ইমেইল পাঠানো যায়নি, কিছুক্ষণ পর চেষ্টা করুন।', 'error');
    }
  }

  return (
    <div className="min-h-screen bg-[#F4FAF7] text-[#112A22] dark:bg-[#0B1713] dark:text-[#ECF5F1]">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-emerald-950/10 bg-white/95 backdrop-blur-md pt-safe dark:border-emerald-200/10 dark:bg-[#0F1F1A]/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="Gamoro"
              className="h-9 w-9 rounded-xl object-cover shadow-sm"
            />
            <div>
              <span className="block text-lg font-bold leading-none tracking-tight text-teal-800 dark:text-teal-300">
                Gamoro
              </span>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                খেলুন ও আয় করুন
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-1 md:flex" aria-label="প্রধান নেভিগেশন">
            {BOTTOM_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.to === '/'}
                  className={({ isActive }) =>
                    `relative flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                      isActive
                        ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/70 dark:text-teal-200'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70'
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                  {tab.to === '/notifications' && unreadCount > 0 && (
                    <span className="ml-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white tabular-nums">
                      {toBn(unreadCount)}
                    </span>
                  )}
                </NavLink>
              );
            })}
            <NavLink
              to="/leaderboard"
              className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/70 dark:text-teal-200'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70'
                }`
              }
            >
              <Trophy className="h-4 w-4" />
              <span>লিডারবোর্ড</span>
            </NavLink>
            <NavLink
              to="/withdraw"
              className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/70 dark:text-teal-200'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70'
                }`
              }
            >
              <Wallet className="h-4 w-4" />
              <span>উইথড্র</span>
            </NavLink>
            <NavLink
              to="/faq"
              className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/70 dark:text-teal-200'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70'
                }`
              }
            >
              <HelpCircle className="h-4 w-4" />
              <span>সাহায্য</span>
            </NavLink>
            {isAdmin && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                    isActive
                      ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200'
                      : 'text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40'
                  }`
                }
              >
                <ShieldAlert className="h-4 w-4" />
                <span>অ্যাডমিন</span>
              </NavLink>
            )}
          </nav>

          {/* Right Header Controls */}
          <div className="flex items-center gap-2">
            {user && profile ? (
              <Link
                to="/withdraw"
                className="flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-800 tabular-nums dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-200"
              >
                <span>{toBn(profile.points)} পয়েন্ট</span>
              </Link>
            ) : (
              <Link
                to="/auth"
                className="flex min-h-[38px] items-center rounded-xl bg-teal-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-teal-800"
              >
                লগইন / সাইন আপ
              </Link>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="থিম পরিবর্তন করুন"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {theme === 'dark' ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </button>
          </div>
        </div>

        {/* Email verification reminder strip */}
        {user && !user.emailVerified && !isPlayRoute && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/60 dark:text-amber-200">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                পয়েন্ট ও উইথড্র চালু রাখতে আপনার ইমেইল ({user.email}) ভেরিফাই করুন।
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResendVerification}
                  className="font-bold underline hover:opacity-80"
                >
                  লিংক পাঠান
                </button>
                <button
                  type="button"
                  onClick={refreshUserData}
                  className="rounded-lg bg-amber-200/80 px-2.5 py-1 font-bold text-amber-950 dark:bg-amber-800 dark:text-amber-50"
                >
                  রিফ্রেশ
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className={isPlayRoute ? '' : 'mx-auto max-w-7xl px-4 pb-24 pt-5 sm:px-6 md:pb-10'}>
        {children}
      </main>

      {/* Fixed Mobile Bottom Tab Bar */}
      {!isPlayRoute && (
        <nav
          aria-label="মোবাইল নিচের নেভিগেশন"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-emerald-950/10 bg-white/95 backdrop-blur-md pb-safe dark:border-emerald-200/10 dark:bg-[#0F1F1A]/95 md:hidden"
        >
          <div className="grid grid-cols-5">
            {BOTTOM_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.to === '/'}
                  className={({ isActive }) =>
                    `relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-semibold transition-colors ${
                      isActive
                        ? 'text-teal-700 dark:text-teal-300'
                        : 'text-slate-500 dark:text-slate-400'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div className="relative">
                        <Icon className={`h-5 w-5 ${isActive ? 'stroke-[2.5]' : ''}`} />
                        {tab.to === '/notifications' && unreadCount > 0 && (
                          <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white tabular-nums">
                            {toBn(unreadCount)}
                          </span>
                        )}
                      </div>
                      <span className="truncate">{tab.label}</span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
};
