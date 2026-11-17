import { auth } from './firebase';

export const API_ENDPOINTS = {
  HEARTBEAT: '/api/heartbeat',
  DAILY_CLAIM: '/api/daily-claim',
  WITHDRAW: '/api/withdraw',
  REFERRAL: '/api/referral',
  DELETE_ACCOUNT: '/api/delete-account',
  ADMIN: '/api/admin',
};

async function getBearerHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('login');
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function claimDailyBonus() {
  const headers = await getBearerHeader();
  const res = await fetch(API_ENDPOINTS.DAILY_CLAIM, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  return res.json();
}

export async function syncReferralInit() {
  const headers = await getBearerHeader();
  const res = await fetch(API_ENDPOINTS.REFERRAL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'init' }),
  });
  return res.json();
}

export async function submitWithdrawRequest(payload: {
  method: string;
  amountUsd: number;
  auto?: boolean;
  details: Record<string, unknown>;
}) {
  const headers = await getBearerHeader();
  const res = await fetch(API_ENDPOINTS.WITHDRAW, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ...data };
}

export async function deleteAccountRequest(confirmText: string) {
  const headers = await getBearerHeader();
  const res = await fetch(API_ENDPOINTS.DELETE_ACCOUNT, {
    method: 'POST',
    headers,
    body: JSON.stringify({ confirmText }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ...data };
}

export async function callAdminApi<T = Record<string, unknown>>(
  action: string,
  params: Record<string, unknown> = {}
): Promise<T & { ok: boolean; error?: string }> {
  const headers = await getBearerHeader();
  const res = await fetch(API_ENDPOINTS.ADMIN, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, params }),
  });
  const data = await res.json().catch(() => ({ ok: false, error: 'server' }));
  return data;
}
