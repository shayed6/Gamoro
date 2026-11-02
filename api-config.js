/**
 * Gamoro - Verification API Configuration
 * 
 * মোবাইল ও টেলিগ্রাম ভেরিফিকেশনের জন্য এন্ডপয়েন্ট ধ্রুবক।
 * মান আপাতত ফাঁকা রাখা আছে। কোনো মান না থাকলে UI ব্যবহারকারীকে
 * "ভেরিফিকেশন শীঘ্রই চালু হবে।" বার্তা দেখাবে।
 */

export const SEND_OTP_URL = "";
export const VERIFY_OTP_URL = "";
export const TELEGRAM_CODE_URL = "";
export const TELEGRAM_BOT_LINK = "";
export const WITHDRAW_URL = "/.netlify/functions/withdraw";
export const SET_PIN_URL = "/.netlify/functions/set-pin";
export const SESSION_URL = "/.netlify/functions/session";
export const ADMIN_API_URL = "/.netlify/functions/admin";

// লাইভ করার আগে অবশ্যই true করতে হবে
export const ADMIN_PRODUCTION = false;

export const DELETE_ACCOUNT_URL = "/.netlify/functions/delete-account";
export const SUPPORT_EMAIL = "support@gamoro.club";

