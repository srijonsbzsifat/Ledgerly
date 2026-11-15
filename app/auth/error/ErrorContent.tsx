"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { getAuthErrorCopy, isHandoffError } from "@/lib/auth-errors";

export function ErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error") ?? "default";
  const copy = getAuthErrorCopy(error);
  const handoff = isHandoffError(error);
  const [busy, setBusy] = useState(false);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="w-full max-w-md rounded-3xl bg-zinc-900 p-8 shadow-2xl">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 text-2xl">
          ⚠️
        </div>
        <h1 className="text-center text-xl font-bold tracking-tight">
          {copy.title}
        </h1>
        <p className="mt-3 text-center text-sm leading-relaxed text-zinc-400">
          {copy.body}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void signIn("google", { callbackUrl: "/" });
          }}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-full bg-white px-6 py-3 text-base font-semibold text-zinc-900 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
            />
          </svg>
          {busy ? "Signing in…" : "Try signing in again"}
        </button>
        {handoff && (
          <p className="mt-5 text-center text-xs leading-relaxed text-zinc-500">
            If this keeps happening, turn off the installed app&apos;s
            &ldquo;Open by default&rdquo; (Settings → Apps → Ledgerly
            → Open by default) and sign in from Chrome instead.
          </p>
        )}
        <p className="mt-5 text-center font-mono text-[11px] text-zinc-600">
          Error code: {error}
        </p>
        <p className="mt-3 text-center text-xs">
          <a href="/" className="text-emerald-400 underline underline-offset-2">
            Back to the home page
          </a>
        </p>
      </div>
    </main>
  );
}
