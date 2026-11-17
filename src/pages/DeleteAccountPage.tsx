import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
} from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { deleteAccountRequest } from '../lib/api';

export const DeleteAccountPage: React.FC = () => {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [needsReauth, setNeedsReauth] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!user) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-emerald-950/10 bg-white p-6 text-center dark:border-emerald-200/10 dark:bg-[#11221C]">
        <p className="text-sm font-medium">অ্যাকাউন্ট মুছতে প্রথমে লগইন করুন।</p>
        <Link
          to="/auth"
          className="mt-4 inline-flex min-h-[40px] items-center rounded-xl bg-teal-700 px-5 py-2 text-xs font-bold text-white"
        >
          লগইন করুন
        </Link>
      </div>
    );
  }

  const isGoogle = user.providerData.some((p) => p.providerId === 'google.com');

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    if (confirmText.trim() !== 'মুছে ফেলুন') {
      showToast('নিশ্চিত করতে ঠিকভাবে "মুছে ফেলুন" লিখুন।', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await deleteAccountRequest(confirmText.trim());
      if (res.ok) {
        showToast('আপনার অ্যাকাউন্ট স্থায়ীভাবে মুছে ফেলা হয়েছে।', 'success');
        await logout().catch(() => {});
        navigate('/');
      } else if (res.error === 'recent_login_required') {
        setNeedsReauth(true);
        showToast('নিরাপত্তার জন্য পুনরায় লগইন নিশ্চিত করুন।', 'info');
      } else if (res.error === 'pending_payout') {
        showToast('অপেক্ষমাণ উইথড্রয়াল আবেদন থাকায় অ্যাকাউন্ট মোছা যাবে না।', 'error');
      } else {
        showToast('অ্যাকাউন্ট মোছা যায়নি, পরে আবার চেষ্টা করুন।', 'error');
      }
    } catch {
      showToast('সার্ভারের সাথে সংযোগ হয়নি।', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReauthGoogle() {
    if (!user) return;
    try {
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
      setNeedsReauth(false);
      showToast('পুনরায় যাচাই সফল! এখন মোছার বাটনে চাপ দিন।', 'success');
    } catch {
      showToast('Google যাচাই ব্যর্থ হয়েছে।', 'error');
    }
  }

  async function handleReauthPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !user.email) return;
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
      setPassword('');
      setNeedsReauth(false);
      showToast('পাসওয়ার্ড যাচাই সফল! এখন মোছার বাটনে চাপ দিন।', 'success');
    } catch {
      showToast('পাসওয়ার্ড সঠিক নয়।', 'error');
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="rounded-2xl border border-rose-200 bg-white p-6 dark:border-rose-900/50 dark:bg-[#11221C]">
        <div className="flex items-center gap-3 text-rose-700 dark:text-rose-400">
          <AlertTriangle className="h-6 w-6 shrink-0" />
          <h1 className="text-xl font-bold">অ্যাকাউন্ট স্থায়ীভাবে মুছে ফেলুন</h1>
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          অ্যাকাউন্ট মুছে ফেললে আপনার প্রোফাইল, অর্জিত পয়েন্ট, ব্যালেন্স ও গেম সেশন স্থায়ীভাবে মুছে যাবে এবং পুনরুদ্ধার করা যাবে না।
        </p>

        <form onSubmit={handleDelete} className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold">
              নিশ্চিত করতে নিচের ঘরে <span className="text-rose-600">মুছে ফেলুন</span> লিখুন
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="মুছে ফেলুন"
              className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm outline-none focus:border-rose-500 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="min-h-[44px] w-full rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {submitting ? 'মুছে ফেলা হচ্ছে...' : 'স্থায়ীভাবে অ্যাকাউন্ট মুছে ফেলুন'}
          </button>
        </form>

        {needsReauth && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/60">
            <p className="flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-200">
              <ShieldCheck className="h-4 w-4" />
              <span>নিরাপত্তার জন্য গত ৫ মিনিটের মধ্যে পুনরায় লগইন করুন</span>
            </p>
            {isGoogle ? (
              <button
                type="button"
                onClick={handleReauthGoogle}
                className="mt-3 min-h-[40px] w-full rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white"
              >
                Google দিয়ে নিশ্চিত করুন
              </button>
            ) : (
              <form onSubmit={handleReauthPassword} className="mt-3 flex gap-2">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="বর্তমান পাসওয়ার্ড"
                  className="flex-1 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs outline-none dark:bg-slate-900"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-amber-700 px-3.5 py-2 text-xs font-bold text-white"
                >
                  যাচাই
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
