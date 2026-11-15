// functions/api/admin.js  →  POST /api/admin
// Cloudflare Pages Function: অ্যাডমিন প্যানেল API (Custom Claim admin === true যাচাই বাধ্যতামূলক)

import {
  PLAY_SEC_PER_POINT,
  json,
  bdDate,
  bdPeriod,
  formatBnDateTime,
  requireAdmin,
  fsCtx,
  fsGet,
  fsPatch,
  fsList,
  fsRunQuery,
  fsBeginTx,
  fsCommitTx,
  fsRollbackTx,
  txUpdateWrite,
  txDeleteWrite,
  tsValue,
} from '../_lib/firebase.js';

const DEFAULT_CONFIG = {
  pointsPerSec: 1,
  idleSec: 60,
  challengeIntervalMin: 15,
  usdToBdt: 110,
  mobileRechargeMin: 1,
  mobileRechargeMax: 19.99,
  binanceMin: 10,
  giftCardMin: 20,
  donationMin: 1,
  maxPending: 1,
  carryBelowUsd: 1,
  totalBonus: 1000,
  referrerPercent: 80,
  inviteePercent: 20,
  requiredHours: 25,
  waitDays: 0,
};

const DEFAULT_GAMES = [
  { id: 'game-bubble-shooter', title: 'বাবল শুটার', category: 'আর্কেড', active: true, order: 1, url: '/games/demo/index.html', thumb: '🎯', playersToday: 0 },
  { id: 'game-block-puzzle', title: 'ব্লক পাজল', category: 'ধাঁধা', active: true, order: 2, url: '/games/demo/index.html', thumb: '🧩', playersToday: 0 },
  { id: 'game-candy-match', title: 'ক্যান্ডি ম্যাচ ৩', category: 'ধাঁধা', active: true, order: 3, url: '/games/demo/index.html', thumb: '🍬', playersToday: 0 },
  { id: 'game-fruit-slice', title: 'ফ্রুট স্লাইস', category: 'অ্যাকশন', active: true, order: 4, url: '/games/demo/index.html', thumb: '🍉', playersToday: 0 },
  { id: 'game-car-racing', title: 'স্পিড রেসার', category: 'আর্কেড', active: true, order: 5, url: '/games/demo/index.html', thumb: '🏎️', playersToday: 0 },
];

function randomId(prefix) {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Date.now()}_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function makeAuditWrite(ctx, adminEmail, action, target, details) {
  const id = randomId('aud');
  return txUpdateWrite(
    ctx,
    `auditLogs/${id}`,
    {
      admin: adminEmail || 'admin',
      action,
      target: String(target || ''),
      details: String(details || ''),
      createdAt: tsValue(new Date().toISOString()),
    },
    ['admin', 'action', 'target', 'details', 'createdAt'],
    { exists: false }
  );
}

async function writeAudit(ctx, adminEmail, action, target, details) {
  const id = randomId('aud');
  await fsPatch(
    ctx,
    `auditLogs/${id}`,
    {
      admin: adminEmail || 'admin',
      action,
      target: String(target || ''),
      details: String(details || ''),
      createdAt: tsValue(new Date().toISOString()),
    },
    ['admin', 'action', 'target', 'details', 'createdAt']
  );
}

