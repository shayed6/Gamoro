import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Flame,
  Gift,
  Heart,
  RotateCcw,
  Sparkles,
  Target,
  Trophy,
  Wallet,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { GAMES, getGameById } from '../data/games';
import { DAILY_BONUS_CYCLE, WEEKLY_PRIMARY_MISSION } from '../data/missions';
import { claimDailyBonus } from '../lib/api';
import { formatUsd, getDhakaDate, getDhakaPeriod, toBn } from '../lib/format';
import {
  getFavoriteGameIds,
  getRecentPlayed,
  toggleFavoriteGameId,
} from '../lib/storage';
import type { GameRatingSummary } from '../types';
import { GameCard } from '../components/GameCard';
import { CardSkeleton } from '../components/Skeleton';

export const HomePage: React.FC = () => {
  const { user, profile, mission, loading, refreshUserData } = useAuth();
  const { showToast } = useToast();

  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => getFavoriteGameIds());
  const [recentEntries] = useState(() => getRecentPlayed());
  const [ratings, setRatings] = useState<Record<string, GameRatingSummary>>({});
  const [monthlyRank, setMonthlyRank] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState<string>('');
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    async function loadMeta() {
      try {
        const annSnap = await getDoc(doc(db, 'config', 'announcement'));
        if (annSnap.exists() && annSnap.data()?.active && annSnap.data()?.message) {
          setAnnouncement(String(annSnap.data().message));
        }
      } catch {
        // optional
      }

      if (user) {
        try {
          const lbSnap = await getDoc(doc(db, 'leaderboards', getDhakaPeriod(0)));
          if (lbSnap.exists()) {
            const top = (lbSnap.data()?.top || []) as Array<{ uid?: string; rank?: number }>;
            const idx = top.findIndex((item) => item.uid === user.uid);
            setMonthlyRank(idx >= 0 ? top[idx].rank || idx + 1 : null);
          }
        } catch {
          setMonthlyRank(null);
        }
      } else {
        setMonthlyRank(null);
      }
    }
    void loadMeta();
  }, [user]);

  const handleToggleFav = (id: string) => {
    const next = toggleFavoriteGameId(id);
    setFavoriteIds(next);
  };

  const today = getDhakaDate(0);
  const alreadyClaimedToday = Boolean(profile?.lastClaimDate === today);

  async function handleClaimDaily() {
    if (!user) {
      showToast('দৈনিক বোনাস নিতে লগইন করুন।', 'info');
      return;
    }
    if (!user.emailVerified) {
      showToast('বোনাস নিতে আগে ইমেইল ভেরিফাই করুন।', 'error');
      return;
    }
    setClaiming(true);
    try {
      const res = await claimDailyBonus();
      if (res.ok) {
        showToast(`+${toBn(res.bonus)} দৈনিক বোনাস পয়েন্ট যোগ হয়েছে!`, 'success');
        await refreshUserData();
      } else if (res.error === 'already') {
        showToast('আজকের দৈনিক বোনাস ইতিমধ্যেই নেওয়া হয়েছে।', 'info');
      } else {
        showToast('দৈনিক বোনাস নেওয়া যায়নি, আবার চেষ্টা করুন।', 'error');
      }
    } catch {
      showToast('সার্ভারের সাথে সংযোগ হয়নি।', 'error');
    } finally {
      setClaiming(false);
    }
  }

  const favoriteGames = useMemo(
    () => GAMES.filter((g) => favoriteIds.includes(g.id)),
    [favoriteIds]
  );

  const lastPlayedGame = useMemo(() => {
    if (recentEntries.length === 0) return null;
    return getGameById(recentEntries[0].gameId);
  }, [recentEntries]);

  const popularGames = useMemo(() => {
    return [...GAMES]
      .sort((a, b) => {
        const ra = ratings[a.id]?.upvotes || 0;
        const rb = ratings[b.id]?.upvotes || 0;
        if (rb !== ra) return rb - ra;
        return (ratings[b.id]?.averageRating || 0) - (ratings[a.id]?.averageRating || 0);
      })
      .slice(0, 6);
  }, [ratings]);

  const missionDays = mission?.daysPlayed?.length || 0;
  const missionTarget = mission?.targetDays || WEEKLY_PRIMARY_MISSION.targetDays;
  const missionPct = Math.min(100, Math.round((missionDays / missionTarget) * 100));

  return (
    <div className="space-y-6">
      {announcement && (
        <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-900 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-200">
          {announcement}
        </div>
      )}

      {/* Hero & Summary Grid */}
      <section className="grid gap-4 lg:grid-cols-12">
        <div className="flex flex-col justify-between rounded-2xl bg-gradient-to-br from-[#0D6E5B] to-[#084C3F] p-5 text-white shadow-sm lg:col-span-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-100">
              {user && profile ? `স্বাগতম, ${profile.name}` : 'Gamoro বাংলা গেমিং ও রিওয়ার্ডস'}
            </p>
            <h1 className="mt-1.5 text-2xl font-bold leading-snug sm:text-3xl">
              {user && profile
                ? 'খেলুন, মিশন সম্পন্ন করুন এবং পয়েন্ট জমান'
                : 'মজার গেম খেলুন ও পয়েন্ট সংগ্রহ করুন'}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-teal-50/90">
              সক্রিয় খেলার প্রতি ২ মিনিটে ১ পয়েন্ট, দৈনিক স্ট্রিক বোনাস এবং সাপ্তাহিক মিশন থেকে সরাসরি রিওয়ার্ড পান।
            </p>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {lastPlayedGame ? (
              <Link
                to={`/play/${lastPlayedGame.id}`}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300"
              >
                <RotateCcw className="h-4 w-4" />
                <span>আবার খেলুন: {lastPlayedGame.name}</span>
              </Link>
            ) : (
              <Link
                to="/games"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300"
              >
                <Sparkles className="h-4 w-4" />
                <span>খেলা শুরু করুন</span>
              </Link>
            )}

            {!user && (
              <Link
                to="/auth#signup"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/20"
              >
                <span>ফ্রি অ্যাকাউন্ট খুলুন</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>

        {/* Account Real Stats Grid */}
        <div className="grid grid-cols-2 gap-3 lg:col-span-5">
          {loading ? (
            <>
              <CardSkeleton lines={2} />
              <CardSkeleton lines={2} />
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-emerald-950/10 bg-white p-4 dark:border-emerald-200/10 dark:bg-[#11221C]">
                <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                  <span>চলতি মাসের পয়েন্ট</span>
                  <Sparkles className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums text-[#112A22] dark:text-[#ECF5F1]">
                  {user && profile ? toBn(profile.points) : '—'}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {user ? 'সক্রিয় খেলা ও বোনাস' : 'লগইন করলে দেখুন'}
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-950/10 bg-white p-4 dark:border-emerald-200/10 dark:bg-[#11221C]">
                <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                  <span>ওয়ালেট ব্যালেন্স</span>
                  <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums text-teal-700 dark:text-teal-300">
                  {user && profile ? formatUsd(profile.balanceUsd) : '—'}
                </p>
                <Link
                  to="/withdraw"
                  className="mt-1 inline-block text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300"
                >
                  উইথড্র ও স্ট্যাটাস →
                </Link>
              </div>

              <div className="rounded-2xl border border-emerald-950/10 bg-white p-4 dark:border-emerald-200/10 dark:bg-[#11221C]">
                <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                  <span>ধারাবাহিকতা (স্ট্রিক)</span>
                  <Flame className="h-4 w-4 text-amber-500" />
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums text-[#112A22] dark:text-[#ECF5F1]">
                  {user && profile ? `${toBn(profile.streak)} দিন` : 'লগইন করলে দেখুন'}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  প্রতিদিন খেলুন ও বোনাস নিন
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-950/10 bg-white p-4 dark:border-emerald-200/10 dark:bg-[#11221C]">
                <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                  <span>মাসিক র‍্যাঙ্ক</span>
                  <Trophy className="h-4 w-4 text-amber-500" />
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums text-[#112A22] dark:text-[#ECF5F1]">
                  {user ? (monthlyRank ? `#${toBn(monthlyRank)}` : '—') : 'লগইন করলে দেখুন'}
                </p>
                <Link
                  to="/leaderboard"
                  className="mt-1 inline-block text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300"
                >
                  লিডারবোর্ড দেখুন →
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Daily Bonus + Weekly Mission Row */}
      <section className="grid gap-4 md:grid-cols-2">
        {/* Daily Bonus */}
        <div className="rounded-2xl border border-emerald-950/10 bg-white p-5 dark:border-emerald-200/10 dark:bg-[#11221C]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold">
                <Gift className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                <span>দৈনিক লগইন বোনাস</span>
              </h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                টানা ৭ দিন সংগ্রহ করলে ৭ম দিনে +{toBn(50)} পয়েন্ট বোনাস।
              </p>
            </div>
            <button
              type="button"
              onClick={handleClaimDaily}
              disabled={claiming || (Boolean(user) && alreadyClaimedToday)}
              className="min-h-[40px] shrink-0 rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {claiming
                ? 'সংগ্রহ হচ্ছে...'
                : user && alreadyClaimedToday
                ? 'আজ সংগৃহীত'
                : 'বোনাস নিন'}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-1.5 text-center tabular-nums">
            {DAILY_BONUS_CYCLE.map((amt, idx) => {
              const activeDay = ((profile?.streak || 0) % 7) > idx || (alreadyClaimedToday && (profile?.streak || 0) % 7 === idx);
              return (
                <div
                  key={idx}
                  className={`rounded-xl border px-1 py-2 text-xs ${
                    activeDay
                      ? 'border-teal-500 bg-teal-50 font-bold text-teal-800 dark:border-teal-500/70 dark:bg-teal-950/60 dark:text-teal-200'
                      : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400'
                  }`}
                >
                  <div className="text-[10px]">দিন {toBn(idx + 1)}</div>
                  <div className="mt-0.5 font-bold">+{toBn(amt)}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Weekly Mission Summary */}
        <div className="flex flex-col justify-between rounded-2xl border border-emerald-950/10 bg-white p-5 dark:border-emerald-200/10 dark:bg-[#11221C]">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold">
                  <Target className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <span>সাপ্তাহিক মিশন: {WEEKLY_PRIMARY_MISSION.title}</span>
                </h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  পুরস্কার: +{toBn(WEEKLY_PRIMARY_MISSION.rewardPoints)} পয়েন্ট ও &ldquo;{WEEKLY_PRIMARY_MISSION.badgeTitle}&rdquo; ব্যাজ
                </p>
              </div>
              <span className="text-xs font-bold tabular-nums text-teal-700 dark:text-teal-300">
                {toBn(missionDays)}/{toBn(missionTarget)} দিন
              </span>
            </div>

            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-teal-600 transition-all duration-300"
                style={{ width: `${missionPct}%` }}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {mission?.completed
                ? 'এই সপ্তাহের মিশন সম্পন্ন হয়েছে!'
                : 'অগ্রগতি সরাসরি খেলার সাথে যুক্ত হয়'}
            </span>
            <Link
              to="/missions"
              className="text-xs font-bold text-teal-700 hover:underline dark:text-teal-300"
            >
              সব মিশন ও ব্যাজ →
            </Link>
          </div>
        </div>
      </section>

      {/* Favorite Games Section (pure localStorage) */}
      {favoriteGames.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Heart className="h-5 w-5 fill-rose-500 text-rose-500" />
              <span>আমার পছন্দের গেম</span>
            </h2>
            <Link to="/games" className="text-xs font-bold text-teal-700 hover:underline dark:text-teal-300">
              সব গেম দেখুন →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {favoriteGames.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                isFavorite
                isRecent={recentEntries.some((r) => r.gameId === game.id)}
                rating={ratings[game.id]}
                onToggleFavorite={handleToggleFav}
                onRatingUpdated={(next) =>
                  setRatings((prev) => ({ ...prev, [next.gameId]: next }))
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* Popular Games Ranked by Real Community Votes */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">জনপ্রিয় গেম</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              খেলোয়াড়দের প্রকৃত ভোট ও রেটিং অনুযায়ী সাজানো
            </p>
          </div>
          <Link to="/games" className="text-xs font-bold text-teal-700 hover:underline dark:text-teal-300">
            সবগুলো ({toBn(GAMES.length)}) →
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {popularGames.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              isFavorite={favoriteIds.includes(game.id)}
              isRecent={recentEntries.some((r) => r.gameId === game.id)}
              rating={ratings[game.id]}
              onToggleFavorite={handleToggleFav}
              onRatingUpdated={(next) =>
                setRatings((prev) => ({ ...prev, [next.gameId]: next }))
              }
            />
          ))}
        </div>
      </section>
    </div>
  );
};
