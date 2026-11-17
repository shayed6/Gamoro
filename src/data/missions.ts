import type { StaticMissionDef } from '../types';

export const WEEKLY_PRIMARY_MISSION: StaticMissionDef = {
  id: 'weekly-play-3-days',
  title: 'এই সপ্তাহে ৩ দিন খেলুন',
  description: 'চলতি সপ্তাহের যেকোনো ৩টি আলাদা দিনে অন্তত ১ মিনিট সক্রিয়ভাবে গেম খেললেই মিশন সম্পন্ন হবে।',
  targetDays: 3,
  rewardPoints: 150,
  badgeId: 'weekly-warrior',
  badgeTitle: 'সাপ্তাহিক যোদ্ধা',
};

export const WEEKLY_MISSIONS_CATALOG: StaticMissionDef[] = [
  WEEKLY_PRIMARY_MISSION,
  {
    id: 'weekly-streak-keeper',
    title: 'দৈনিক বোনাস ধারাবাহিকতা',
    description: 'টানা ৭ দিন দৈনিক বোনাস ক্লেইম করলে ৭ম দিনে ৫০ পয়েন্ট বোনাস পাবেন।',
    targetDays: 7,
    rewardPoints: 50,
    badgeId: 'streak-7',
    badgeTitle: '৭ দিনের স্ট্রিক',
  },
];

export const DAILY_BONUS_CYCLE = [5, 5, 10, 10, 15, 15, 50];
