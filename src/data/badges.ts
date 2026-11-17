import type { BadgeDef, UserProfile, WeeklyMissionProgress } from '../types';

export const BADGES: BadgeDef[] = [
  {
    id: 'first-10-min',
    title: 'প্রথম ১০ মিনিট',
    description: 'মোট ১০ মিনিট সক্রিয়ভাবে গেম খেলার প্রথম মাইলফলক।',
    conditionLabel: '১০ মিনিট খেলা',
    iconKey: 'clock',
    tier: 'bronze',
  },
  {
    id: 'streak-7',
    title: '৭ দিনের স্ট্রিক',
    description: 'টানা ৭ দিন অ্যাপে এসে দৈনিক বোনাস ক্লেইম করা।',
    conditionLabel: '৭ দিন স্ট্রিক',
    iconKey: 'flame',
    tier: 'gold',
  },
  {
    id: 'weekly-warrior',
    title: 'সাপ্তাহিক যোদ্ধা',
    description: 'যেকোনো একটি সাপ্তাহিক মিশন সম্পূর্ণ করা।',
    conditionLabel: 'মিশন সম্পন্ন',
    iconKey: 'target',
    tier: 'emerald',
  },
  {
    id: 'games-100',
    title: '১০০ গেম খেলা',
    description: 'মোট ১০০টি গেম সেশন খেলা বা ৫০+ ঘণ্টা সক্রিয় থাকা।',
    conditionLabel: '১০০ সেশন',
    iconKey: 'gamepad',
    tier: 'gold',
  },
  {
    id: 'first-referral',
    title: 'প্রথম রেফারেল',
    description: 'আপনার লিংকের মাধ্যমে প্রথম বন্ধুকে যুক্ত করা।',
    conditionLabel: '১টি রেফারেল',
    iconKey: 'users',
    tier: 'silver',
  },
  {
    id: 'point-hunter',
    title: 'পয়েন্ট শিকারি',
    description: 'চলতি মাসে অন্তত ৫০০ পয়েন্ট অর্জন করা।',
    conditionLabel: '৫০০+ পয়েন্ট',
    iconKey: 'award',
    tier: 'silver',
  },
];

export interface BadgeEvalInput {
  profile: UserProfile | null;
  mission: WeeklyMissionProgress | null;
  referralCount: number;
  localPlayCount: number;
}

export function getUnlockedBadgeIds(input: BadgeEvalInput): Set<string> {
  const unlocked = new Set<string>();
  const { profile, mission, referralCount, localPlayCount } = input;
  if (!profile) return unlocked;

  const totalMin = Number(profile.totalActiveMinutes || (profile.totalActiveSec || 0) / 60 || 0);
  if (totalMin >= 10) unlocked.add('first-10-min');
  if (Number(profile.streak || 0) >= 7) unlocked.add('streak-7');
  if (mission?.completed) unlocked.add('weekly-warrior');
  if (localPlayCount >= 100 || totalMin >= 3000) unlocked.add('games-100');
  if (referralCount >= 1) unlocked.add('first-referral');
  if (Number(profile.points || 0) >= 500) unlocked.add('point-hunter');

  return unlocked;
}
