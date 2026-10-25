/**
 * Gamoro - Firebase Configuration & Initialization
 * 
 * আপনার Firebase Console (https://console.firebase.google.com/) থেকে
 * প্রজেক্ট তৈরি করে Authentication (Email/Password) এবং Cloud Firestore চালু করুন।
 * এরপর নিচে আপনার প্রজেক্টের আসল কনফিগারেশন তথ্য বসিয়ে দিন।
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// আপনার Firebase প্রোজেক্টের Credentials নিচে দিন:
export const firebaseConfig = {
  apiKey: "AIzaSyB1jN9vaax8Bqycj1YweGx-DpTdrMxnkis",
  authDomain: "gamoro-e48db.firebaseapp.com",
  projectId: "gamoro-e48db",
  storageBucket: "gamoro-e48db.firebasestorage.app",
  messagingSenderId: "330424559122",
  appId: "1:330424559122:web:9793e63b9d6a97ba949acb"
};

// চেক করে কনফিগারেশন আসল নাকি ডামি প্লেসহোল্ডার
export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.includes("YOUR_API_KEY") &&
    firebaseConfig.projectId &&
    !firebaseConfig.projectId.includes("YOUR_PROJECT_ID")
  );
}

// Firebase App ইনিশিয়ালাইজেশন
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Firebase Authentication ইনস্ট্যান্স
export const auth = getAuth(app);

// Cloud Firestore ডাটাবেস ইনস্ট্যান্স
export const db = getFirestore(app);

/**
 * Firestore অপারেশন এরর হ্যান্ডলার
 */
export function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
    },
    operationType,
    path
  };
  console.error("Firestore Error:", JSON.stringify(errInfo));
  return errInfo;
}
