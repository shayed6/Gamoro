# Gamoro — Firestore Schema, Optimization Strategy & Indexes

## Design Goals (Cost & Performance)
1. **Minimize Firestore Writes**:
   - Playtime checkpoints flush every **5 minutes** (300s) + `pagehide` `sendBeacon` rather than per-second or per-10s writes.
   - Favorites, Recently Played ("আবার খেলুন"), Notification Read Status, and Theme Preference live exclusively in `localStorage` (**0 Firestore writes**).
   - Weekly missions (`users/{uid}/missions/{weekId}`) are stored as **one compact document per user per ISO week**, updated at most once per unique active day or on mission completion.
   - Game votes/ratings aggregate into a single document per game (`games/{gameId}/ratings/summary`) with weekly vote limits tracked via `localStorage` + a minimal weekly lock document (`gameVoteLocks/{uid}_{gameId}_{weekId}`).

---

## Collections & Fields

### 1. `users/{uid}`
- `name`: `string` (1–100 chars, client-writable on create/update)
- `email`: `string`
- `country`: `'BD' | 'INTL'`
- `mobile`: `string` (`+8801XXXXXXXXX`, BD only)
- `referralCode`: `string | null`
- `ownCode`: `string` (server-generated `GMR-XXXX`)
- `referredBy`: `string` (referrer UID, server-only)
- `referredByMasked`: `string` (server-only)
- `points`: `number` (server-only, current month)
- `pointsPeriod`: `string` (`YYYY-MM`, server-only)
- `balanceUsd`: `number` (server-only)
- `totalEarnedUsd`: `number` (server-only)
- `streak`: `number` (server-only)
- `lastClaimDate`: `string` (`YYYY-MM-DD`, server-only)
- `totalActiveSec`: `number` (server-only)
- `totalActiveMinutes`: `number` (server-only)
- `status`: `'active' | 'suspended'` (server-only)
- `createdAt`: `timestamp`

### 2. `users/{uid}/missions/{weekId}` (e.g. `2025-W18`)
- `weekId`: `string`
- `missionId`: `string` (`weekly-play-3-days`)
- `title`: `string` (`এই সপ্তাহে ৩ দিন খেলুন`)
- `daysPlayed`: `string[]` (`['2025-05-01', ...]`)
- `targetDays`: `number` (`3`)
- `completed`: `boolean`
- `rewardPoints`: `number` (`150`)
- `badgeId`: `string` (`weekly-warrior`)
- `completedAt`: `timestamp | null`
- `updatedAt`: `timestamp`

### 3. `notifications/{uid}/items/{notifId}`
- `type`: `'withdrawal' | 'streak' | 'mission' | 'referral' | 'system'`
- `title`: `string`
- `body`: `string`
- `refId`: `string`
- `createdAt`: `timestamp`
> **Read Tracking**: Stored client-side in `localStorage` (`gamoro:read-notifs:{uid}`) — **0 Firestore writes**.

### 4. `games/{gameId}/ratings/summary`
- `gameId`: `string`
- `upvotes`: `number`
- `ratingSum`: `number`
- `ratingCount`: `number`
- `averageRating`: `number`
- `updatedAt`: `timestamp`

### 5. `withdrawals/{withdrawalId}` & `users/{uid}/payouts/{payoutId}`
- `uid`, `userName`, `method`, `methodLabel`, `label`, `amountUsd`, `amountBdt`
- `status`: `'submitted' | 'pending' | 'verifying' | 'approved' | 'sent' | 'paid' | 'rejected'`
- `submittedAt`, `verifyingAt`, `approvedAt`, `sentAt`, `paidAt`, `rejectedAt`
- `txId`: `string`, `rejectReason`: `string`
- `createdAt`: `timestamp`

### 6. `support_tickets/{ticketId}`
- `uid`, `name`, `email`, `category`, `subject`, `message`
- `status`: `'open' | 'resolved'`
- `createdAt`: `timestamp`

### 7. `analytics_daily/{YYYY-MM-DD}` *(Admin-only)*
- `date`, `newUsers`, `dau`, `mau`, `totalPayoutsUsd`, `pendingWithdrawalsCount`, `pendingWithdrawalsUsd`, `generatedAt`

### 8. `alerts/{alertId}` *(Admin-only)*
- `type`: `'multi_account_ip' | 'high_playtime' | 'rapid_withdrawal_new_account' | 'referral_abuse'`
- `severity`: `'low' | 'medium' | 'high'`
- `uid`, `userName`, `details`, `status`: `'open' | 'reviewed' | 'dismissed'`, `createdAt`, `reviewedBy`, `reviewedAt`

---

## Composite Indexes (`firestore.indexes.json`)
1. `withdrawals`: `(uid ASC, createdAt DESC)`
2. `withdrawals`: `(status ASC, createdAt DESC)`
3. `support_tickets`: `(uid ASC, createdAt DESC)`
4. `alerts`: `(status ASC, createdAt DESC)`
5. `items` (`notifications/{uid}/items`): `(createdAt DESC)`
