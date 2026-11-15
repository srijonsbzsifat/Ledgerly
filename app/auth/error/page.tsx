import { Suspense } from "react";
import { ErrorContent } from "./ErrorContent";

export const metadata = {
  title: "Sign-in problem — Ledgerly",
};

/**
 * Custom NextAuth error page (see `pages.error` in lib/auth.ts).
 * useSearchParams() needs a Suspense boundary in the App Router.
 */
export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-zinc-100">
          <p className="text-sm text-zinc-400">Loading…</p>
        </main>
      }
    >
      <ErrorContent />
    </Suspense>
  );
}
