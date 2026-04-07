"use client";

import type { ReactNode } from "react";

export function AdminSectionShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-[rgba(255,188,219,0.16)] bg-[rgba(56,18,34,0.74)] p-5 shadow-[0_24px_70px_rgba(17,5,10,0.28)] backdrop-blur-xl sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-black text-[#fff4f8]">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm leading-6 text-[#d7aabd]">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      </section>
      {children}
    </div>
  );
}

export function AdminCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[26px] border border-[rgba(255,188,219,0.16)] bg-[rgba(56,18,34,0.74)] p-5 shadow-[0_24px_70px_rgba(17,5,10,0.28)] backdrop-blur-xl ${className}`.trim()}
    >
      {children}
    </section>
  );
}

export function AdminEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[24px] border border-dashed border-[rgba(255,188,219,0.18)] bg-white/5 px-5 py-10 text-center">
      <div className="text-base font-black text-[#fff4f8]">{title}</div>
      <div className="mt-2 text-sm leading-6 text-[#d7aabd]">{description}</div>
    </div>
  );
}
