"use client";

import { useId } from "react";

/**
 * Ledger-style logo mark: a ruled ledger page with a folded corner, a red
 * margin line and a column divider, on an accent-gradient tile. The tile
 * follows the user's chosen accent colour.
 */
export function Logo({ className = "h-9 w-9" }: { className?: string }) {
  const id = useId();
  const gradId = `logo-grad-${id}`;
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="Ledgerly logo"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: "rgb(var(--accent))" }} />
          <stop offset="100%" style={{ stopColor: "rgb(var(--accent-strong))" }} />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="15" fill={`url(#${gradId})`} />
      {/* Ledger page with folded top-right corner. */}
      <path
        d="M18 12 h22 l9 9 v28 a3 3 0 0 1 -3 3 H18 a3 3 0 0 1 -3 -3 V15 a3 3 0 0 1 3-3 z"
        fill="#ffffff"
      />
      <path d="M40 12 l9 9 h-9 z" fill="#e4e4e7" />
      {/* Margin line, column divider, ruled lines. */}
      <line x1="21" y1="25" x2="21" y2="45" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round" />
      <line x1="37" y1="25" x2="37" y2="45" stroke="#e4e4e7" strokeWidth="2" strokeLinecap="round" />
      <line x1="24" y1="27" x2="45" y2="27" strokeWidth="2.5" strokeLinecap="round" style={{ stroke: "rgb(var(--accent))" }} />
      <line x1="24" y1="34" x2="45" y2="34" strokeWidth="2.5" strokeLinecap="round" style={{ stroke: "rgb(var(--accent))" }} />
      <line x1="24" y1="41" x2="45" y2="41" strokeWidth="2.5" strokeLinecap="round" style={{ stroke: "rgb(var(--accent))" }} />
    </svg>
  );
}

/** Logo mark + wordmark, as used in the app and landing headers. */
export function LogoLockup() {
  return (
    <span className="flex items-center gap-2.5">
      <Logo className="h-9 w-9 shrink-0" />
      <span className="text-lg font-bold tracking-tight">Ledgerly</span>
    </span>
  );
}
