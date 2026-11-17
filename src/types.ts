export type CountryCode = 'BD' | 'INTL';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  country: CountryCode;
  mobile?: string;
  points: number;
  pointsPeriod?: string;
  balanceUsd: number;
  totalEarnedUsd?: number;
  streak: number;
  lastClaimDate?: string;
  lastActiveDate?: string;
  totalActiveSec?: number;
  totalActiveMinutes?: number;
  ownCode?: string;
  referredBy?: string;
  referredByMasked?: string;
  referralCode?: string | null;
  status?: 'active' | 'suspended';
  suspendReason?: string;
  createdAt?: string;
}

export interface GameItem {
  id: string;
  name: string;
  category: 'পাজল' | 'আর্কেড' | 'অ্যাকশন' | 'ক্যাজুয়াল';
  description: string;
  path: string;
  accent: string;
  iconKey: string;
  estimatedMinutes: number;
}

export interface GameRatingSummary {
  gameId: string;
  upvotes: number;
  ratingSum: number;
  ratingCount: number;
  averageRating: number;
}

export interface WeeklyMissionProgress {
  weekId: string;
  missionId: string;
  title: string;
  daysPlayed: string[];
  targetDays: number;
  completed: boolean;
  rewardClaimed: boolean;
  rewardPoints: number;
  badgeId: string;
  completedAt?: string | null;
}

export interface StaticMissionDef {
  id: string;
  title: string;
  description: string;
  targetDays: number;
  rewardPoints: number;
  badgeId: string;
  badgeTitle: string;
}

export interface BadgeDef {
  id: string;
  title: string;
  description: string;
  conditionLabel: string;
  iconKey: string;
  tier: 'bronze' | 'silver' | 'gold' | 'emerald';
}

export interface NotificationItem {
  id: string;
  type: 'withdrawal' | 'streak' | 'mission' | 'referral' | 'system';
  title: string;
  body: string;
  refId?: string;
  createdAt: string;
  synthetic?: boolean;
}

export type WithdrawalStatus =
  | 'submitted'
  | 'pending'
  | 'verifying'
  | 'approved'
  | 'sent'
  | 'paid'
  | 'rejected';

export interface WithdrawalRecord {
  id: string;
  uid: string;
  method: string;
  methodLabel?: string;
  label?: string;
  accountNo?: string;
  accountDetails?: string;
  amountUsd: number;
  amountBdt: number;
  status: WithdrawalStatus;
  txId?: string;
  rejectReason?: string;
  submittedAt?: string;
  verifyingAt?: string;
  approvedAt?: string;
  sentAt?: string;
  paidAt?: string;
  rejectedAt?: string;
  createdAt: string;
}

export interface FaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
}

export interface SupportTicket {
  id: string;
  uid: string;
  name?: string;
  email?: string;
  category: string;
  subject: string;
  message: string;
  status: 'open' | 'resolved';
  createdAt: string;
}

export interface DailyAnalyticsPoint {
  date: string;
  rawDate?: string;
  newUsers: number;
  dau: number;
  mau: number;
  totalPayoutsUsd: number;
  pendingWithdrawalsCount: number;
  pendingWithdrawalsUsd: number;
}

export interface SuspiciousAlert {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  uid: string;
  userName: string;
  details: string;
  status: 'open' | 'reviewed' | 'dismissed';
  createdAt: string;
}

export interface ReferralConfig {
  totalBonus: number;
  referrerPercent: number;
  inviteePercent: number;
  requiredHours: number;
  waitDays: number;
}

export interface WithdrawConfig {
  usdToBdt: number;
  carryBelowUsd: number;
  mobileRechargeMin: number;
  mobileRechargeMax: number;
  binanceMin: number;
  giftCardMin: number;
  donationMin: number;
  maxPending: number;
}

export interface ReferralEntry {
  id: string;
  maskedName: string;
  verified: boolean;
  playedMinutes: number;
  status: string;
  referrerReward: number;
  createdAt?: string;
}
