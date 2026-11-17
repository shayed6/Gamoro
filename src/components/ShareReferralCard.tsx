import React from 'react';
import { Copy, MessageCircle, Share2, Users } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { toBn } from '../lib/format';

interface ShareReferralCardProps {
  uid: string;
  ownCode?: string;
  referralCount: number;
  earnedBonusPoints?: number;
}

export const ShareReferralCard: React.FC<ShareReferralCardProps> = ({
  uid,
  ownCode,
  referralCount,
  earnedBonusPoints = 0,
}) => {
  const { showToast } = useToast();
  const refParam = ownCode || uid;
  const shareUrl = `${window.location.origin}/?ref=${encodeURIComponent(refParam)}`;
  const shareText = `Gamoro-তে ফ্রি গেম খেলে পয়েন্ট ও পুরস্কার জিতুন! আমার রেফারেল লিংকে যোগ দিন: ${shareUrl}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('রেফারেল লিংক কপি হয়েছে!', 'success');
    } catch {
      showToast('কপি করা যায়নি, ম্যানুয়ালি সিলেক্ট করুন।', 'error');
    }
  }

  async function handleNativeShare() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Gamoro — খেলুন ও পয়েন্ট জিতুন',
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    await handleCopy();
  }

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  const messengerUrl = `fb-messenger://share/?link=${encodeURIComponent(shareUrl)}`;
  const fbShareFallback = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;

  return (
    <section className="rounded-2xl border border-emerald-950/10 bg-white p-5 shadow-sm dark:border-emerald-200/10 dark:bg-[#11221C]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[#112A22] dark:text-[#ECF5F1]">
            বন্ধুদের আমন্ত্রণ ও বোনাস শেয়ার
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            বন্ধু সাইন আপ করে খেললে বোনাসের ৮০% আপনি এবং ২০% আপনার বন্ধু পাবেন।
          </p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
          <Users className="h-5 w-5" />
        </div>
      </div>

      {/* Prominent Stats */}
      <div className="mt-4 grid grid-cols-2 gap-3 tabular-nums">
        <div className="rounded-xl bg-[#F4FAF7] p-3 dark:bg-[#172C24]">
          <p className="text-xs text-slate-500 dark:text-slate-400">মোট আমন্ত্রিত বন্ধু</p>
          <p className="mt-0.5 text-xl font-bold text-[#112A22] dark:text-[#ECF5F1]">
            {toBn(referralCount)} জন
          </p>
        </div>
        <div className="rounded-xl bg-[#F4FAF7] p-3 dark:bg-[#172C24]">
          <p className="text-xs text-slate-500 dark:text-slate-400">অর্জিত রেফারেল বোনাস</p>
          <p className="mt-0.5 text-xl font-bold text-teal-700 dark:text-teal-300">
            {toBn(earnedBonusPoints)} পয়েন্ট
          </p>
        </div>
      </div>

      {/* Referral URL Box */}
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
        <input
          type="text"
          readOnly
          value={shareUrl}
          aria-label="আপনার রেফারেল লিংক"
          className="min-w-0 flex-1 bg-transparent text-xs font-medium text-slate-700 outline-none dark:text-slate-200"
        />
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-800"
        >
          <Copy className="h-3.5 w-3.5" />
          কপি
        </button>
      </div>

      {/* One-Tap Share Actions */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={handleNativeShare}
          className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3 py-2 text-xs font-bold text-white hover:bg-teal-800"
        >
          <Share2 className="h-4 w-4" />
          <span>শেয়ার</span>
        </button>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
        >
          <MessageCircle className="h-4 w-4" />
          <span>WhatsApp</span>
        </a>
        <a
          href={/Mobi|Android/i.test(navigator.userAgent) ? messengerUrl : fbShareFallback}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-700"
        >
          <MessageCircle className="h-4 w-4" />
          <span>Messenger</span>
        </a>
      </div>
    </section>
  );
};
