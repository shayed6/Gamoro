# Gamoro — বাংলা মোবাইল-ফার্স্ট গেমিং ও রিওয়ার্ডস ওয়েব অ্যাপ

Gamoro হলো বাংলাদেশি ব্যবহারকারীদের জন্য তৈরি একটি দ্রুতগতির, কম-খরচের (Firestore write-optimized) বাংলা গেমিং ও রিওয়ার্ডস প্ল্যাটফর্ম।

---

## ফোল্ডার কাঠামো (Folder Structure)

```text
├── src/
│   ├── components/       # Layout (Mobile Bottom Tabs + Desktop Nav), GameCard, WithdrawalTracker, ShareReferralCard
│   ├── context/          # AuthContext, ThemeContext, ToastContext
│   ├── data/             # Static Bengali seed data (games.ts, missions.ts, badges.ts, faqs.ts)
│   ├── lib/              # Firebase client, storage (localStorage cache), Web Push hook, API client, Session Tracker
│   ├── pages/            # HomePage, GamesPage, PlayPage, MissionsPage, NotificationsPage, ProfilePage, WithdrawPage, FaqPage, LeaderboardPage, AuthPage, DeleteAccountPage, AdminPage
│   ├── types.ts          # TypeScript domain models
│   ├── App.tsx           # Route definitions
│   └── main.tsx          # React entry
├── functions/
│   ├── _lib/firebase.js  # Auth verification, custom claim check (admin/role), Firestore REST tx helpers
│   └── api/              # heartbeat, daily-claim, ad-reward, withdraw, referral, delete-account, admin
├── public/games/demo/    # Embedded playable HTML5 game arena
├── firestore.rules       # Production security rules
├── firestore.indexes.json
├── firebase-blueprint.json
└── FIRESTORE_SCHEMA.md   # Full schema & cost-optimization guide
```

---

## মূল বৈশিষ্ট্যসমূহ

1. **সাপ্তাহিক মিশন ও ব্যাজ**: `users/{uid}/missions/{weekId}` ডকুমেন্টে শুধুমাত্র নতুন দিনে ন্যূনতম ১ মিনিট খেলা বা মিশন সম্পন্ন হলে রাইট হয় (+১৫০ পয়েন্ট ও "সাপ্তাহিক যোদ্ধা" ব্যাজ)। ব্যাজ গ্যালারি (`src/data/badges.ts`) ক্যাশ করা পরিসংখ্যান থেকে লোকালি গণনা করে।
2. **পছন্দের গেম ও "আবার খেলুন"**: সম্পূর্ণ `localStorage`-এ সংরক্ষিত (০ Firestore write)।
3. **গেম ভোটিং ও রেটিং**: সপ্তাহে সর্বোচ্চ ১ বার প্রতি গেমে 👍 বা ১–৫ স্টার রেটিং; একক ডকুমেন্ট `games/{gameId}/ratings/summary`-এ সংরক্ষিত।
4. **উইথড্রয়াল স্ট্যাটাস ট্র্যাকার ও নোটিফিকেশন**: `জমা দেওয়া হয়েছে → যাচাই চলছে → অনুমোদিত → পাঠানো হয়েছে` ভিজ্যুয়াল স্টেপার; প্রতিটি পরিবর্তনে `notifications/{uid}/items`-এ নোটিফিকেশন এবং `localStorage`-এ Mark-as-Read (০ write)।
5. **শেয়ার ও রেফারেল**: Web Share API, WhatsApp ও Messenger ওয়ান-ট্যাপ শেয়ার (`/?ref={uid|code}`)।
6. **সাহায্য ও FAQ**: বাংলা FAQ সার্চ + `support_tickets` ফর্ম।
7. **অ্যাডমিন অ্যানালিটিক্স ও সতর্কতা (`/admin`)**: Firebase Custom Claim (`role: 'admin'` বা `admin: true`) দ্বারা সুরক্ষিত। Recharts চার্ট (`analytics_daily`), সন্দেহজনক কার্যকলাপ (`alerts` - Review/Dismiss), উইথড্রয়াল অনুমোদন ও টিকিট সমাধান।

---

## সেটআপ ও ডেভেলপমেন্ট

```bash
npm install
npm run dev       # http://localhost:3000
npm run lint      # TypeScript typecheck
npm run build     # Production dist/ build
```

### Firebase Custom Claim সেট করা (Admin এর জন্য)
Firebase Admin SDK দিয়ে অ্যাডমিন অ্যাকাউন্টে নিচের যেকোনো একটি Custom Claim সেট করুন:
```js
await admin.auth().setCustomUserClaims(uid, { admin: true, role: 'admin' });
```
এবং `firestore.rules` ও `firestore.indexes.json` ডিপ্লয় করুন:
```bash
firebase deploy --only firestore:rules,firestore:indexes
```
