import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Heart, ShieldCheck, Sparkles } from 'lucide-react';
import { getGameById } from '../data/games';
import { auth } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { startGamoroSession, type MathChallenge } from '../lib/gamoroSession';
import { getFavoriteGameIds, recordGamePlayed, toggleFavoriteGameId } from '../lib/storage';
import { toBn } from '../lib/format';

export const PlayPage: React.FC = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const game = getGameById(gameId);
  const { user, profile, refreshUserData } = useAuth();
  const { showToast } = useToast();

  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => getFavoriteGameIds());
  const [livePoints, setLivePoints] = useState<number>(profile?.points ?? 0);
  const [pendingSec, setPendingSec] = useState<number>(0);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [capReached, setCapReached] = useState<boolean>(false);
  const [challenge, setChallenge] = useState<MathChallenge | null>(null);
  const [challengeAnswer, setChallengeAnswer] = useState('');
  const [challengeError, setChallengeError] = useState(false);

  const challengeSubmitRef = useRef<
    ((answer: string) => Promise<{ ok: boolean; challenge?: MathChallenge }>) | null
  >(null);

  useEffect(() => {
    if (profile) {
      setLivePoints(profile.points);
    }
  }, [profile]);

  useEffect(() => {
    if (!game) return;
    recordGamePlayed(game.id);
    document.title = `${game.name} · Gamoro`;
  }, [game]);

  useEffect(() => {
    if (!game || !user) return;

    const session = startGamoroSession({
      auth,
      gameId: game.id,
      onTick: (sec, activeNow) => {
        setPendingSec(sec);
        setIsActive(activeNow);
      },
      onPoints: (pts, added, info) => {
        setLivePoints(pts);
        if (info?.capReached) setCapReached(true);
        if (added > 0) {
          showToast(`+${toBn(added)} পয়েন্ট যোগ হয়েছে!`, 'success');
        }
        if (info?.missionJustCompleted) {
          showToast(
            `অভিনন্দন! সাপ্তাহিক মিশন সম্পন্ন করে +${toBn(info.missionBonus || 150)} বোনাস পেয়েছেন!`,
            'success'
          );
          void refreshUserData();
        }
      },
      onHeartbeat: (data) => {
        if (data?.capReached) setCapReached(true);
      },
      onChallenge: (ch, submitFn) => {
        challengeSubmitRef.current = submitFn;
        setChallenge(ch);
        setChallengeAnswer('');
        setChallengeError(false);
      },
      onError: (err) => {
        if (err === 'verify-email') {
          showToast('পয়েন্ট পেতে আগে আপনার ইমেইল ভেরিফাই করুন।', 'info');
        }
      },
    });

    return () => {
      session.stop();
    };
  }, [game, user, refreshUserData, showToast]);

  async function handleChallengeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeSubmitRef.current) return;
    const res = await challengeSubmitRef.current(challengeAnswer);
    if (res.ok) {
      setChallenge(null);
      challengeSubmitRef.current = null;
      setChallengeError(false);
    } else {
      setChallengeError(true);
      if (res.challenge) setChallenge(res.challenge);
      setChallengeAnswer('');
    }
  }

  if (!game) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center justify-center px-6 py-20 text-center">
        <h1 className="text-xl font-bold">গেমটি পাওয়া যায়নি</h1>
        <p className="mt-2 text-sm text-slate-500">অনুগ্রহ করে গেম তালিকা থেকে আরেকটি গেম নির্বাচন করুন।</p>
        <Link
          to="/games"
          className="mt-5 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-bold text-white"
        >
          গেম তালিকায় ফিরুন
        </Link>
      </div>
    );
  }

  const isFav = favoriteIds.includes(game.id);

  return (
    <div className="flex h-[calc(100dvh-61px)] flex-col bg-[#F4FAF7] dark:bg-[#0B1713]">
      {/* Sub-header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-950/10 bg-white px-4 py-2.5 dark:border-emerald-200/10 dark:bg-[#11221C]">
        <div className="flex items-center gap-3">
          <Link
            to="/games"
            aria-label="ফিরে যান"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-sm font-bold sm:text-base">{game.name}</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {!user
                ? 'পয়েন্ট পেতে লগইন করুন'
                : !user.emailVerified
                ? 'পয়েন্ট পেতে ইমেইল ভেরিফাই করুন'
                : capReached
                ? 'আজকের দৈনিক খেলার সীমা পূর্ণ'
                : isActive
                ? `সক্রিয় · জমা: ${toBn(pendingSec)}/৩০০ সেকেন্ড`
                : 'নিষ্ক্রিয় · গেমে ট্যাপ করুন'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {user && (
            <div className="flex items-center gap-1.5 rounded-xl bg-teal-50 px-3 py-1.5 text-xs font-bold tabular-nums text-teal-800 dark:bg-teal-950/60 dark:text-teal-200">
              <Sparkles className="h-3.5 w-3.5" />
              <span>{toBn(livePoints)} পয়েন্ট</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setFavoriteIds(toggleFavoriteGameId(game.id))}
            aria-label={isFav ? 'পছন্দ থেকে সরান' : 'পছন্দে যোগ করুন'}
            className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
              isFav
                ? 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400'
                : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-800'
            }`}
          >
            <Heart className={`h-4 w-4 ${isFav ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>

      {/* Guest prompt banner */}
      {!user && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-950 dark:bg-amber-950/60 dark:text-amber-200">
          <span>অতিথি হিসেবে খেলছেন — পয়েন্ট জমাতে লগইন করুন।</span>
          <Link
            to="/auth"
            className="shrink-0 rounded-lg bg-teal-700 px-3 py-1 font-bold text-white"
          >
            লগইন
          </Link>
        </div>
      )}

      {/* Playable Game Iframe */}
      <div className="relative flex-1 overflow-hidden">
        <iframe
          src={game.path}
          title={game.name}
          sandbox="allow-scripts allow-same-origin"
          allow="autoplay"
          className="h-full w-full border-0"
        />
      </div>

      {/* Anti-Bot Math Challenge Modal */}
      {challenge && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleChallengeSubmit}
            className="w-full max-w-sm rounded-2xl border border-emerald-950/10 bg-white p-6 text-center shadow-xl dark:border-emerald-200/10 dark:bg-[#11221C]"
          >
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold">আপনি কি এখনো খেলছেন?</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              সক্রিয় উপস্থিতি নিশ্চিত করতে নিচের উত্তরটি লিখুন।
            </p>
            <div className="my-4 rounded-xl bg-[#F4FAF7] py-3 text-2xl font-bold text-teal-800 dark:bg-slate-900 dark:text-teal-300">
              {challenge.q}
            </div>
            <input
              type="text"
              inputMode="numeric"
              value={challengeAnswer}
              onChange={(e) => setChallengeAnswer(e.target.value)}
              placeholder="উত্তর লিখুন"
              autoFocus
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-center text-lg font-bold outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-900"
            />
            {challengeError && (
              <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">
                ভুল উত্তর, আবার চেষ্টা করুন।
              </p>
            )}
            <button
              type="submit"
              className="mt-4 min-h-[44px] w-full rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800"
            >
              নিশ্চিত করুন
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
