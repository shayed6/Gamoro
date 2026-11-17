import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, HelpCircle, MessageSquarePlus, Search } from 'lucide-react';
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { FAQ_CATEGORIES, FAQ_ITEMS, SUPPORT_CATEGORIES } from '../data/faqs';
import { formatBnDateTime, fsTsToIso } from '../lib/format';
import type { SupportTicket } from '../types';

export const FaqPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('সব');
  const [openId, setOpenId] = useState<string>(FAQ_ITEMS[0].id);

  // Support ticket form
  const [ticketCat, setTicketCat] = useState(SUPPORT_CATEGORIES[0]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [myTickets, setMyTickets] = useState<SupportTicket[]>([]);

  useEffect(() => {
    if (!user) {
      setMyTickets([]);
      return;
    }
    async function loadTickets() {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'support_tickets'),
            where('uid', '==', user!.uid),
            orderBy('createdAt', 'desc'),
            limit(10)
          )
        );
        setMyTickets(
          snap.docs.map((d) => {
            const td = d.data();
            return {
              id: d.id,
              uid: String(td.uid || ''),
              category: String(td.category || ''),
              subject: String(td.subject || ''),
              message: String(td.message || ''),
              status: td.status === 'resolved' ? 'resolved' : 'open',
              createdAt: fsTsToIso(td.createdAt),
            };
          })
        );
      } catch {
        setMyTickets([]);
      }
    }
    void loadTickets();
  }, [user]);

  const filteredFaqs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return FAQ_ITEMS.filter((item) => {
      if (category !== 'সব' && item.category !== category) return false;
      if (q && !item.question.toLowerCase().includes(q) && !item.answer.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [search, category]);

  async function handleSubmitTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      showToast('সাপোর্ট টিকিট পাঠাতে আগে লগইন করুন।', 'info');
      return;
    }
    const cleanSub = subject.trim();
    const cleanMsg = message.trim();
    if (cleanSub.length < 3 || cleanSub.length > 140) {
      showToast('বিষয় কমপক্ষে ৩ অক্ষরের হতে হবে।', 'error');
      return;
    }
    if (cleanMsg.length < 10 || cleanMsg.length > 1500) {
      showToast('সমস্যার বিবরণ কমপক্ষে ১০ অক্ষরের হতে হবে।', 'error');
      return;
    }

    setSubmitting(true);
    const ticketId = `tkt_${Date.now()}_${user.uid.slice(0, 6)}`;
    try {
      await setDoc(doc(db, 'support_tickets', ticketId), {
        uid: user.uid,
        name: profile?.name || user.displayName || 'ব্যবহারকারী',
        email: profile?.email || user.email || '',
        category: ticketCat,
        subject: cleanSub,
        message: cleanMsg,
        status: 'open',
        createdAt: serverTimestamp(),
      });
      setMyTickets((prev) => [
        {
          id: ticketId,
          uid: user.uid,
          category: ticketCat,
          subject: cleanSub,
          message: cleanMsg,
          status: 'open',
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setSubject('');
      setMessage('');
      showToast('আপনার সাপোর্ট টিকিট সফলভাবে জমা হয়েছে!', 'success');
    } catch (err) {
      handleFirestoreError(err, 'create', `support_tickets/${ticketId}`);
      showToast('টিকিট জমা দেওয়া যায়নি, পরে আবার চেষ্টা করুন।', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* FAQ Search + Accordion */}
      <section className="space-y-4 lg:col-span-7">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <HelpCircle className="h-6 w-6 text-teal-700 dark:text-teal-300" />
            <span>সাহায্য ও সাধারণ প্রশ্নোত্তর (FAQ)</span>
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            পয়েন্ট, পেমেন্ট, উইথড্রয়াল ও অ্যাকাউন্ট সংক্রান্ত প্রশ্নের উত্তর খুঁজে নিন।
          </p>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-[#11221C]">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="প্রশ্ন খুঁজুন (যেমন: পয়েন্ট, টাকা, উইথড্র)..."
              className="w-full bg-transparent py-2.5 text-sm outline-none"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="বিষয় ফিল্টার"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold outline-none dark:border-slate-700 dark:bg-[#11221C]"
          >
            {FAQ_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2.5">
          {filteredFaqs.map((faq) => {
            const isOpen = openId === faq.id;
            return (
              <div
                key={faq.id}
                className="overflow-hidden rounded-2xl border border-emerald-950/10 bg-white dark:border-emerald-200/10 dark:bg-[#11221C]"
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenId(isOpen ? '' : faq.id)}
                  className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div>
                    <span className="block text-[11px] font-semibold text-teal-700 dark:text-teal-300">
                      {faq.category}
                    </span>
                    <span className="text-sm font-bold">{faq.question}</span>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-600 dark:border-slate-800 dark:text-slate-300">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Support Ticket Submission + History */}
      <section className="space-y-4 lg:col-span-5">
        <div className="rounded-2xl border border-emerald-950/10 bg-white p-5 dark:border-emerald-200/10 dark:bg-[#11221C]">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <MessageSquarePlus className="h-5 w-5 text-teal-700 dark:text-teal-300" />
            <span>সাপোর্ট টিকিট পাঠান</span>
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            ওপরের উত্তরে সমাধান না পেলে সরাসরি আমাদের সাপোর্ট টিমকে লিখুন।
          </p>

          {!user ? (
            <div className="mt-4 rounded-xl bg-[#F4FAF7] p-4 text-center dark:bg-[#172C24]">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                টিকিট জমা দিতে প্রথমে আপনার অ্যাকাউন্টে লগইন করুন।
              </p>
              <Link
                to="/auth"
                className="mt-3 inline-flex min-h-[40px] items-center rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white"
              >
                লগইন করুন
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmitTicket} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold">সমস্যার ধরন</label>
                <select
                  value={ticketCat}
                  onChange={(e) => setTicketCat(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
                >
                  {SUPPORT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold">বিষয়</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="সংক্ষেপে সমস্যাটি লিখুন"
                  className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold">বিস্তারিত বিবরণ</label>
                <textarea
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="কবে সমস্যা হয়েছে এবং বিস্তারিত লিখুন..."
                  className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[44px] w-full rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {submitting ? 'পাঠানো হচ্ছে...' : 'টিকিট জমা দিন'}
              </button>
            </form>
          )}
        </div>

        {myTickets.length > 0 && (
          <div className="rounded-2xl border border-emerald-950/10 bg-white p-5 dark:border-emerald-200/10 dark:bg-[#11221C]">
            <h3 className="text-sm font-bold">আপনার সাম্প্রতিক টিকিট</h3>
            <div className="mt-3 space-y-2">
              {myTickets.map((t) => (
                <div
                  key={t.id}
                  className="rounded-xl bg-[#F4FAF7] p-3 text-xs dark:bg-[#172C24]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">{t.subject}</span>
                    <span
                      className={`font-bold ${
                        t.status === 'resolved'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {t.status === 'resolved' ? 'সমাধান হয়েছে' : 'অপেক্ষমাণ'}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-500 dark:text-slate-400">
                    {t.category} · {formatBnDateTime(t.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
