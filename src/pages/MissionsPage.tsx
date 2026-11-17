import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  CheckCircle2,
  Clock,
  Flame,
  Gamepad2,
  Lock,
  Target,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { WEEKLY_MISSIONS_CATALOG, WEEKLY_PRIMARY_MISSION } from '../data/missions';
import { BADGES, getUnlockedBadgeIds } from '../data/badges';
import { getLocalPlayCount } from '../lib/storage';
import { toBn } from '../lib/format';

function renderBadgeIcon(iconKey: string, unlocked: boolean) {
  const cls = `h-5 w-5 ${unlocked ? 'text-teal-700 dark:text-teal-300' : 'text-slate-400'}`;
  switch (iconKey) {
    case 'clock':
      return <Clock className={cls} />;
    case 'flame':
      return <Flame className={cls} />;
    case 'target':
      return <Target className={cls} />;
    case 'gamepad':
      return <Gamepad2 className={cls} />;
    case 'users':
      return <Users className={cls} />;
    default:
      return <Award className={cls} />;
  }
}

export const MissionsPage: React.FC = () => {
  const { user, profile, mission, referralCount } = useAuth();

  const daysPlayed = mission?.daysPlayed || [];
  const targetDays = mission?.targetDays || WEEKLY_PRIMARY_MISSION.targetDays;
  const pct = Math.min(100, Math.round((daysPlayed.length / targetDays) * 100));

  const unlockedSet = useMemo(
    () =>
      getUnlockedBadgeIds({
        profile,
        mission,
        referralCount,
        localPlayCount: getLocalPlayCount(),
      }),
    [profile, mission, referralCount]
  );

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold">সাপ্তাহিক মিশন ও ব্যাজ</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          সাপ্তাহিক লক্ষ্য পূরণ করে অতিরিক্ত পয়েন্ট এবং বিশেষ অর্জন ব্যাজ আনলক করুন।
        </p>
      </div>

      {/* Primary Weekly Mission Card */}
      <section className="rounded-2xl border border-emerald-950/10 bg-white p-5 shadow-sm dark:border-emerald-200/10 dark:bg-[#11221C]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">
              চলতি সপ্তাহ · {mission?.weekId || 'সপ্তাহ'}
            </span>
            <h2 className="mt-1 text-xl font-bold">{WEEKLY_PRIMARY_MISSION.title}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {WEEKLY_PRIMARY_MISSION.description}
            </p>
          </div>
          <div className="rounded-xl bg-teal-50 px-3.5 py-2 text-right tabular-nums dark:bg-teal-950/60">
            <p className="text-xs text-slate-500 dark:text-slate-400">মিশন পুরস্কার</p>
            <p className="text-base font-bold text-teal-800 dark:text-teal-200">
              +{toBn(WEEKLY_PRIMARY_MISSION.rewardPoints)} পয়েন্ট + ব্যাজ
            </p>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs font-bold tabular-nums">
            <span>
              অগ্রগতি: {toBn(daysPlayed.length)} / {toBn(targetDays)} দিন
            </span>
            <span>{toBn(pct)}%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                mission?.completed ? 'bg-emerald-600' : 'bg-teal-600'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* 3-day milestones */}
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {Array.from({ length: targetDays }).map((_, i) => {
              const done = i < daysPlayed.length;
              return (
                <div
                  key={i}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-bold ${
                    done
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                      : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50'
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                  )}
                  <span>দিন {toBn(i + 1)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          {mission?.completed ? (
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
              <span>মিশন সম্পন্ন হয়েছে (পুরস্কার স্বয়ংক্রিয়ভাবে যোগ হয়েছে)</span>
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {user
                ? 'প্রতিদিন অন্তত ১ মিনিট গেম খেললে দিনটি স্বয়ংক্রিয়ভাবে গণনা হবে।'
                : 'মিশন প্রগ্রেস সংরক্ষণ করতে লগইন করুন।'}
            </p>
          )}
          <Link
            to="/games"
            className="inline-flex min-h-[40px] items-center rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800"
          >
            এখনই খেলুন
          </Link>
        </div>
      </section>

      {/* Secondary Catalog */}
      <section className="grid gap-4 md:grid-cols-2">
        {WEEKLY_MISSIONS_CATALOG.map((item) => {
          const isPrimary = item.id === WEEKLY_PRIMARY_MISSION.id;
          const progress = isPrimary
            ? daysPlayed.length
            : Math.min(item.targetDays, profile?.streak || 0);
          const done = isPrimary ? Boolean(mission?.completed) : progress >= item.targetDays;
          return (
            <div
              key={item.id}
              className="rounded-2xl border border-emerald-950/10 bg-white p-4 dark:border-emerald-200/10 dark:bg-[#11221C]"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-bold">{item.title}</h3>
                <span className="text-xs font-bold tabular-nums text-teal-700 dark:text-teal-300">
                  +{toBn(item.rewardPoints)} পয়েন্ট
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {item.description}
              </p>
              <p className="mt-3 text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                অবস্থা: {done ? 'সম্পন্ন ✓' : `${toBn(progress)} / ${toBn(item.targetDays)} দিন`}
              </p>
            </div>
          );
        })}
      </section>

      {/* Badges Gallery */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">অর্জন ও ব্যাজ গ্যালারি</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              আনলক হয়েছে: {toBn(unlockedSet.size)} / {toBn(BADGES.length)}টি ব্যাজ
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BADGES.map((badge) => {
            const unlocked = unlockedSet.has(badge.id);
            return (
              <div
                key={badge.id}
                className={`flex items-start gap-3 rounded-2xl border p-4 transition-colors ${
                  unlocked
                    ? 'border-teal-300 bg-white shadow-sm dark:border-teal-700 dark:bg-[#11221C]'
                    : 'border-slate-200/80 bg-slate-50/70 opacity-80 dark:border-slate-800 dark:bg-[#0F1B17]'
                }`}
              >
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                    unlocked
                      ? 'bg-teal-50 dark:bg-teal-950/70'
                      : 'bg-slate-200/70 dark:bg-slate-800'
                  }`}
                >
                  {renderBadgeIcon(badge.iconKey, unlocked)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate text-sm font-bold">{badge.title}</h3>
                    {unlocked ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                    {badge.description}
                  </p>
                  <p className="mt-1.5 text-[11px] font-semibold text-teal-700 dark:text-teal-300">
                    শর্ত: {badge.conditionLabel}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
