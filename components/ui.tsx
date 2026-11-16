"use client";

/** Shared small UI pieces: the dashboard card and the loading spinner. */

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-3xl border border-zinc-200 bg-white p-5 shadow-card transition-shadow hover:shadow-card-hover dark:border-zinc-800 dark:bg-zinc-900 sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}
