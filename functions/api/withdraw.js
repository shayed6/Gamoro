// functions/api/withdraw.js  →  POST /api/withdraw
// Cloudflare Pages Function: উইথড্রয়াল আবেদন (mobile_recharge, binance, gift_card, donation)

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

const GIFT_CARD_BRANDS = {
  google_play: 'Google Play গিফট কার্ড',
  other: 'অন্যান্য গিফট কার্ড',
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

    // পিন রিসেটের ২৪ ঘণ্টার মধ্যে উইথড্র নিষিদ্ধ (pin_cooldown)
    const pinDoc = pinCheck.pinDoc || {};
    if (pinDoc.pinResetAt) {
      const resetMs = Date.parse(pinDoc.pinResetAt) || 0;
      if (resetMs > 0 && Date.now() - resetMs < 24 * 60 * 60 * 1000) {
        return json({ ok: false, error: 'pin_cooldown' }, 403);
      }
    }

    const uProfile = pinCheck.userDoc || {};
    if (uProfile.status === 'suspended') {
      return json({ ok: false, error: 'suspended', message: 'আপনার অ্যাকাউন্ট স্থগিত করা হয়েছে' }, 403);
    }

    // ২) কনফিগ লোড (config/withdraw ও config/donation)
    const [cfgRes, donationCfgRes] = await Promise.all([
      fsGet(ctx, 'config/withdraw'),
      method === 'donation' ? fsGet(ctx, 'config/donation') : Promise.resolve({ exists: false, data: null }),
    ]);
    const cfgData = cfgRes.data || {};
    const cfg = {
      usdToBdt: Number(cfgData.usdToBdt || 110),
      carryBelowUsd: Number(cfgData.carryBelowUsd ?? 1),
      mobileRechargeMin: Number(cfgData.mobileRechargeMin ?? 1),
      mobileRechargeMax: Number(
        cfgData.mobileRechargeMax ??
          (cfgData.mobileRechargeMaxExclusive !== undefined
            ? Number(cfgData.mobileRechargeMaxExclusive) - 0.01
            : 19.99)
      ),
      binanceMin: Number(cfgData.binanceMin ?? 10),
      giftCardMin: Number(cfgData.giftCardMin ?? 20),
      donationMin: Number(cfgData.donationMin ?? 1),
      maxPending: Number(cfgData.maxPending ?? cfgData.maxPendingWithdrawals ?? 1),
    };

    const country = uProfile.country === 'INTL' ? 'INTL' : 'BD';
    let methodLabel = '';
    let userFacingLabel = '';
    let identifierKey = '';
    let cleanDetails = {};
    let checkAccountHash = false;

    // ৩) দেশ, পদ্ধতি, সীমা ও বিবরণ যাচাই
    if (method === 'mobile_recharge') {
      if (country !== 'BD') {
        return json({ ok: false, error: 'method_not_allowed' }, 400);
      }
      if (amountUsd < cfg.mobileRechargeMin) {
        return json({ ok: false, error: 'below_min' }, 400);
      }
      if (amountUsd > cfg.mobileRechargeMax) {
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
      userFacingLabel = `${OPERATORS[operator]} (${profileMobile})`;
      identifierKey = `mobile_recharge:${profileMobile}`;
      cleanDetails = { operator, mobile: profileMobile };
      checkAccountHash = true;
    } else if (method === 'binance') {
      if (country !== 'INTL') {
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
      userFacingLabel = `Pay ID: ${binanceId}`;
      identifierKey = `binance:${binanceId.toLowerCase()}`;
      cleanDetails = { binanceId };
      checkAccountHash = true;
    } else if (method === 'gift_card') {
      if (amountUsd < cfg.giftCardMin) {
        return json({ ok: false, error: 'below_min' }, 400);
      }
      const brand = String(details.brand || '').trim().toLowerCase();
      if (!GIFT_CARD_BRANDS[brand]) {
        return json({ ok: false, error: 'bad_details' }, 400);
      }
      const deliveryEmail = String(uProfile.email || user.email || '').trim();
      if (!deliveryEmail) {
        return json({ ok: false, error: 'bad_details' }, 400);
      }
      methodLabel = 'গিফট কার্ড';
      userFacingLabel = GIFT_CARD_BRANDS[brand];
      cleanDetails = { brand, deliveryEmail };
      checkAccountHash = false;
    } else if (method === 'donation') {
      if (amountUsd < cfg.donationMin) {
        return json({ ok: false, error: 'below_min' }, 400);
      }
      const orgId = String(details.orgId || '').trim();
      const orgs = Array.isArray(donationCfgRes.data?.orgs) ? donationCfgRes.data.orgs : [];
      const matchedOrg = orgs.find(
        (o) => o && String(o.id || '').trim() === orgId && o.active === true
      );
      if (!orgId || !matchedOrg) {
        return json({ ok: false, error: 'bad_details' }, 400);
      }
      const orgName = String(matchedOrg.name || orgId).trim();
      methodLabel = 'ডোনেশন';
      userFacingLabel = orgName;
      cleanDetails = { orgId, orgName };
      checkAccountHash = false;
    } else {
      return json({ ok: false, error: 'method_not_allowed' }, 400);
    }

    // ৪) অপেক্ষমাণ আবেদনের সীমা যাচাই (সর্বোচ্চ maxPending)
    const maxPending = Math.max(1, cfg.maxPending);
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
      limit: maxPending,
    });

    if (pendingList.length >= maxPending) {
      return json(
        {
          ok: false,
          error: 'pending_exists',
          message: 'আপনার একটি আবেদন আগে থেকেই অপেক্ষমাণ।',
        },
        409
      );
    }

    const accountHash = checkAccountHash ? await sha256Hex(identifierKey) : '';
    const userPath = `users/${user.sub}`;
    const accountPath = accountHash ? `payoutAccounts/${accountHash}` : '';
    const payoutId = randomId('wd');
    const withdrawalPath = `withdrawals/${payoutId}`;
    const userPayoutPath = `users/${user.sub}/payouts/${payoutId}`;

    // ৫) ট্রানজ্যাকশন: ডুপ্লিকেট অ্যাকাউন্ট (recharge ও binance) + ব্যালেন্স কেটে আবেদন তৈরি
    tx = await fsBeginTx(ctx, true);
    const [uTxRes, accTxRes] = await Promise.all([
      fsGet(ctx, userPath, tx),
      accountPath ? fsGet(ctx, accountPath, tx) : Promise.resolve({ exists: false, data: null }),
    ]);

    if (!uTxRes.exists) {
      await fsRollbackTx(ctx, tx);
      return json({ ok: false, error: 'no-profile' }, 404);
    }

    if (
      checkAccountHash &&
      accTxRes.exists &&
      accTxRes.data?.ownerUid &&
      accTxRes.data.ownerUid !== user.sub
    ) {
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

    const wdFields = {
      uid: user.sub,
      userName: uTxRes.data?.name || '',
      userEmail: uTxRes.data?.email || user.email || '',
      country,
      method,
      methodLabel,
      label: userFacingLabel,
      accountNo: userFacingLabel,
      accountDetails: userFacingLabel,
      accountHash,
      details: cleanDetails,
      amountUsd,
      amountBdt,
      auto,
      status: 'pending',
      createdAt: tsValue(nowIso),
    };

    // ইউজার-ফেসিং পেআউট ডকুমেন্টে শুধু label থাকবে (ইমেইল/আইপি/ফ্ল্যাগ নয়)
    const userPayoutFields = {
      method: methodLabel,
      methodKey: method,
      label: userFacingLabel,
      accountDetails: userFacingLabel,
      amountUsd,
      amountBdt,
      status: 'pending',
      createdAt: tsValue(nowIso),
    };

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
        withdrawalPath,
        wdFields,
        Object.keys(wdFields),
        { exists: false }
      ),
      txUpdateWrite(
        ctx,
        userPayoutPath,
        userPayoutFields,
        Object.keys(userPayoutFields),
        { exists: false }
      ),
    ];

    if (checkAccountHash && accountPath) {
      writes.push(
        txUpdateWrite(
          ctx,
          accountPath,
          {
            ownerUid: user.sub,
            method,
            updatedAt: tsValue(nowIso),
          },
          ['ownerUid', 'method', 'updatedAt']
        )
      );
    }

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
