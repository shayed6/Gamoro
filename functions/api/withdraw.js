// functions/api/withdraw.js  →  POST /api/withdraw
// Cloudflare Pages Function: উইথড্রয়াল আবেদন (পিন, ইমেইল, দেশ, সীমা, ডুপ্লিকেট অ্যাকাউন্ট ও ব্যালেন্স যাচাই)

import {
  json,
  sha256Hex,
  requireAuth,
  verifyAndTrackUserPin,
  fsCtx,
  fsGet,
  fsRunQuery,
  fsBeginTx,
  fsCommitTx,
  fsRollbackTx,
  txUpdateWrite,
  tsValue,
} from '../_lib/firebase.js';

const OPERATORS = {
  gp: 'গ্রামীণফোন',
  robi: 'রবি',
  bl: 'বাংলালিংক',
  airtel: 'এয়ারটেল',
  teletalk: 'টেলিটক',
};

const MFS_LABELS = {
  bkash: 'বিকাশ',
  nagad: 'নগদ',
  rocket: 'রকেট',
};

function randomId(prefix = 'wd') {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${Date.now()}_${hex}`;
}

export async function onRequestPost({ request, env }) {
  let ctx = null;
  let tx = null;
  try {
    const authRes = await requireAuth(request, env);
    if (!authRes.ok) return authRes.response;
    const user = authRes.user;

    if (!user.email_verified) {
      return json({ ok: false, error: 'email_not_verified' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const method = String(body.method || '').trim();
    const rawAmt = Number(body.amountUsd);
    const amountUsd = Number.isFinite(rawAmt) ? Number(rawAmt.toFixed(2)) : 0;
    const pin = String(body.pin || '').trim();
    const auto = Boolean(body.auto);
    const details = body.details && typeof body.details === 'object' ? body.details : {};

    if (!amountUsd || amountUsd <= 0) {
      return json({ ok: false, error: 'bad_details' }, 400);
    }

    ctx = await fsCtx(env);

    // ১) পিন যাচাই (৫ বার ভুলে ১৫ মিনিট লক)
    const pinCheck = await verifyAndTrackUserPin(ctx, user.sub, pin);
    if (!pinCheck.ok) {
      return json({ ok: false, error: pinCheck.error }, pinCheck.status || 403);
    }

    const uProfile = pinCheck.userDoc || {};
    if (uProfile.status === 'suspended') {
      return json({ ok: false, error: 'suspended', message: 'আপনার অ্যাকাউন্ট স্থগিত করা হয়েছে' }, 403);
    }

    // ২) কনফিগ লোড (config/withdraw)
    const cfgRes = await fsGet(ctx, 'config/withdraw');
    const cfgData = cfgRes.data || {};
    const cfg = {
      usdToBdt: Number(cfgData.usdToBdt || 110),
      carryBelowUsd: Number(cfgData.carryBelowUsd ?? 1),
      mobileRechargeMin: Number(cfgData.mobileRechargeMin ?? 1),
      mobileRechargeMaxExclusive: Number(cfgData.mobileRechargeMaxExclusive ?? 20),
      bankWalletMin: Number(cfgData.bankWalletMin ?? 20),
      binanceMin: Number(cfgData.binanceMin ?? 10),
      maxPendingWithdrawals: Number(cfgData.maxPendingWithdrawals ?? 1),
    };

    const country = uProfile.country === 'INTL' ? 'INTL' : 'BD';
    let methodLabel = '';
    let accountNo = '';
    let accountDetails = '';
    let identifierKey = '';
    let cleanDetails = {};

    // ৩) দেশ, পদ্ধতি, সীমা ও বিবরণ যাচাই
    if (country === 'BD') {
      if (method === 'mobile_recharge') {
        if (amountUsd < cfg.mobileRechargeMin) {
          return json({ ok: false, error: 'below_min' }, 400);
        }
        if (amountUsd >= cfg.mobileRechargeMaxExclusive) {
          return json({ ok: false, error: 'method_not_allowed' }, 400);
        }
        const operator = String(details.operator || '').trim().toLowerCase();
        if (!OPERATORS[operator]) {
          return json({ ok: false, error: 'bad_details' }, 400);
        }
        const profileMobile = String(uProfile.mobile || '').trim();
        if (!/^\+8801[3-9]\d{8}$/.test(profileMobile)) {
          return json({ ok: false, error: 'bad_details' }, 400);
        }
        methodLabel = 'মোবাইল রিচার্জ';
        accountNo = profileMobile;
        accountDetails = `${OPERATORS[operator]} (${profileMobile})`;
        identifierKey = `mobile_recharge:${profileMobile}`;
        cleanDetails = { operator, mobile: profileMobile };
      } else if (method === 'bkash' || method === 'nagad' || method === 'rocket') {
        if (amountUsd < cfg.bankWalletMin) {
          return json({ ok: false, error: 'below_min' }, 400);
        }
        const accNum = String(details.accountNumber || '').trim();
        if (!/^01[3-9]\d{8}$/.test(accNum)) {
          return json({ ok: false, error: 'bad_details' }, 400);
        }
        methodLabel = MFS_LABELS[method];
        accountNo = accNum;
        accountDetails = `${accNum} (পার্সোনাল)`;
        identifierKey = `${method}:${accNum}`;
        cleanDetails = { accountNumber: accNum, accountType: 'personal' };
      } else if (method === 'bank') {
        if (amountUsd < cfg.bankWalletMin) {
          return json({ ok: false, error: 'below_min' }, 400);
        }
        const bankName = String(details.bankName || '').trim().slice(0, 100);
        const branch = String(details.branch || '').trim().slice(0, 100);
        const accountName = String(details.accountName || '').trim().slice(0, 100);
        const accNum = String(details.accountNumber || '').trim().slice(0, 50);
        const routing = String(details.routing || '').trim().slice(0, 30);
        if (!bankName || !branch || !accountName || !accNum) {
          return json({ ok: false, error: 'bad_details' }, 400);
        }
        methodLabel = 'ব্যাংক ট্রান্সফার';
        accountNo = `${bankName} · ${accNum}`;
        accountDetails = `${bankName}, ${branch} (হি: ${accNum})`;
        identifierKey = `bank:${bankName.toLowerCase()}:${accNum.toLowerCase()}`;
        cleanDetails = { bankName, branch, accountName, accountNumber: accNum, routing };
      } else {
        return json({ ok: false, error: 'method_not_allowed' }, 400);
      }
    } else {
      // INTL: শুধু Binance Pay
      if (method !== 'binance') {
        return json({ ok: false, error: 'method_not_allowed' }, 400);
      }
      if (amountUsd < cfg.binanceMin) {
        return json({ ok: false, error: 'below_min' }, 400);
      }
      const binanceId = String(details.binanceId || '').trim().slice(0, 100);
      if (!binanceId || binanceId.length < 3) {
        return json({ ok: false, error: 'bad_details' }, 400);
      }
      methodLabel = 'Binance Pay';
      accountNo = binanceId;
      accountDetails = `Pay ID: ${binanceId}`;
      identifierKey = `binance:${binanceId.toLowerCase()}`;
      cleanDetails = { binanceId };
    }

    // ৪) অপেক্ষমাণ আবেদনের সীমা যাচাই
    const pendingList = await fsRunQuery(ctx, {
      from: [{ collectionId: 'withdrawals' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'uid' },
                op: 'EQUAL',
                value: { stringValue: user.sub },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'status' },
                op: 'EQUAL',
                value: { stringValue: 'pending' },
              },
            },
          ],
        },
      },
      limit: Math.max(1, cfg.maxPendingWithdrawals),
    });

    if (pendingList.length >= cfg.maxPendingWithdrawals) {
      return json(
        {
          ok: false,
          error: 'too_fast',
          message: 'আপনার একটি অপেক্ষমাণ আবেদন ইতিমধ্যেই রয়েছে।',
        },
        409
      );
    }

    const accountHash = await sha256Hex(identifierKey);
    const userPath = `users/${user.sub}`;
    const accountPath = `payoutAccounts/${accountHash}`;
    const payoutId = randomId('wd');
    const withdrawalPath = `withdrawals/${payoutId}`;
    const userPayoutPath = `users/${user.sub}/payouts/${payoutId}`;

    // ৫) ট্রানজ্যাকশন: ডুপ্লিকেট অ্যাকাউন্ট + ব্যালেন্স কেটে আবেদন তৈরি
    tx = await fsBeginTx(ctx, true);
    const [uTxRes, accTxRes] = await Promise.all([
      fsGet(ctx, userPath, tx),
      fsGet(ctx, accountPath, tx),
    ]);

    if (!uTxRes.exists) {
      await fsRollbackTx(ctx, tx);
      return json({ ok: false, error: 'no-profile' }, 404);
    }

    if (accTxRes.exists && accTxRes.data?.ownerUid && accTxRes.data.ownerUid !== user.sub) {
      await fsRollbackTx(ctx, tx);
      return json({ ok: false, error: 'account_used' }, 409);
    }

    const curBalanceRaw =
      typeof uTxRes.data?.balanceUsd === 'number'
        ? uTxRes.data.balanceUsd
        : Number(uTxRes.data?.balance || 0);

    if (curBalanceRaw < amountUsd) {
      await fsRollbackTx(ctx, tx);
      return json({ ok: false, error: 'insufficient' }, 400);
    }

    const newBalance = Number((curBalanceRaw - amountUsd).toFixed(2));
    const amountBdt = Math.round(amountUsd * cfg.usdToBdt);
    const nowIso = new Date().toISOString();

    const writes = [
      txUpdateWrite(
        ctx,
        userPath,
        {
          balanceUsd: newBalance,
          autoWithdraw: auto,
        },
        ['balanceUsd', 'autoWithdraw'],
        { exists: true }
      ),
      txUpdateWrite(
        ctx,
        accountPath,
        {
          ownerUid: user.sub,
          method,
          updatedAt: tsValue(nowIso),
        },
        ['ownerUid', 'method', 'updatedAt']
      ),
      txUpdateWrite(
        ctx,
        withdrawalPath,
        {
          uid: user.sub,
          userName: uTxRes.data?.name || '',
          userEmail: uTxRes.data?.email || user.email || '',
          country,
          method,
          methodLabel,
          accountNo,
          accountDetails,
          accountHash,
          details: cleanDetails,
          amountUsd,
          amountBdt,
          auto,
          status: 'pending',
          createdAt: tsValue(nowIso),
        },
        [
          'uid',
          'userName',
          'userEmail',
          'country',
          'method',
          'methodLabel',
          'accountNo',
          'accountDetails',
          'accountHash',
          'details',
          'amountUsd',
          'amountBdt',
          'auto',
          'status',
          'createdAt',
        ],
        { exists: false }
      ),
      txUpdateWrite(
        ctx,
        userPayoutPath,
        {
          method: methodLabel,
          methodKey: method,
          accountNo,
          accountDetails,
          amountUsd,
          amountBdt,
          status: 'pending',
          createdAt: tsValue(nowIso),
        },
        [
          'method',
          'methodKey',
          'accountNo',
          'accountDetails',
          'amountUsd',
          'amountBdt',
          'status',
          'createdAt',
        ],
        { exists: false }
      ),
    ];

    const commitRes = await fsCommitTx(ctx, tx, writes);
    tx = null;
    if (!commitRes.ok) return json({ ok: false, error: 'busy' }, 409);

    return json({
      ok: true,
      id: payoutId,
      balanceUsd: newBalance,
      amountUsd,
      amountBdt,
    });
  } catch {
    if (ctx && tx) await fsRollbackTx(ctx, tx);
    return json({ ok: false, error: 'server' }, 500);
  }
}
