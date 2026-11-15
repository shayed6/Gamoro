/**
 * Gamoro - Verification & Backend API Configuration
 * 
 * মোবাইল ও টেলিগ্রাম ভেরিফিকেশনের জন্য এন্ডপয়েন্ট ধ্রুবক।
 * মান আপাতত ফাঁকা রাখা আছে। কোনো মান না থাকলে UI ব্যবহারকারীকে
 * "ভেরিফিকেশন শীঘ্রই চালু হবে।" বার্তা দেখাবে।
 */

export const SEND_OTP_URL = "";
export const VERIFY_OTP_URL = "";
export const TELEGRAM_CODE_URL = "";
export const TELEGRAM_BOT_LINK = "";
export const WITHDRAW_URL = "/api/withdraw";
export const SET_PIN_URL = "/api/set-pin";
export const RESET_PIN_URL = "/api/reset-pin";
export const HEARTBEAT_URL = "/api/heartbeat";
export const ADMIN_API_URL = "/api/admin";
export const REFERRAL_API_URL = "/api/referral";

// লাইভ করার আগে অবশ্যই true করতে হবে
export const ADMIN_PRODUCTION = false;

export const DELETE_ACCOUNT_URL = "/api/delete-account";
