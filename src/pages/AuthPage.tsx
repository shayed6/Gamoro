import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Phone, ShieldCheck } from 'lucide-react';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  GoogleAuthProvider,
  RecaptchaVerifier,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  updateProfile,
  type ConfirmationResult,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { syncReferralInit } from '../lib/api';
import { clearPendingReferral, getPendingReferral } from '../lib/storage';
import type { CountryCode } from '../types';

type AuthView = 'login' | 'signup' | 'phone' | 'complete' | 'forgot';

declare global {
  interface Window {
    gamoroRecaptcha?: RecaptchaVerifier;
  }
}

export const AuthPage: React.FC = () => {
  const { refreshUserData } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [view, setView] = useState<AuthView>(() => {
    const hash = location.hash.replace('#', '');
    if (hash === 'signup' || hash === 'phone' || hash === 'forgot') return hash as AuthView;
    if (getPendingReferral()) return 'signup';
    return 'login';
  });

  const [loading, setLoading] = useState(false);

  // Login state
  const [lEmail, setLEmail] = useState('');
  const [lPass, setLPass] = useState('');

  // Signup state
  const [sName, setSName] = useState('');
  const [sCountry, setSCountry] = useState<CountryCode>('BD');
  const [sMob, setSMob] = useState('');
  const [sEmail, setSEmail] = useState('');
  const [sPass, setSPass] = useState('');
  const [sRef, setSRef] = useState(() => getPendingReferral());
  const [sTerms, setSTerms] = useState(true);

  // Phone OTP state
  const [phoneNum, setPhoneNum] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [confirmObj, setConfirmObj] = useState<ConfirmationResult | null>(null);

  // Complete profile state (Google / Phone new user)
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [cName, setCName] = useState('');
  const [cCountry, setCCountry] = useState<CountryCode>('BD');
  const [cMob, setCMob] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cRef, setCRef] = useState(() => getPendingReferral());

  // Forgot password state
  const [fEmail, setFEmail] = useState('');

  useEffect(() => {
    const hash = location.hash.replace('#', '');
    if (hash === 'signup' || hash === 'login' || hash === 'phone' || hash === 'forgot') {
      setView(hash as AuthView);
    }
  }, [location.hash]);

  async function finalizePostAuth(u: User) {
    try {
      const snap = await getDoc(doc(db, 'users', u.uid));
      if (snap.exists()) {
        clearPendingReferral();
        await syncReferralInit().catch(() => {});
        await refreshUserData();
        showToast('স্বাগতম! লগইন সফল হয়েছে।', 'success');
        navigate('/');
      } else {
        setPendingUser(u);
        setCName(u.displayName || '');
        setCEmail(u.email || '');
        if (u.phoneNumber && u.phoneNumber.startsWith('+8801')) {
          setCMob(u.phoneNumber.slice(3));
        }
        setView('complete');
      }
    } catch {
      showToast('প্রোফাইল যাচাই করা যায়নি।', 'error');
    }
  }

  async function handleGoogleLogin() {
    setLoading(true);
    try {
      const res = await signInWithPopup(auth, new GoogleAuthProvider());
      if (res.user) {
        await finalizePostAuth(res.user);
      }
    } catch {
      showToast('Google লগইন বাতিল বা ব্যর্থ হয়েছে।', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!lEmail.trim() || !lPass) {
      showToast('ইমেইল ও পাসওয়ার্ড লিখুন।', 'error');
      return;
    }
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, lEmail.trim(), lPass);
      await finalizePostAuth(cred.user);
    } catch {
      showToast('ইমেইল বা পাসওয়ার্ড সঠিক নয়।', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!sName.trim()) return showToast('আপনার পুরো নাম লিখুন।', 'error');
    if (sCountry === 'BD' && !/^01[3-9]\d{8}$/.test(sMob.trim())) {
      return showToast('১১ ডিজিটের সঠিক বাংলাদেশি মোবাইল নম্বর দিন।', 'error');
    }
    if (!sEmail.trim() || sPass.length < 8) {
      return showToast('সঠিক ইমেইল ও কমপক্ষে ৮ অক্ষরের পাসওয়ার্ড দিন।', 'error');
    }
    if (!sTerms) return showToast('শর্তাবলী মেনে নিতে টিক দিন।', 'error');

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, sEmail.trim(), sPass);
      const u = cred.user;
      await updateProfile(u, { displayName: sName.trim() }).catch(() => {});

      const payload: Record<string, unknown> = {
        name: sName.trim(),
        country: sCountry,
        email: sEmail.trim(),
        referralCode: sRef.trim() ? sRef.trim().toUpperCase() : null,
        createdAt: serverTimestamp(),
      };
      if (sCountry === 'BD') {
        payload.mobile = `+88${sMob.trim()}`;
      }

      try {
        await setDoc(doc(db, 'users', u.uid), payload);
      } catch (dbErr) {
        handleFirestoreError(dbErr, 'create', `users/${u.uid}`);
        await deleteUser(u).catch(() => {});
        throw dbErr;
      }

      clearPendingReferral();
      await syncReferralInit().catch(() => {});
      await sendEmailVerification(u).catch(() => {});
      await refreshUserData();
      showToast('অ্যাকাউন্ট তৈরি হয়েছে! ইমেইলে ভেরিফাই লিংক পাঠানো হয়েছে।', 'success');
      navigate('/');
    } catch {
      showToast('অ্যাকাউন্ট তৈরি করা যায়নি (ইমেইলটি আগে ব্যবহার হয়ে থাকতে পারে)।', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendPhoneOtp(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = phoneNum.trim().replace(/\D/g, '');
    const e164 = cleaned.startsWith('8801')
      ? `+${cleaned}`
      : cleaned.startsWith('01')
      ? `+88${cleaned}`
      : phoneNum.trim();

    if (!/^\+\d{10,15}$/.test(e164)) {
      return showToast('সঠিক মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।', 'error');
    }

    setLoading(true);
    try {
      if (!window.gamoroRecaptcha) {
        window.gamoroRecaptcha = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
        });
      }
      const conf = await signInWithPhoneNumber(auth, e164, window.gamoroRecaptcha);
      setConfirmObj(conf);
      showToast('আপনার মোবাইলে OTP কোড পাঠানো হয়েছে।', 'success');
    } catch {
      showToast('OTP পাঠানো যায়নি। অনুগ্রহ করে Google বা ইমেইল লগইন ব্যবহার করুন।', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyPhoneOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmObj || !otpCode.trim()) return;
    setLoading(true);
    try {
      const cred = await confirmObj.confirm(otpCode.trim());
      if (cred.user) {
        await finalizePostAuth(cred.user);
      }
    } catch {
      showToast('OTP কোড সঠিক নয়।', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleCompleteProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingUser) return;
    if (!cName.trim()) return showToast('আপনার নাম লিখুন।', 'error');
    const resolvedEmail = (cEmail || pendingUser.email || `${pendingUser.uid}@phone.gamoro.app`).trim();
    if (cCountry === 'BD' && !/^01[3-9]\d{8}$/.test(cMob.trim())) {
      return showToast('১১ ডিজিটের সঠিক বাংলাদেশি মোবাইল নম্বর দিন।', 'error');
    }

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        name: cName.trim(),
        country: cCountry,
        email: resolvedEmail,
        referralCode: cRef.trim() ? cRef.trim().toUpperCase() : null,
        createdAt: serverTimestamp(),
      };
      if (cCountry === 'BD') {
        payload.mobile = `+88${cMob.trim()}`;
      }
      await setDoc(doc(db, 'users', pendingUser.uid), payload);
      clearPendingReferral();
      await syncReferralInit().catch(() => {});
      await refreshUserData();
      showToast('প্রোফাইল সম্পন্ন হয়েছে!', 'success');
      navigate('/');
    } catch (err) {
      handleFirestoreError(err, 'create', `users/${pendingUser.uid}`);
      showToast('প্রোফাইল সংরক্ষণ করা যায়নি।', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!fEmail.trim()) return showToast('ইমেইল লিখুন।', 'error');
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, fEmail.trim());
      showToast('পাসওয়ার্ড রিসেট লিংক ইমেইলে পাঠানো হয়েছে।', 'success');
      setView('login');
    } catch {
      showToast('রিসেট ইমেইল পাঠানো যায়নি।', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-emerald-950/10 bg-white p-6 shadow-sm dark:border-emerald-200/10 dark:bg-[#11221C]">
        {view !== 'complete' && view !== 'forgot' && (
          <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl bg-[#F4FAF7] p-1 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setView('login')}
              className={`rounded-lg py-2 text-xs font-bold transition-colors ${
                view === 'login' ? 'bg-teal-700 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              লগইন
            </button>
            <button
              type="button"
              onClick={() => setView('signup')}
              className={`rounded-lg py-2 text-xs font-bold transition-colors ${
                view === 'signup' ? 'bg-teal-700 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              সাইন আপ
            </button>
            <button
              type="button"
              onClick={() => setView('phone')}
              className={`rounded-lg py-2 text-xs font-bold transition-colors ${
                view === 'phone' ? 'bg-teal-700 text-white' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              ফোন OTP
            </button>
          </div>
        )}

        {(view === 'login' || view === 'signup') && (
          <>
            <button
              type="button"
              disabled={loading}
              onClick={handleGoogleLogin}
              className="flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <ShieldCheck className="h-4 w-4 text-teal-600" />
              <span>Google দিয়ে চালিয়ে যান</span>
            </button>
            <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              <span>অথবা</span>
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>
          </>
        )}

        {view === 'login' && (
          <form onSubmit={handleEmailLogin} className="space-y-3.5">
            <h1 className="text-lg font-bold">লগইন করুন</h1>
            <div>
              <label className="mb-1 block text-xs font-bold">ইমেইল</label>
              <input
                type="email"
                value={lEmail}
                onChange={(e) => setLEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold">পাসওয়ার্ড</label>
              <input
                type="password"
                value={lPass}
                onChange={(e) => setLPass(e.target.value)}
                placeholder="পাসওয়ার্ড"
                className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div className="text-right">
              <button
                type="button"
                onClick={() => setView('forgot')}
                className="text-xs font-bold text-teal-700 hover:underline dark:text-teal-300"
              >
                পাসওয়ার্ড ভুলে গেছেন?
              </button>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="min-h-[44px] w-full rounded-xl bg-teal-700 py-2.5 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {loading ? 'লগইন হচ্ছে...' : 'লগইন'}
            </button>
          </form>
        )}

        {view === 'signup' && (
          <form onSubmit={handleEmailSignup} className="space-y-3">
            <h1 className="text-lg font-bold">নতুন অ্যাকাউন্ট খুলুন</h1>
            <div>
              <label className="mb-1 block text-xs font-bold">পুরো নাম</label>
              <input
                type="text"
                value={sName}
                onChange={(e) => setSName(e.target.value)}
                placeholder="আপনার নাম"
                className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-xs font-bold">দেশ</label>
                <select
                  value={sCountry}
                  onChange={(e) => setSCountry(e.target.value as CountryCode)}
                  className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="BD">বাংলাদেশ</option>
                  <option value="INTL">অন্যান্য</option>
                </select>
              </div>
              {sCountry === 'BD' && (
                <div>
                  <label className="mb-1 block text-xs font-bold">মোবাইল (+৮৮)</label>
                  <input
                    type="tel"
                    maxLength={11}
                    value={sMob}
                    onChange={(e) => setSMob(e.target.value.replace(/\D/g, ''))}
                    placeholder="01XXXXXXXXX"
                    className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold">ইমেইল</label>
              <input
                type="email"
                value={sEmail}
                onChange={(e) => setSEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold">পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)</label>
              <input
                type="password"
                value={sPass}
                onChange={(e) => setSPass(e.target.value)}
                placeholder="********"
                className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold">রেফারেল কোড (ঐচ্ছিক)</label>
              <input
                type="text"
                value={sRef}
                onChange={(e) => setSRef(e.target.value.toUpperCase())}
                placeholder="বন্ধুর কোড থাকলে দিন"
                className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm uppercase outline-none dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={sTerms}
                onChange={(e) => setSTerms(e.target.checked)}
                className="h-4 w-4 accent-teal-700"
              />
              <span>আমি Gamoro-এর শর্তাবলী ও নিয়মাবলি মেনে নিচ্ছি।</span>
            </label>
            <button
              type="submit"
              disabled={loading}
              className="min-h-[44px] w-full rounded-xl bg-teal-700 py-2.5 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {loading ? 'তৈরি হচ্ছে...' : 'ফ্রি অ্যাকাউন্ট খুলুন'}
            </button>
          </form>
        )}

        {view === 'phone' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-teal-700 dark:text-teal-300" />
              <h1 className="text-lg font-bold">ফোন নম্বর দিয়ে লগইন</h1>
            </div>
            {!confirmObj ? (
              <form onSubmit={handleSendPhoneOtp} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-bold">মোবাইল নম্বর (বাংলাদেশ +88)</label>
                  <input
                    type="tel"
                    value={phoneNum}
                    onChange={(e) => setPhoneNum(e.target.value)}
                    placeholder="017XXXXXXXX"
                    className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-[44px] w-full rounded-xl bg-teal-700 py-2.5 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  {loading ? 'OTP পাঠানো হচ্ছে...' : 'OTP কোড পাঠান'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyPhoneOtp} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-bold">৬ ডিজিটের OTP কোড</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="123456"
                    className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-center text-lg font-bold tracking-widest outline-none dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-[44px] w-full rounded-xl bg-teal-700 py-2.5 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  {loading ? 'যাচাই হচ্ছে...' : 'যাচাই করে লগইন করুন'}
                </button>
              </form>
            )}
            <div id="recaptcha-container" />
          </div>
        )}

        {view === 'complete' && (
          <form onSubmit={handleCompleteProfile} className="space-y-3">
            <h1 className="text-lg font-bold">প্রোফাইল সম্পূর্ণ করুন</h1>
            <p className="text-xs text-slate-500">খেলা শুরু করতে আপনার তথ্য নিশ্চিত করুন।</p>
            <div>
              <label className="mb-1 block text-xs font-bold">পুরো নাম</label>
              <input
                type="text"
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            {!pendingUser?.email && (
              <div>
                <label className="mb-1 block text-xs font-bold">ইমেইল</label>
                <input
                  type="email"
                  value={cEmail}
                  onChange={(e) => setCEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-bold">দেশ</label>
              <select
                value={cCountry}
                onChange={(e) => setCCountry(e.target.value as CountryCode)}
                className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="BD">বাংলাদেশ</option>
                <option value="INTL">অন্যান্য</option>
              </select>
            </div>
            {cCountry === 'BD' && (
              <div>
                <label className="mb-1 block text-xs font-bold">মোবাইল নম্বর</label>
                <input
                  type="tel"
                  maxLength={11}
                  value={cMob}
                  onChange={(e) => setCMob(e.target.value.replace(/\D/g, ''))}
                  placeholder="01XXXXXXXXX"
                  className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-bold">রেফারেল কোড (ঐচ্ছিক)</label>
              <input
                type="text"
                value={cRef}
                onChange={(e) => setCRef(e.target.value.toUpperCase())}
                className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm uppercase outline-none dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="min-h-[44px] w-full rounded-xl bg-teal-700 py-2.5 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {loading ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন ও শুরু করুন'}
            </button>
          </form>
        )}

        {view === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="space-y-3">
            <h1 className="text-lg font-bold">পাসওয়ার্ড রিসেট</h1>
            <p className="text-xs text-slate-500">আপনার নিবন্ধিত ইমেইলে রিসেট লিংক পাঠানো হবে।</p>
            <input
              type="email"
              value={fEmail}
              onChange={(e) => setFEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-slate-200 bg-[#F4FAF7] px-3 py-2.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
            />
            <button
              type="submit"
              disabled={loading}
              className="min-h-[44px] w-full rounded-xl bg-teal-700 py-2.5 text-sm font-bold text-white hover:bg-teal-800"
            >
              রিসেট লিংক পাঠান
            </button>
            <button
              type="button"
              onClick={() => setView('login')}
              className="w-full py-1 text-center text-xs font-bold text-teal-700 dark:text-teal-300"
            >
              ← লগইনে ফিরুন
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
