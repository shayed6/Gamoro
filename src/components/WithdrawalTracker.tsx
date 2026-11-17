import React from 'react';
import { CheckCircle2, Clock, ShieldCheck, Send, XCircle } from 'lucide-react';
import type { WithdrawalRecord, WithdrawalStatus } from '../types';
import { formatBnDateTime, formatBdt, formatUsd } from '../lib/format';

const STEPS: Array<{
  key: 'submitted' | 'verifying' | 'approved' | 'sent';
  label: string;
}> = [
  { key: 'submitted', label: 'জমা দেওয়া হয়েছে' },
  { key: 'verifying', label: 'যাচাই চলছে' },
  { key: 'approved', label: 'অনুমোদিত' },
  { key: 'sent', label: 'পাঠানো হয়েছে' },
];

function getStepIndex(status: WithdrawalStatus): number {
  if (status === 'sent' || status === 'paid') return 3;
  if (status === 'approved') return 2;
  if (status === 'verifying') return 1;
  return 0;
}

export const WithdrawalTracker: React.FC<{ item: WithdrawalRecord }> = ({ item }) => {
  const isRejected = item.status === 'rejected';
  const currentIdx = getStepIndex(item.status);

  const stepTimestamps: Record<string, string | undefined> = {
    submitted: item.submittedAt || item.createdAt,
    verifying: item.verifyingAt,
    approved: item.approvedAt,
    sent: item.sentAt || item.paidAt,
  };

  return (
    <div className="rounded-2xl border border-emerald-950/10 bg-white p-4 shadow-sm dark:border-emerald-200/10 dark:bg-[#11221C]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-[#112A22] dark:text-[#ECF5F1]">
            {item.methodLabel || item.method} · {item.label || item.accountDetails || item.accountNo}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            আবেদন: {formatBnDateTime(item.submittedAt || item.createdAt)}
          </p>
        </div>
        <div className="text-right tabular-nums">
          <p className="text-base font-bold text-teal-700 dark:text-teal-300">
            {formatUsd(item.amountUsd)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{formatBdt(item.amountBdt)}</p>
        </div>
      </div>

      {isRejected ? (
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <div>
            <p className="font-bold">আবেদন বাতিল হয়েছে</p>
            {item.rejectReason && <p className="mt-0.5">{item.rejectReason}</p>}
            {item.rejectedAt && (
              <p className="mt-1 opacity-80">সময়: {formatBnDateTime(item.rejectedAt)}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <div className="grid grid-cols-4 gap-1.5">
            {STEPS.map((step, idx) => {
              const done = idx <= currentIdx;
              const active = idx === currentIdx && currentIdx < 3;
              const ts = stepTimestamps[step.key];

              return (
                <div key={step.key} className="flex flex-col items-center text-center">
                  <div className="relative flex w-full items-center justify-center">
                    {idx > 0 && (
                      <span
                        className={`absolute right-1/2 top-1/2 h-0.5 w-full -translate-y-1/2 ${
                          done
                            ? 'bg-teal-600 dark:bg-teal-400'
                            : 'bg-slate-200 dark:bg-slate-700'
                        }`}
                      />
                    )}
                    <div
                      className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                        done
                          ? 'border-teal-600 bg-teal-600 text-white dark:border-teal-400 dark:bg-teal-500 dark:text-slate-950'
                          : 'border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900'
                      }`}
                    >
                      {step.key === 'submitted' && <Clock className="h-3.5 w-3.5" />}
                      {step.key === 'verifying' && <ShieldCheck className="h-3.5 w-3.5" />}
                      {step.key === 'approved' && <CheckCircle2 className="h-3.5 w-3.5" />}
                      {step.key === 'sent' && <Send className="h-3.5 w-3.5" />}
                    </div>
                  </div>
                  <span
                    className={`mt-1.5 text-[11px] leading-tight ${
                      done
                        ? 'font-bold text-teal-800 dark:text-teal-300'
                        : 'font-medium text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {step.label}
                  </span>
                  {ts && (
                    <span className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                      {formatBnDateTime(ts).split(',')[0]}
                    </span>
                  )}
                  {active && (
                    <span className="mt-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                      চলমান
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {item.txId && (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
              লেনদেন আইডি (TxID): <span className="font-mono font-bold">{item.txId}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
};
