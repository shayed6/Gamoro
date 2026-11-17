const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBn(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '০';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '০';
    return value.toLocaleString('bn-BD');
  }
  return String(value).replace(/\d/g, (d) => BN_DIGITS[Number(d)] ?? d);
}

export function normalizeDigits(input: string): string {
  return String(input || '')
    .trim()
    .replace(/[০-৯]/g, (ch) => String(BN_DIGITS.indexOf(ch)));
}

export function formatUsd(amount: number | undefined | null): string {
  const n = Number(amount || 0);
  return `$${n.toFixed(2)}`;
}

export function formatBdt(amount: number | undefined | null): string {
  const n = Math.round(Number(amount || 0));
  return `${n.toLocaleString('bn-BD')} ৳`;
}

export function getDhakaDate(offsetDays = 0): string {
  const t = Date.now() + 6 * 3600e3 + offsetDays * 86400e3;
  return new Date(t).toISOString().slice(0, 10);
}

export function getDhakaPeriod(offsetDays = 0): string {
  return getDhakaDate(offsetDays).slice(0, 7);
}

export function getDhakaWeekId(offsetDays = 0): string {
  const t = Date.now() + 6 * 3600e3 + offsetDays * 86400e3;
  const d = new Date(t);
  const utcDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function formatBnDate(val: unknown): string {
  if (!val) return '';
  let d: Date;
  if (val instanceof Date) {
    d = val;
  } else if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    d = (val as { toDate: () => Date }).toDate();
  } else {
    d = new Date(String(val));
  }
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('bn-BD', {
    timeZone: 'Asia/Dhaka',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatBnDateTime(val: unknown): string {
  if (!val) return '';
  let d: Date;
  if (val instanceof Date) {
    d = val;
  } else if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    d = (val as { toDate: () => Date }).toDate();
  } else {
    d = new Date(String(val));
  }
  if (Number.isNaN(d.getTime())) return '';
  return (
    d.toLocaleDateString('bn-BD', {
      timeZone: 'Asia/Dhaka',
      day: 'numeric',
      month: 'short',
    }) +
    ', ' +
    d.toLocaleTimeString('bn-BD', {
      timeZone: 'Asia/Dhaka',
      hour: '2-digit',
      minute: '2-digit',
    })
  );
}

export function fsTsToIso(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  return '';
}
