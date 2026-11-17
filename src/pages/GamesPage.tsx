import React, { useEffect, useMemo, useState } from 'react';
import { Gamepad2, Heart, Search } from 'lucide-react';
import { GAME_CATEGORIES, GAMES } from '../data/games';
import { getFavoriteGameIds, getRecentPlayed, toggleFavoriteGameId } from '../lib/storage';
import { toBn } from '../lib/format';
import type { GameRatingSummary } from '../types';
import { GameCard } from '../components/GameCard';
import { EmptyState } from '../components/Skeleton';

export const GamesPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<(typeof GAME_CATEGORIES)[number]>('সব');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [sortBy, setSortBy] = useState<'popular' | 'rating' | 'name'>('popular');
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => getFavoriteGameIds());
  const [recentIds] = useState<string[]>(() => getRecentPlayed().map((r) => r.gameId));
  const [ratings, setRatings] = useState<Record<string, GameRatingSummary>>({});

  const handleToggleFavorite = (gameId: string) => {
    setFavoriteIds(toggleFavoriteGameId(gameId));
  };

  const filteredGames = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = GAMES.filter((g) => {
      if (category !== 'সব' && g.category !== category) return false;
      if (onlyFavorites && !favoriteIds.includes(g.id)) return false;
      if (q && !g.name.toLowerCase().includes(q) && !g.description.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'popular') {
        return (ratings[b.id]?.upvotes || 0) - (ratings[a.id]?.upvotes || 0);
      }
      if (sortBy === 'rating') {
        return (ratings[b.id]?.averageRating || 0) - (ratings[a.id]?.averageRating || 0);
      }
      return a.name.localeCompare(b.name, 'bn');
    });
    return list;
  }, [search, category, onlyFavorites, favoriteIds, sortBy, ratings]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold">সব গেম</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            পছন্দের গেম সংরক্ষণ করুন এবং প্রতি সপ্তাহে একবার ভোট ও রেটিং দিন।
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOnlyFavorites((v) => !v)}
          className={`inline-flex min-h-[42px] items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors ${
            onlyFavorites
              ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#11221C] dark:text-slate-200'
          }`}
        >
          <Heart className={`h-4 w-4 ${onlyFavorites ? 'fill-current' : ''}`} />
          <span>আমার পছন্দের গেম ({toBn(favoriteIds.length)})</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-2xl border border-emerald-950/10 bg-white p-3.5 dark:border-emerald-200/10 dark:bg-[#11221C] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {GAME_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`min-h-[38px] rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors ${
                category === cat
                  ? 'bg-teal-700 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex flex-1 gap-2 lg:max-w-md">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 dark:border-slate-700 dark:bg-slate-900">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="গেম খুঁজুন..."
              className="w-full bg-transparent py-2 text-sm outline-none"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'popular' | 'rating' | 'name')}
            aria-label="সাজানোর ধরন"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="popular">জনপ্রিয়তা</option>
            <option value="rating">সর্বোচ্চ রেটিং</option>
            <option value="name">নাম অনুযায়ী</option>
          </select>
        </div>
      </div>

      {filteredGames.length === 0 ? (
        <EmptyState
          icon={<Gamepad2 className="h-6 w-6" />}
          title="কোনো গেম পাওয়া যায়নি"
          description="অনুসন্ধান বা ফিল্টার পরিবর্তন করে আবার দেখুন।"
          action={
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setCategory('সব');
                setOnlyFavorites(false);
              }}
              className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white"
            >
              সব গেম দেখান
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredGames.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              isFavorite={favoriteIds.includes(game.id)}
              isRecent={recentIds.includes(game.id)}
              rating={ratings[game.id]}
              onToggleFavorite={handleToggleFavorite}
              onRatingUpdated={(next) =>
                setRatings((prev) => ({ ...prev, [next.gameId]: next }))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
};