function formatShortBnDate(ymd) {
  try {
    const d = new Date(`${ymd}T06:00:00Z`);
    return d.toLocaleDateString('bn-BD', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short' });
  } catch {
    return ymd.slice(5);
  }
}

function daysLeftInMonth(period) {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return 0;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const todayDay = Number(bdDate(0).slice(8, 10));
  return Math.max(0, lastDay - todayDay);
}

function mapUserSummary(u, period) {
  const ptsPeriod = u.pointsPeriod || '';
  const points = !period || ptsPeriod === period ? Number(u.points || 0) : 0;
  const balanceUsd =
    typeof u.balanceUsd === 'number' ? u.balanceUsd : Number(u.balance || 0);
  return {
    uid: u.id,
    email: u.email || '',
    name: u.name || 'নাম নেই',
    phone: u.mobile || '',
    balanceUsd: Number(balanceUsd.toFixed(2)),
    totalEarnedUsd: Number(Number(u.totalEarnedUsd || 0).toFixed(2)),
    totalPoints: points,
    pinSet: u.pinSet === true,
    status: u.status || 'active',
    suspendReason: u.suspendReason || '',
    country: u.country || 'BD',
    joinedAt: formatBnDateTime(u.createdAt),
  };
}

async function loadMergedConfig(ctx) {
  const [gRes, wRes, rRes] = await Promise.all([
    fsGet(ctx, 'config/global'),
    fsGet(ctx, 'config/withdraw'),
    fsGet(ctx, 'config/referral'),
  ]);
  const wData = wRes.data || {};
  const merged = {
    ...DEFAULT_CONFIG,
    ...(gRes.data || {}),
    ...wData,
    ...(rRes.data || {}),
  };
  if (wData.mobileRechargeMax === undefined && wData.mobileRechargeMaxExclusive !== undefined) {
    merged.mobileRechargeMax = Number(wData.mobileRechargeMaxExclusive) - 0.01;
  }
  delete merged.bankWalletMin;
  delete merged.mobileRechargeMaxExclusive;
  return merged;
}

export async function onRequestPost({ request, env }) {
  let ctx = null;
  let tx = null;
  try {
    const authRes = await requireAdmin(request, env);
    if (!authRes.ok) return authRes.response;
    const admin = authRes.user;
    const adminEmail = admin.email || admin.sub;

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '').trim();
    const params = body.params && typeof body.params === 'object' ? body.params : {};

    if (!action) return json({ ok: false, error: 'missing_action' }, 400);

    if (action === 'whoami') {
      return json({
        ok: true,
        admin: {
          email: admin.email || '',
          name: admin.name || 'Gamoro Admin',
          role: 'সুপার অ্যাডমিন',
        },
      });
    }

    ctx = await fsCtx(env);
    const period = bdPeriod(0);

    switch (action) {
      case 'dashboard': {
        const dates = [];
        for (let i = -6; i <= 0; i++) dates.push(bdDate(i));
        const today = dates[6];
        const minDate = dates[0];

        const [pendingPayouts, allRefs, openFlags, playDocs, adDocs, periodRes] =
          await Promise.all([
            fsRunQuery(ctx, {
              from: [{ collectionId: 'withdrawals' }],
              where: {
                fieldFilter: {
                  field: { fieldPath: 'status' },
                  op: 'EQUAL',
                  value: { stringValue: 'pending' },
                },
              },
              limit: 200,
            }),
            fsList(ctx, 'referrals', 200),
            fsList(ctx, 'flags', 200),
            fsRunQuery(ctx, {
              from: [{ collectionId: 'playDaily' }],
              where: {
                fieldFilter: {
                  field: { fieldPath: 'date' },
                  op: 'GREATER_THAN_OR_EQUAL',
                  value: { stringValue: minDate },
                },
              },
              limit: 500,
            }),
            fsRunQuery(ctx, {
              from: [{ collectionId: 'adRewards' }],
              where: {
                fieldFilter: {
                  field: { fieldPath: 'date' },
                  op: 'GREATER_THAN_OR_EQUAL',
                  value: { stringValue: minDate },
                },
              },
              limit: 500,
            }),
            fsGet(ctx, `periods/${period}`),
          ]);

        const pendingPayoutsUsd = Number(
          pendingPayouts.reduce((sum, p) => sum + Number(p.amountUsd || 0), 0).toFixed(2)
        );
        const pendingReferralsCount = allRefs.filter(
          (r) => r.status === 'verifying' || r.status === 'review'
        ).length;
        const activeFlags = openFlags.filter((f) => f.status !== 'dismissed');

        const dauMap = Object.fromEntries(dates.map((d) => [d, new Set()]));
        for (const doc of playDocs) {
          if (doc.date && dauMap[doc.date] && doc.uid) {
            dauMap[doc.date].add(doc.uid);
          }
        }
        const adMap = Object.fromEntries(dates.map((d) => [d, 0]));
        for (const doc of adDocs) {
          if (doc.date && adMap[doc.date] !== undefined) {
            adMap[doc.date] += 1;
          }
        }

        const pData = periodRes.data || {};
        const monthlyAdRevenue = Number(pData.revenueUsd || 0);
        const poolPercent = Number(pData.poolPercent || 70);
        const estimatedPoolUsd = Number(
          (pData.estimatedPoolUsd ?? (monthlyAdRevenue * poolPercent) / 100).toFixed(2)
        );

        return json({
          ok: true,
          data: {
            dau: dauMap[today].size,
            monthlyAdRevenue,
            pendingPayoutsCount: pendingPayouts.length,
            pendingPayoutsUsd,
            pendingReferralsCount,
            flagsCount: activeFlags.length,
            periodStatus: {
              month: period,
              daysLeft: daysLeftInMonth(period),
              estimatedPoolUsd,
            },
            dauHistory: dates.map((d) => ({
              date: formatShortBnDate(d),
              value: dauMap[d].size,
            })),
            adHistory: dates.map((d) => ({
              date: formatShortBnDate(d),
              value: adMap[d],
            })),
          },
        });
      }

      case 'payouts.list': {
        const status = ['pending', 'paid', 'rejected'].includes(params.status)
          ? params.status
          : 'pending';
        const rows = await fsRunQuery(ctx, {
          from: [{ collectionId: 'withdrawals' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'status' },
              op: 'EQUAL',
              value: { stringValue: status },
            },
          },
          limit: 200,
        });
        rows.sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
        const payouts = rows.map((p) => ({
          id: p.id,
          uid: p.uid || '',
          userName: p.userName || 'ব্যবহারকারী',
          method: p.method || '',
          accountNo: p.label || p.accountNo || p.accountDetails || '',
          amountUsd: Number(p.amountUsd || 0),
          amountBdt: Number(p.amountBdt || 0),
          status: p.status || 'pending',
          txId: p.txId || '',
          rejectReason: p.rejectReason || '',
          createdAt: formatBnDateTime(p.createdAt),
        }));
        return json({ ok: true, payouts });
      }

      case 'payouts.markPaid': {
        const id = String(params.id || '').trim();
        const txId = String(params.txId || '').trim().slice(0, 120) || 'MANUAL_' + Date.now();
        if (!id) return json({ ok: false, error: 'missing_id' }, 400);

        const wdPath = `withdrawals/${id}`;
        tx = await fsBeginTx(ctx, true);
        const wdRes = await fsGet(ctx, wdPath, tx);
        if (!wdRes.exists) {
          await fsRollbackTx(ctx, tx);
          return json({ ok: false, error: 'not_found' }, 404);
        }
        const wd = wdRes.data;
        if (wd.status !== 'pending') {
          await fsRollbackTx(ctx, tx);
          return json({ ok: false, error: 'already_processed' }, 409);
        }

        const nowIso = new Date().toISOString();
        const writes = [
          txUpdateWrite(
            ctx,
            wdPath,
            { status: 'paid', txId, paidAt: tsValue(nowIso), processedBy: adminEmail },
            ['status', 'txId', 'paidAt', 'processedBy'],
            { exists: true }
          ),
          makeAuditWrite(
            ctx,
            adminEmail,
            'payout.markPaid',
            `${id} (${wd.userName || wd.uid})`,
            `পরিশোধ সম্পন্ন (TxID: ${txId})`
          ),
        ];

        if (wd.uid && !String(wd.uid).startsWith('deleted')) {
          const userPayoutRes = await fsGet(ctx, `users/${wd.uid}/payouts/${id}`, tx);
          if (userPayoutRes.exists) {
            writes.push(
              txUpdateWrite(
                ctx,
                `users/${wd.uid}/payouts/${id}`,
                { status: 'paid', txId, paidAt: tsValue(nowIso) },
                ['status', 'txId', 'paidAt'],
                { exists: true }
              )
            );
          }
        }

        const commitRes = await fsCommitTx(ctx, tx, writes);
        tx = null;
        if (!commitRes.ok) return json({ ok: false, error: 'busy' }, 409);
        return json({ ok: true });
      }

      case 'payouts.reject': {
        const id = String(params.id || '').trim();
        const reason = String(params.reason || '').trim().slice(0, 240) || 'বাতিল করা হয়েছে';
        const refundBalance = Boolean(params.refundBalance);
        if (!id) return json({ ok: false, error: 'missing_id' }, 400);

        const wdPath = `withdrawals/${id}`;
        tx = await fsBeginTx(ctx, true);
        const wdRes = await fsGet(ctx, wdPath, tx);
        if (!wdRes.exists) {
          await fsRollbackTx(ctx, tx);
          return json({ ok: false, error: 'not_found' }, 404);
        }
        const wd = wdRes.data;
        if (wd.status !== 'pending') {
          await fsRollbackTx(ctx, tx);
          return json({ ok: false, error: 'already_processed' }, 409);
        }

        const nowIso = new Date().toISOString();
        const writes = [
          txUpdateWrite(
            ctx,
            wdPath,
            {
              status: 'rejected',
              rejectReason: reason,
              refunded: refundBalance,
              rejectedAt: tsValue(nowIso),
              processedBy: adminEmail,
            },
            ['status', 'rejectReason', 'refunded', 'rejectedAt', 'processedBy'],
            { exists: true }
          ),
          makeAuditWrite(
            ctx,
            adminEmail,
            'payout.reject',
            `${id} (${wd.userName || wd.uid})`,
            `আবেদন বাতিল: ${reason} (রিফান্ড: ${refundBalance ? 'হ্যাঁ' : 'না'})`
          ),
        ];

        if (wd.uid && !String(wd.uid).startsWith('deleted')) {
          const [userRes, userPayoutRes] = await Promise.all([
            fsGet(ctx, `users/${wd.uid}`, tx),
            fsGet(ctx, `users/${wd.uid}/payouts/${id}`, tx),
          ]);
          if (userPayoutRes.exists) {
            writes.push(
              txUpdateWrite(
                ctx,
                `users/${wd.uid}/payouts/${id}`,
                { status: 'rejected', rejectReason: reason, rejectedAt: tsValue(nowIso) },
                ['status', 'rejectReason', 'rejectedAt'],
                { exists: true }
              )
            );
          }
          if (refundBalance && userRes.exists) {
            const curBal =
              typeof userRes.data?.balanceUsd === 'number'
                ? userRes.data.balanceUsd
                : Number(userRes.data?.balance || 0);
            const nextBal = Number((curBal + Number(wd.amountUsd || 0)).toFixed(2));
            writes.push(
              txUpdateWrite(
                ctx,
                `users/${wd.uid}`,
                { balanceUsd: nextBal },
                ['balanceUsd'],
                { exists: true }
              )
            );
          }
        }

        const commitRes = await fsCommitTx(ctx, tx, writes);
        tx = null;
        if (!commitRes.ok) return json({ ok: false, error: 'busy' }, 409);
        return json({ ok: true });
      }

      case 'referrals.list': {
        const status = String(params.status || 'verifying');
        const [rows, cfg] = await Promise.all([fsList(ctx, 'referrals', 200), loadMergedConfig(ctx)]);
        const reqHours = Number(cfg.requiredHours ?? 25);
        const totalBonus = Number(cfg.totalBonus ?? 1000);
        const refBonus = Math.round((totalBonus * Number(cfg.referrerPercent ?? 80)) / 100);
        const invBonus = Math.round((totalBonus * Number(cfg.inviteePercent ?? 20)) / 100);

        const filtered = rows.filter((r) => {
          const st = r.status || 'pending';
          if (status === 'verifying') return st === 'verifying' || st === 'review' || st === 'pending';
          if (status === 'completed') return st === 'completed' || st === 'qualified';
          return st === status;
        });

        filtered.sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
        const referrals = filtered.map((r) => {
          const sec = Number(r.activeSec ?? Number(r.playedMinutes || 0) * 60);
          const activeHours = Number((sec / 3600).toFixed(1));
          const normalizedStatus =
            r.status === 'review' || r.status === 'pending'
              ? 'verifying'
              : r.status === 'qualified'
              ? 'completed'
              : r.status;
          return {
            id: r.id,
            referrerName: r.referrerName || r.referrerUid || 'রেফারার',
            inviteeName: r.inviteeName || r.inviteeUid || 'আমন্ত্রিত',
            activeHours,
            requiredHours: reqHours,
            emailVerified: r.emailVerified === true,
            status: normalizedStatus,
            totalBonus,
            referrerBonus: refBonus,
            inviteeBonus: invBonus,
            rejectReason: r.rejectReason || '',
            createdAt: formatBnDateTime(r.createdAt),
          };
        });
        return json({ ok: true, referrals });
      }

      case 'referrals.approve': {
        const id = String(params.id || '').trim();
        if (!id) return json({ ok: false, error: 'missing_id' }, 400);

        const cfg = await loadMergedConfig(ctx);
        const reqHours = Number(cfg.requiredHours ?? 25);
        const totalBonus = Number(cfg.totalBonus ?? 1000);
        const refBonus = Math.round((totalBonus * Number(cfg.referrerPercent ?? 80)) / 100);
        const invBonus = Math.round((totalBonus * Number(cfg.inviteePercent ?? 20)) / 100);

        tx = await fsBeginTx(ctx, true);
        const refTopRes = await fsGet(ctx, `referrals/${id}`, tx);
        if (!refTopRes.exists) {
          await fsRollbackTx(ctx, tx);
          return json({ ok: false, error: 'not_found' }, 404);
        }
        const refData = refTopRes.data;
        if (refData.status === 'completed' || refData.status === 'qualified') {
          await fsRollbackTx(ctx, tx);
          return json({ ok: false, error: 'already_approved' }, 409);
        }

        const referrerUid = refData.referrerUid;
        const inviteeUid = refData.inviteeUid || id;
        const [referrerRes, inviteeRes, subRes] = await Promise.all([
          fsGet(ctx, `users/${referrerUid}`, tx),
          fsGet(ctx, `users/${inviteeUid}`, tx),
          fsGet(ctx, `users/${referrerUid}/referrals/${inviteeUid}`, tx),
        ]);

        if (!referrerRes.exists || !inviteeRes.exists) {
          await fsRollbackTx(ctx, tx);
          return json({ ok: false, error: 'user_not_found' }, 404);
        }

        const invSec = Number(inviteeRes.data?.totalActiveSec || refData.activeSec || 0);
        if (invSec < reqHours * 3600) {
          await fsRollbackTx(ctx, tx);
          return json(
            { ok: false, error: 'ব্যবহারকারী এখনো ন্যূনতম খেলার সময় পূরণ করেননি' },
            400
          );
        }
        if (refData.emailVerified !== true) {
          await fsRollbackTx(ctx, tx);
          return json({ ok: false, error: 'ইমেইল ভেরিফাই সম্পন্ন হয়নি' }, 400);
        }

        const nowIso = new Date().toISOString();
        const refPrevPts =
          (referrerRes.data?.pointsPeriod || '') === period
            ? Number(referrerRes.data?.points || 0)
            : 0;
        const invPrevPts =
          (inviteeRes.data?.pointsPeriod || '') === period
            ? Number(inviteeRes.data?.points || 0)
            : 0;

        const writes = [
          txUpdateWrite(
            ctx,
            `users/${referrerUid}`,
            { points: refPrevPts + refBonus, pointsPeriod: period },
            ['points', 'pointsPeriod'],
            { exists: true }
          ),
          txUpdateWrite(
            ctx,
            `users/${inviteeUid}`,
            { points: invPrevPts + invBonus, pointsPeriod: period },
            ['points', 'pointsPeriod'],
            { exists: true }
          ),
          txUpdateWrite(
            ctx,
            `referrals/${id}`,
            {
              status: 'completed',
              referrerBonus: refBonus,
              inviteeBonus: invBonus,
              completedAt: tsValue(nowIso),
              approvedBy: adminEmail,
            },
            ['status', 'referrerBonus', 'inviteeBonus', 'completedAt', 'approvedBy'],
            { exists: true }
          ),
          makeAuditWrite(
            ctx,
            adminEmail,
            'referrals.approve',
            `${refData.referrerName || referrerUid} → ${refData.inviteeName || inviteeUid}`,
            `রেফারেল বোনাস অনুমোদিত (মোট ${refBonus + invBonus} পয়েন্ট)`
          ),
        ];

        if (subRes.exists) {
          writes.push(
            txUpdateWrite(
              ctx,
              `users/${referrerUid}/referrals/${inviteeUid}`,
              { status: 'qualified', referrerReward: refBonus },
              ['status', 'referrerReward'],
              { exists: true }
            )
          );
        }

        const commitRes = await fsCommitTx(ctx, tx, writes);
        tx = null;
        if (!commitRes.ok) return json({ ok: false, error: 'busy' }, 409);
        return json({ ok: true });
      }

      case 'referrals.reject': {
        const id = String(params.id || '').trim();
        const reason = String(params.reason || '').trim().slice(0, 240) || 'শর্ত পূরণ না হওয়ায় বাতিল';
        if (!id) return json({ ok: false, error: 'missing_id' }, 400);

        tx = await fsBeginTx(ctx, true);
        const refTopRes = await fsGet(ctx, `referrals/${id}`, tx);
        if (!refTopRes.exists) {
          await fsRollbackTx(ctx, tx);
          return json({ ok: false, error: 'not_found' }, 404);
        }
        const refData = refTopRes.data;
        const referrerUid = refData.referrerUid;
        const inviteeUid = refData.inviteeUid || id;
        const nowIso = new Date().toISOString();

        const writes = [
          txUpdateWrite(
            ctx,
            `referrals/${id}`,
            { status: 'rejected', rejectReason: reason, rejectedAt: tsValue(nowIso) },
            ['status', 'rejectReason', 'rejectedAt'],
            { exists: true }
          ),
          makeAuditWrite(
            ctx,
            adminEmail,
            'referrals.reject',
            `${refData.referrerName || referrerUid} → ${refData.inviteeName || inviteeUid}`,
            `রেফারেল বাতিল: ${reason}`
          ),
        ];

        if (referrerUid) {
          const subRes = await fsGet(ctx, `users/${referrerUid}/referrals/${inviteeUid}`, tx);
          if (subRes.exists) {
            writes.push(
              txUpdateWrite(
                ctx,
                `users/${referrerUid}/referrals/${inviteeUid}`,
                { status: 'rejected', rejectReason: reason },
                ['status', 'rejectReason'],
                { exists: true }
              )
            );
          }
        }

        const commitRes = await fsCommitTx(ctx, tx, writes);
        tx = null;
        if (!commitRes.ok) return json({ ok: false, error: 'busy' }, 409);
        return json({ ok: true });
      }

      case 'users.search': {
        const q = String(params.query || '').trim();
        if (!q) return json({ ok: true, users: [] });

        const exact = await fsGet(ctx, `users/${q}`);
        if (exact.exists) {
          return json({ ok: true, users: [mapUserSummary(exact.data, period)] });
        }

        const ql = q.toLowerCase();
        const allUsers = await fsList(ctx, 'users', 200);
        const matched = allUsers
          .filter(
            (u) =>
              u.id.toLowerCase().includes(ql) ||
              String(u.email || '').toLowerCase().includes(ql) ||
              String(u.name || '').toLowerCase().includes(ql) ||
              String(u.mobile || '').includes(q)
          )
          .slice(0, 25)
          .map((u) => mapUserSummary(u, period));
        return json({ ok: true, users: matched });
      }

      case 'users.get': {
        const uid = String(params.uid || '').trim();
        if (!uid) return json({ ok: false, error: 'missing_uid' }, 400);
        const uRes = await fsGet(ctx, `users/${uid}`);
        if (!uRes.exists) return json({ ok: false, user: null });
        return json({ ok: true, user: mapUserSummary(uRes.data, period) });
      }

      case 'users.adjustBalance': {
        const uid = String(params.uid || '').trim();
        const delta = Number(params.amountUsd);
        const reason = String(params.reason || '').trim().slice(0, 240);
        if (!uid || !Number.isFinite(delta) || delta === 0 || !reason) {
          return json({ ok: false, error: 'bad_params' }, 400);
        }

        const userPath = `users/${uid}`;
        tx = await fsBeginTx(ctx, true);
        const uRes = await fsGet(ctx, userPath, tx);
        if (!uRes.exists) {
          await fsRollbackTx(ctx, tx);
          return json({ ok: false, error: 'not_found' }, 404);
        }

        const curBal =
          typeof uRes.data?.balanceUsd === 'number'
            ? uRes.data.balanceUsd
            : Number(uRes.data?.balance || 0);
        const nextBal = Math.max(0, Number((curBal + delta).toFixed(2)));

        const commitRes = await fsCommitTx(ctx, tx, [
          txUpdateWrite(ctx, userPath, { balanceUsd: nextBal }, ['balanceUsd'], { exists: true }),
          makeAuditWrite(
            ctx,
            adminEmail,
            'users.adjustBalance',
            `${uid} (${uRes.data?.email || ''})`,
            `ব্যালেন্স সমন্বয়: ${delta >= 0 ? '+' : ''}${delta}$ (কারণ: ${reason})`
          ),
        ]);
        tx = null;
        if (!commitRes.ok) return json({ ok: false, error: 'busy' }, 409);
        return json({ ok: true, balanceUsd: nextBal });
      }

      case 'users.resetPin': {
        const uid = String(params.uid || '').trim();
        if (!uid) return json({ ok: false, error: 'missing_uid' }, 400);

        tx = await fsBeginTx(ctx, true);
        const uRes = await fsGet(ctx, `users/${uid}`, tx);
        if (!uRes.exists) {
          await fsRollbackTx(ctx, tx);
          return json({ ok: false, error: 'not_found' }, 404);
        }
        const pinRes = await fsGet(ctx, `pins/${uid}`, tx);
        const writes = [
          txUpdateWrite(ctx, `users/${uid}`, { pinSet: false }, ['pinSet'], { exists: true }),
          makeAuditWrite(
            ctx,
            adminEmail,
            'users.resetPin',
            `${uid} (${uRes.data?.email || ''})`,
            'উইথড্রয়াল পিন রিসেট করা হয়েছে'
          ),
        ];
        if (pinRes.exists) {
          writes.push(txDeleteWrite(ctx, `pins/${uid}`));
        }
        const commitRes = await fsCommitTx(ctx, tx, writes);
        tx = null;
        if (!commitRes.ok) return json({ ok: false, error: 'busy' }, 409);
        return json({ ok: true });
      }

      case 'users.suspend': {
        const uid = String(params.uid || '').trim();
        const reason = String(params.reason || '').trim().slice(0, 240) || 'প্রশাসক কর্তৃক স্থগিত';
        if (!uid) return json({ ok: false, error: 'missing_uid' }, 400);

        tx = await fsBeginTx(ctx, true);
        const uRes = await fsGet(ctx, `users/${uid}`, tx);
        if (!uRes.exists) {
          await fsRollbackTx(ctx, tx);
          return json({ ok: false, error: 'not_found' }, 404);
        }
        const commitRes = await fsCommitTx(ctx, tx, [
          txUpdateWrite(
            ctx,
            `users/${uid}`,
            { status: 'suspended', suspendReason: reason },
            ['status', 'suspendReason'],
            { exists: true }
          ),
          makeAuditWrite(
            ctx,
            adminEmail,
            'users.suspend',
            `${uid} (${uRes.data?.email || ''})`,
            `অ্যাকাউন্ট স্থগিত: ${reason}`
          ),
        ]);
        tx = null;
        if (!commitRes.ok) return json({ ok: false, error: 'busy' }, 409);
        return json({ ok: true });
      }

      case 'users.unsuspend': {
        const uid = String(params.uid || '').trim();
        if (!uid) return json({ ok: false, error: 'missing_uid' }, 400);

        tx = await fsBeginTx(ctx, true);
        const uRes = await fsGet(ctx, `users/${uid}`, tx);
        if (!uRes.exists) {
          await fsRollbackTx(ctx, tx);
          return json({ ok: false, error: 'not_found' }, 404);
        }
        const commitRes = await fsCommitTx(ctx, tx, [
          txUpdateWrite(
            ctx,
            `users/${uid}`,
            { status: 'active', suspendReason: '' },
            ['status', 'suspendReason'],
            { exists: true }
          ),
          makeAuditWrite(
            ctx,
            adminEmail,
            'users.unsuspend',
            `${uid} (${uRes.data?.email || ''})`,
            'অ্যাকাউন্ট পুনরায় সক্রিয় করা হয়েছে'
          ),
        ]);
        tx = null;
        if (!commitRes.ok) return json({ ok: false, error: 'busy' }, 409);
        return json({ ok: true });
      }

      case 'flags.list': {
        const rows = await fsList(ctx, 'flags', 200);
        const flags = rows
          .filter((f) => f.status !== 'dismissed')
          .sort((a, b) => Date.parse(b.detectedAt || 0) - Date.parse(a.detectedAt || 0))
          .map((f) => ({
            id: f.id,
            type: f.type || 'unknown',
            severity: f.severity || 'medium',
            uid: f.uid || '',
            userName: f.userName || 'ব্যবহারকারী',
            details: f.details || '',
            detectedAt: formatBnDateTime(f.detectedAt),
          }));
        return json({ ok: true, flags });
      }

      case 'flags.dismiss': {
        const id = String(params.id || '').trim();
        if (!id) return json({ ok: false, error: 'missing_id' }, 400);

        await fsPatch(
          ctx,
          `flags/${id}`,
          { status: 'dismissed', dismissedAt: tsValue(new Date().toISOString()), dismissedBy: adminEmail },
          ['status', 'dismissedAt', 'dismissedBy']
        );
        await writeAudit(ctx, adminEmail, 'flags.dismiss', id, 'সন্দেহজনক ফ্ল্যাগ খারিজ করা হয়েছে');
        return json({ ok: true });
      }

      case 'period.preview': {
        const month = String(params.month || period).trim();
        const rev = Number(params.revenueUsd);
        const pct = Number(params.poolPercent);
        if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(rev) || rev < 0 || !Number.isFinite(pct) || pct <= 0 || pct > 100) {
          return json({ ok: false, error: 'সঠিক মাস, রেভিনিউ ও শতাংশ দিন' }, 400);
        }

        const userPoolUsd = Number(((rev * pct) / 100).toFixed(2));
        const allUsers = await fsList(ctx, 'users', 200);
        let totalPoints = 0;
        for (const u of allUsers) {
          if (u.status === 'suspended') continue;
          if ((u.pointsPeriod || '') === month) {
            totalPoints += Number(u.points || 0);
          }
        }
        const ratePerThousand = totalPoints > 0 ? Number(((userPoolUsd / totalPoints) * 1000).toFixed(4)) : 0;

        const existingPeriod = await fsGet(ctx, `periods/${month}`);
        const prevEst = Number(existingPeriod.data?.estimatedPoolUsd || 0);
        const diffPct = prevEst > 0 ? Math.abs(((userPoolUsd - prevEst) / prevEst) * 100) : 0;

        return json({
          ok: true,
          preview: {
            month,
            revenueUsd: rev,
            poolPercent: pct,
            userPoolUsd,
            totalPoints,
            ratePerThousand,
            diffPercent: Number(diffPct.toFixed(1)),
            warning:
              diffPct > 15
                ? 'সতর্কতা: রেভিনিউ ও প্রাক্কলিত পুলের মধ্যে ১৫%-এর বেশি পার্থক্য রয়েছে!'
                : null,
          },
        });
      }

      case 'period.close': {
        const month = String(params.month || period).trim();
        const rev = Number(params.revenueUsd);
        const pct = Number(params.poolPercent);
        if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(rev) || rev < 0 || !Number.isFinite(pct) || pct <= 0 || pct > 100) {
          return json({ ok: false, error: 'সঠিক মাস, রেভিনিউ ও শতাংশ দিন' }, 400);
        }

        const periodPath = `periods/${month}`;
        const existingPeriod = await fsGet(ctx, periodPath);
        if (existingPeriod.exists && existingPeriod.data?.status === 'closed') {
          return json({ ok: false, error: 'এই মাসের পিরিয়ড ইতিমধ্যেই বন্ধ করা হয়েছে' }, 409);
        }

        const userPoolUsd = Number(((rev * pct) / 100).toFixed(2));
        const allUsers = await fsList(ctx, 'users', 200);
        const eligibleUsers = allUsers.filter(
          (u) => u.status !== 'suspended' && (u.pointsPeriod || '') === month && Number(u.points || 0) > 0
        );
        const totalPoints = eligibleUsers.reduce((sum, u) => sum + Number(u.points || 0), 0);
        const nowIso = new Date().toISOString();

        let convertedUsers = 0;
        if (totalPoints > 0 && userPoolUsd > 0) {
          for (let i = 0; i < eligibleUsers.length; i += 20) {
            const batch = eligibleUsers.slice(i, i + 20);
            const bTx = await fsBeginTx(ctx, true);
            const reads = await Promise.all(batch.map((u) => fsGet(ctx, `users/${u.id}`, bTx)));
            const writes = [];
            for (const uSnap of reads) {
              if (!uSnap.exists) continue;
              const u = uSnap.data;
              if ((u.pointsPeriod || '') !== month) continue;
              const pts = Number(u.points || 0);
              if (pts <= 0) continue;
              const earnedUsd = Number(((pts / totalPoints) * userPoolUsd).toFixed(4));
              const curBal =
                typeof u.balanceUsd === 'number' ? u.balanceUsd : Number(u.balance || 0);
              const curEarned = Number(u.totalEarnedUsd || 0);
              writes.push(
                txUpdateWrite(
                  ctx,
                  `users/${u.id}`,
                  {
                    balanceUsd: Number((curBal + earnedUsd).toFixed(2)),
                    totalEarnedUsd: Number((curEarned + earnedUsd).toFixed(2)),
                    points: 0,
                  },
                  ['balanceUsd', 'totalEarnedUsd', 'points'],
                  { exists: true }
                )
              );
              convertedUsers++;
            }
            if (writes.length > 0) {
              await fsCommitTx(ctx, bTx, writes);
            } else {
              await fsRollbackTx(ctx, bTx);
            }
          }
        }

        await fsPatch(
          ctx,
          periodPath,
          {
            month,
            status: 'closed',
            revenueUsd: rev,
            poolPercent: pct,
            userPoolUsd,
            totalPoints,
            convertedUsers,
            closedAt: tsValue(nowIso),
            closedBy: adminEmail,
          },
          [
            'month',
            'status',
            'revenueUsd',
            'poolPercent',
            'userPoolUsd',
            'totalPoints',
            'convertedUsers',
            'closedAt',
            'closedBy',
          ]
        );

        await writeAudit(
          ctx,
          adminEmail,
          'period.close',
          month,
          `মাসিক পিরিয়ড বন্ধ ও পয়েন্ট কনভার্সন সফল (রেভিনিউ: $${rev}, পুল: $${userPoolUsd}, ইউজার: ${convertedUsers})`
        );

        return json({
          ok: true,
          message: 'পিরিয়ড সফলভাবে বন্ধ করা হয়েছে এবং পয়েন্ট কনভার্সন সম্পন্ন হয়েছে।',
        });
      }

      case 'announcement.get': {
        const res = await fsGet(ctx, 'config/announcement');
        const ann = res.data || { active: false, message: '' };
        return json({
          ok: true,
          announcement: {
            active: Boolean(ann.active),
            message: ann.message || '',
          },
        });
      }

      case 'announcement.set': {
        const active = Boolean(params.active);
        const message = String(params.message || '').trim().slice(0, 160);
        await fsPatch(
          ctx,
          'config/announcement',
          { active, message, updatedAt: tsValue(new Date().toISOString()) },
          ['active', 'message', 'updatedAt']
        );
        await writeAudit(
          ctx,
          adminEmail,
          'announcement.set',
          'ঘোষণা',
          `ঘোষণা আপডেট (${active ? 'সক্রিয়' : 'নিষ্ক্রিয়'}): ${message.slice(0, 40)}`
        );
        return json({ ok: true });
      }

      case 'games.list': {
        const res = await fsGet(ctx, 'config/games');
        const games = Array.isArray(res.data?.items) ? res.data.items : DEFAULT_GAMES;
        return json({ ok: true, games });
      }

      case 'games.save': {
        const res = await fsGet(ctx, 'config/games');
        let items = Array.isArray(res.data?.items) ? [...res.data.items] : [...DEFAULT_GAMES];

        if (Array.isArray(params.games)) {
          items = params.games.map((g, idx) => ({
            id: String(g.id || `game-${idx + 1}`),
            title: String(g.title || ''),
            category: String(g.category || 'আর্কেড'),
            active: Boolean(g.active),
            order: Number(g.order || idx + 1),
            url: String(g.url || '/games/demo/index.html'),
            thumb: String(g.thumb || '🎮'),
            playersToday: Number(g.playersToday || 0),
          }));
        } else if (params.game && typeof params.game === 'object') {
          const g = params.game;
          const idx = g.id ? items.findIndex((x) => x.id === g.id) : -1;
          if (idx >= 0) {
            items[idx] = { ...items[idx], ...g };
          } else {
            items.push({
              id: g.id || 'game-' + Date.now(),
              title: String(g.title || ''),
              category: String(g.category || 'আর্কেড'),
              active: g.active !== false,
              order: items.length + 1,
              url: String(g.url || '/games/demo/index.html'),
              thumb: String(g.thumb || '🎮'),
              playersToday: 0,
            });
          }
        }

        await fsPatch(
          ctx,
          'config/games',
          { items, updatedAt: tsValue(new Date().toISOString()) },
          ['items', 'updatedAt']
        );
        await writeAudit(ctx, adminEmail, 'games.save', 'গেম ক্যাটালগ', 'গেম তালিকা বা সেটিংস আপডেট করা হয়েছে');
        return json({ ok: true });
      }

      case 'config.get': {
        const cfg = await loadMergedConfig(ctx);
        return json({ ok: true, config: cfg });
      }

      case 'config.set': {
        const c = params.config && typeof params.config === 'object' ? params.config : {};
        const reason = String(params.reason || '').trim().slice(0, 240) || 'উল্লেখ নেই';
        const nowIso = new Date().toISOString();

        const allowedNumericKeys = [
          'pointsPerSec',
          'idleSec',
          'challengeIntervalMin',
          'usdToBdt',
          'carryBelowUsd',
          'mobileRechargeMin',
          'mobileRechargeMax',
          'binanceMin',
          'giftCardMin',
          'donationMin',
          'maxPending',
          'totalBonus',
          'referrerPercent',
          'inviteePercent',
          'requiredHours',
          'waitDays',
        ];

        const clean = {};
        for (const key of allowedNumericKeys) {
          const val = c[key] !== undefined ? Number(c[key]) : DEFAULT_CONFIG[key];
          if (!Number.isFinite(val) || val < 0) {
            return json({ ok: false, error: `অবৈধ কনফিগ মান: ${key}` }, 400);
          }
          clean[key] = val;
        }
        if (clean.mobileRechargeMax < clean.mobileRechargeMin) {
          return json(
            { ok: false, error: 'mobileRechargeMax অবশ্যই mobileRechargeMin-এর চেয়ে কম হতে পারবে না' },
            400
          );
        }

        const withdrawCfg = {
          usdToBdt: clean.usdToBdt,
          carryBelowUsd: clean.carryBelowUsd,
          mobileRechargeMin: clean.mobileRechargeMin,
          mobileRechargeMax: clean.mobileRechargeMax,
          binanceMin: clean.binanceMin,
          giftCardMin: clean.giftCardMin,
          donationMin: clean.donationMin,
          maxPending: Math.max(1, Math.floor(clean.maxPending)),
          updatedAt: tsValue(nowIso),
        };
        const referralCfg = {
          totalBonus: clean.totalBonus,
          referrerPercent: clean.referrerPercent,
          inviteePercent: clean.inviteePercent,
          requiredHours: clean.requiredHours,
          waitDays: clean.waitDays,
          updatedAt: tsValue(nowIso),
        };
        const globalCfg = {
          pointsPerSec: clean.pointsPerSec,
          idleSec: clean.idleSec,
          challengeIntervalMin: clean.challengeIntervalMin,
          playSecPerPoint: PLAY_SEC_PER_POINT,
          updatedAt: tsValue(nowIso),
        };

        await Promise.all([
          fsPatch(ctx, 'config/withdraw', withdrawCfg, [
            ...Object.keys(withdrawCfg),
            'bankWalletMin',
            'mobileRechargeMaxExclusive',
          ]),
          fsPatch(ctx, 'config/referral', referralCfg, Object.keys(referralCfg)),
          fsPatch(ctx, 'config/global', globalCfg, Object.keys(globalCfg)),
        ]);
        await writeAudit(
          ctx,
          adminEmail,
          'config.set',
          'প্ল্যাটফর্ম গ্লোবাল সেটিংস',
          `সেটিংস পরিবর্তিত (কারণ: ${reason})`
        );
        return json({ ok: true });
      }

      case 'audit.list': {
        const filter = String(params.filter || 'all').trim().toLowerCase();
        const rows = await fsList(ctx, 'auditLogs', 200);
        rows.sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
        const filtered =
          filter && filter !== 'all'
            ? rows.filter((a) => String(a.action || '').toLowerCase().includes(filter))
            : rows;
        const audit = filtered.slice(0, 100).map((a) => ({
          id: a.id,
          timestamp: formatBnDateTime(a.createdAt),
          admin: a.admin || 'admin',
          action: a.action || '',
          target: a.target || '',
          details: a.details || '',
        }));
        return json({ ok: true, audit });
      }

      default:
        return json({ ok: false, error: 'unknown_action' }, 400);
    }
  } catch (err) {
    if (ctx && tx) await fsRollbackTx(ctx, tx);
    return json({ ok: false, error: err?.message || 'server' }, 500);
  }
}
