import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { getAuthErrorCopy, isHandoffError } from "@/lib/auth-errors";
import { Dashboard } from "@/components/Dashboard";
import { Logo, LogoLockup } from "@/components/Logo";
import { SignInButton } from "@/components/SignInButton";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

export default async function Home({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    // NextAuth v4 routes sign-in errors (OAuthCallback, OAuthSignin, ...)
    // to the sign-in page — which is this landing page — as ?error=...,
    // so the friendly error banner lives here, above the retry button.
    const errorParam = searchParams?.error;
    const error = Array.isArray(errorParam) ? errorParam[0] : errorParam;
    const errorCopy = error ? getAuthErrorCopy(error) : null;

    return (
      <main className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between px-5 py-4 sm:px-8">
          <LogoLockup />
          <ThemeSwitcher />
        </header>
        <div className="flex flex-1 items-center justify-center px-5 pb-16">
          <div className="w-full max-w-xl text-center">
            <div className="mx-auto mb-8 flex justify-center">
              <Logo className="h-20 w-20 drop-shadow-lg" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
              Your money, <span className="text-accent-ink">beautifully</span> organised.
            </h1>
            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
              Connect your Google Sheet and see your balance, monthly income vs
              expenses, and category breakdowns — and add new entries right
              from here.
            </p>
            {errorCopy && (
              <div className="mx-auto mt-8 w-full max-w-md rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-left">
                <p className="text-sm font-bold text-amber-700 dark:text-amber-300">
                  ⚠️ {errorCopy.title}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                  {errorCopy.body}
                </p>
                {error && isHandoffError(error) && (
                  <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    If this keeps happening, turn off the installed
                    app&apos;s &ldquo;Open by default&rdquo; (Settings → Apps
                    → Ledgerly → Open by default) and sign in from
                    Chrome instead.
                  </p>
                )}
                <p className="mt-3 font-mono text-[11px] text-zinc-500 dark:text-zinc-500">
                  Error code: {error}
                </p>
              </div>
            )}
            <div className="mt-8">
              <SignInButton />
            </div>
            <p className="mt-6 text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">
              Sign-in only asks for access to Google Sheets so the dashboard
              can read and write the sheet you choose. Each person signs in
              with their own Google account and sees only their own data.
            </p>
            <p className="mt-4 text-xs">
              <Link href="/privacy" className="font-medium text-accent-ink hover:underline">
                Privacy policy
              </Link>
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <Dashboard
      userName={session.user.name ?? session.user.email ?? "You"}
      userImage={session.user.image ?? null}
    />
  );
}
