import type { GameItem } from '../types';

export const GAMES: GameItem[] = [
  {
    id: 'color-match',
    name: 'রঙ মিলান',
    category: 'পাজল',
    description: 'দ্রুত রঙের ধাঁধা মিলিয়ে স্কোর ও পয়েন্ট বাড়ান।',
    path: '/games/demo/index.html',
    accent: 'from-emerald-600 to-teal-700',
    iconKey: 'palette',
    estimatedMinutes: 3,
  },
  {
    id: 'speed-tap',
    name: 'দ্রুত ট্যাপ',
    category: 'আর্কেড',
    description: 'লক্ষ্য বৃত্তে দ্রুত ট্যাপ করে সর্বোচ্চ কম্বো গড়ুন।',
    path: '/games/demo/index.html',
    accent: 'from-amber-500 to-orange-600',
    iconKey: 'zap',
    estimatedMinutes: 2,
  },
  {
    id: 'memory-card',
    name: 'মেমোরি কার্ড',
    category: 'পাজল',
    description: 'জোড়া কার্ড মনে রেখে কম চালে বোর্ড পরিষ্কার করুন।',
    path: '/games/demo/index.html',
    accent: 'from-teal-600 to-cyan-700',
    iconKey: 'grid',
    estimatedMinutes: 4,
  },
  {
    id: 'puzzle-time',
    name: 'পাজল টাইম',
    category: 'পাজল',
    description: 'সময়ের বিরুদ্ধে টাইল সাজিয়ে বোনাস পয়েন্ট জিতুন।',
    path: '/games/demo/index.html',
    accent: 'from-indigo-600 to-blue-700',
    iconKey: 'puzzle',
    estimatedMinutes: 5,
  },
  {
    id: 'space-run',
    name: 'স্পেস রান',
    category: 'অ্যাকশন',
    description: 'বাধা এড়িয়ে মহাকাশযান নিয়ে এগিয়ে যান।',
    path: '/games/demo/index.html',
    accent: 'from-slate-700 to-emerald-800',
    iconKey: 'rocket',
    estimatedMinutes: 4,
  },
  {
    id: 'fruit-slice',
    name: 'ফল কাটুন',
    category: 'ক্যাজুয়াল',
    description: 'বোমা এড়িয়ে তাজা ফল কেটে কম্বো স্কোর করুন।',
    path: '/games/demo/index.html',
    accent: 'from-rose-500 to-orange-500',
    iconKey: 'scissors',
    estimatedMinutes: 3,
  },
  {
    id: 'ball-bounce',
    name: 'বল বাউন্স',
    category: 'আর্কেড',
    description: 'সঠিক সময়ে বাউন্স করে ইটের দেয়াল ভাঙুন।',
    path: '/games/demo/index.html',
    accent: 'from-cyan-600 to-teal-700',
    iconKey: 'circle',
    estimatedMinutes: 3,
  },
  {
    id: 'match-three',
    name: 'ম্যাচ থ্রি',
    category: 'পাজল',
    description: 'একই রত্ন সারিবদ্ধ করে চেইন রিয়্যাকশন তৈরি করুন।',
    path: '/games/demo/index.html',
    accent: 'from-fuchsia-600 to-purple-700',
    iconKey: 'sparkles',
    estimatedMinutes: 5,
  },
  {
    id: 'mini-football',
    name: 'মিনি ফুটবল',
    category: 'ক্যাজুয়াল',
    description: 'সঠিক কোণে শট নিয়ে টানা গোল করার চ্যালেঞ্জ।',
    path: '/games/demo/index.html',
    accent: 'from-green-600 to-emerald-800',
    iconKey: 'trophy',
    estimatedMinutes: 3,
  },
];

export const GAME_CATEGORIES: Array<'সব' | GameItem['category']> = [
  'সব',
  'পাজল',
  'আর্কেড',
  'অ্যাকশন',
  'ক্যাজুয়াল',
];

export function getGameById(id: string | null | undefined): GameItem | null {
  if (!id) return null;
  return GAMES.find((g) => g.id === id) || null;
}
