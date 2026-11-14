// daily-bonus.js — হোমপেজে (index.html) ব্যবহার করুন
//
// HTML-এ একটি বাটন রাখুন:
//   <button id="dailyBtn" class="btn">🎁 আজকের বোনাস নিন</button>
//
// আপনার বিদ্যমান লগইন কোডের ভেতরে (user পাওয়ার পর):
//   import { claimDaily } from './daily-bonus.js';
//   document.getElementById('dailyBtn').onclick = (e) => claimDaily(user, e.currentTarget);
//
// user = Firebase Auth-এর বর্তমান ইউজার অবজেক্ট (getIdToken() আছে এমন)

export async function claimDaily(user, btn) {
  btn.disabled = true;
  btn.textContent = '⏳ অপেক্ষা করুন...';
  try {
    const token = await user.getIdToken();
    const res = await fetch('/api/daily-claim', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
    });
    const d = await res.json();

    if (d.ok) {
      btn.textContent = `✅ +${d.bonus} পয়েন্ট! স্ট্রিক: ${d.streak} দিন`;
      return d;
    }
    if (d.error === 'already') {
      btn.textContent = `✅ আজকের বোনাস নেওয়া হয়েছে (স্ট্রিক: ${d.streak ?? 0})`;
    } else if (d.error === 'verify-email') {
      btn.textContent = '📧 আগে ইমেইল ভেরিফাই করুন';
    } else {
      btn.textContent = '❌ আবার চেষ্টা করুন';
      btn.disabled = false;
    }
  } catch {
    btn.textContent = '❌ নেটওয়ার্ক সমস্যা, আবার চেষ্টা করুন';
    btn.disabled = false;
  }
}
