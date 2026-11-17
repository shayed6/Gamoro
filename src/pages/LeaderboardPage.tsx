import React, { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { getDhakaPeriod, toBn } from '../lib/format';
import { CardSkeleton, EmptyState } from '../components/Skeleton';

interface LeaderboardRow {
  uid?: string;
  name?: string;
  maskedName?: string;
  points?: number;
  rank?: number;
}

export const LeaderboardPage: React.FC = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const period = getDhakaPeriod(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'leaderboards', period));
        if (snap.exists()) {
          const top = snap.data()?.top;
          setRows(Array.isArray(top) ? top : []);
        } else {
          setRows([]);
        }
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [period]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Trophy className="h-6 w-6 text-amber-500" />
          <span>মাসিক লিডারবোর্ড ({period})</span>
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          চলতি মাসের সক্রিয় খেলার পয়েন্ট অনুযায়ী শীর্ষ খেলোয়াড়দের তালিকা।
        </p>
      </div>

      {loading ? (
        <CardSkeleton lines={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-6 w-6" />}
          title="এই মাসের র‍্যাঙ্কিং এখনো প্রকাশিত হয়নি"
          description="খেলতে থাকুন — প্রতিদিন পয়েন্ট অনুযায়ী লিডারবোর্ড হালনাগাদ হয়।"
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-emerald-950/10 bg-white dark:border-emerald-200/10 dark:bg-[#11221C]">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r, idx) => {
              const rank = r.rank || idx + 1;
              const isMe = Boolean(user && r.uid === user.uid);
              return (
                <div
                  key={r.uid || idx}
                  className={`flex items-center justify-between px-4 py-3.5 ${
                    isMe ? 'bg-teal-50/70 dark:bg-teal-950/50' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold tabular-nums ${
                        rank === 1
                          ? 'bg-amber-400 text-slate-950'
                          : rank === 2
                          ? 'bg-slate-200 text-slate-800'
                          : rank === 3
                          ? 'bg-amber-700 text-white'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      #{toBn(rank)}
                    </span>
                    <div>
                      <p className="text-sm font-bold">
                        {r.maskedName || r.name || 'খেলোয়াড়'}
                        {isMe && <span className="ml-2 text-xs text-teal-700 dark:text-teal-300">(আপনি)</span>}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-teal-700 dark:text-teal-300">
                    {toBn(r.points || 0)} পয়েন্ট
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
