import React from 'react';

export const CardSkeleton: React.FC<{ lines?: number }> = ({ lines = 3 }) => (
  <div className="animate-pulse rounded-2xl border border-emerald-950/10 bg-white p-5 dark:border-emerald-200/10 dark:bg-[#11221C]">
    <div className="mb-3 h-5 w-2/5 rounded bg-slate-200 dark:bg-slate-700" />
    {Array.from({ length: lines }).map((_, idx) => (
      <div
        key={idx}
        className={`mb-2 h-3.5 rounded bg-slate-100 dark:bg-slate-800 ${
          idx === lines - 1 ? 'w-3/5' : 'w-full'
        }`}
      />
    ))}
  </div>
);

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-900/15 bg-white/70 px-6 py-10 text-center dark:border-emerald-200/15 dark:bg-[#11221C]/70">
    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
      {icon}
    </div>
    <h3 className="text-base font-bold text-[#112A22] dark:text-[#ECF5F1]">{title}</h3>
    <p className="mt-1 max-w-sm text-sm text-slate-600 dark:text-slate-400">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);
