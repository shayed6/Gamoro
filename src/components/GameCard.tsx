import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Play, RotateCcw, Star, ThumbsUp } from 'lucide-react';
import type { GameItem, GameRatingSummary } from '../types';
import { toBn } from '../lib/format';
import { GameIcon } from './GameIcon';
import { getWeeklyGameVote, saveWeeklyGameVote } from '../lib/storage';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface GameCardProps {
  game: GameItem;
  isFavorite: boolean;
  isRecent?: boolean;
  rating?: GameRatingSummary;
  onToggleFavorite: (gameId: string) => void;
  onRatingUpdated?: (summary: GameRatingSummary) => void;
}

export const GameCard: React.FC<GameCardProps> = ({
  game,
  isFavorite,
  isRecent = false,
  rating,
  onToggleFavorite,
  onRatingUpdated,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [showRater, setShowRater] = useState(false);
  const [selectedStars, setSelectedStars] = useState<number>(5);
  const [submitting, setSubmitting] = useState(false);
  const [localVote, setLocalVote] = useState(() => getWeeklyGameVote(game.id));

  const upvotes = rating?.upvotes ?? 0;
  const avg = rating?.averageRating ?? 0;
  const count = rating?.ratingCount ?? 0;

  async function handleVote(upvoteOnly: boolean, stars: number) {
    if (!user) {
      showToast('ভোট বা রেটিং দিতে লগইন করুন।', 'info');
      return;
    }
    if (localVote) {
      showToast('এই সপ্তাহে এই গেমে ইতিমধ্যে ভোট দিয়েছেন।', 'info');
      return;
    }

    setSubmitting(true);
    try {
      const saved = saveWeeklyGameVote(game.id, true, upvoteOnly ? 0 : stars);
      setLocalVote(saved);
      setShowRater(false);
      showToast('ভোট সুবিধা বর্তমানে বন্ধ রয়েছে।', 'info');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="group flex flex-col justify-between rounded-2xl border border-emerald-950/10 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-emerald-200/10 dark:bg-[#11221C]">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${game.accent} text-white shadow-sm`}
            >
              <GameIcon iconKey={game.iconKey} className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold text-[#112A22] dark:text-[#ECF5F1]">
                {game.name}
              </h3>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {game.category} · {toBn(game.estimatedMinutes)} মিনিট
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onToggleFavorite(game.id)}
            aria-label={isFavorite ? 'পছন্দ থেকে সরান' : 'পছন্দে যোগ করুন'}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
              isFavorite
                ? 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400'
                : 'border-slate-200 bg-slate-50 text-slate-400 hover:text-rose-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400'
            }`}
          >
            <Heart className={`h-4.5 w-4.5 ${isFavorite ? 'fill-current' : ''}`} />
          </button>
        </div>

        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {game.description}
        </p>

        {/* Rating & Voting Bar */}
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs dark:border-slate-800">
          <div className="flex items-center gap-3 tabular-nums text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1 font-semibold">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              {avg > 0 ? toBn(avg.toFixed(1)) : 'নতুন'}
              {count > 0 && <span className="text-slate-400">({toBn(count)})</span>}
            </span>
            <span className="inline-flex items-center gap-1 font-semibold">
              <ThumbsUp className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
              {toBn(upvotes)}
            </span>
          </div>

          <button
            type="button"
            disabled={Boolean(localVote) || submitting}
            onClick={() => setShowRater((v) => !v)}
            className={`min-h-[32px] rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              localVote
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-700 hover:bg-teal-50 hover:text-teal-800 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-teal-950/60'
            }`}
          >
            {localVote ? 'ভোট সম্পন্ন' : 'ভোট / রেটিং দিন'}
          </button>
        </div>

        {showRater && !localVote && (
          <div className="mt-2.5 rounded-xl border border-teal-200 bg-teal-50/70 p-2.5 dark:border-teal-800 dark:bg-teal-950/40">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1" role="radiogroup" aria-label="স্টার রেটিং">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSelectedStars(s)}
                    className="p-1"
                    aria-label={`${toBn(s)} স্টার`}
                  >
                    <Star
                      className={`h-4 w-4 ${
                        s <= selectedStars
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-slate-300 dark:text-slate-600'
                      }`}
                    />
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleVote(false, selectedStars)}
                  className="rounded-lg bg-teal-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  {submitting ? 'হচ্ছে...' : 'জমা দিন'}
                </button>
              </div>
            </div>
            <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
              প্রতি সপ্তাহে একটি গেমে একবার ভোট দিতে পারবেন।
            </p>
          </div>
        )}
      </div>

      <Link
        to={`/play/${game.id}`}
        className={`mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-colors ${
          isRecent
            ? 'bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500'
            : 'bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500'
        }`}
      >
        {isRecent ? (
          <>
            <RotateCcw className="h-4 w-4" />
            <span>আবার খেলুন</span>
          </>
        ) : (
          <>
            <Play className="h-4 w-4 fill-current" />
            <span>খেলুন ও পয়েন্ট জিতুন</span>
          </>
        )}
      </Link>
    </article>
  );
};
