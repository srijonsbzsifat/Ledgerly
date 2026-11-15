/**
 * Friendly copy for NextAuth error codes, shared by the landing-page banner
 * (app/page.tsx) and the custom error page (app/auth/error).
 *
 * Why the landing page needs this: in NextAuth v4, sign-in errors
 * (OAuthCallback, OAuthSignin, ...) are routed to the SIGN-IN page, not to
 * pages.error — pages.error only receives the other errors (Configuration,
 * AccessDenied, Verification, ...). Since pages.signIn is "/", the OAuth
 * errors land on the landing page as ?error=OAuthCallback, so the banner
 * must live there.
 *
 * The OAuth errors are the ones Sifat kept hitting: the sign-in starts in
 * Chrome, Android hands the callback to the installed app, and the app
 * doesn't have the sign-in state cookie, so NextAuth rejects the callback.
 * Retrying from the same page works because the retry starts and ends in
 * the same browsing context.
 */

export type AuthErrorCopy = { title: string; body: string };

const HANDOFF_COPY: AuthErrorCopy = {
  title: "Sign-in was interrupted",
  body: "Your phone switched between the browser and the installed app halfway through signing in, and the sign-in didn't survive the switch. This is a known hiccup — tap the button below to try again, it works.",
};

const COPY: Record<string, AuthErrorCopy> = {
  OAuthCallback: HANDOFF_COPY,
  OAuthSignin: HANDOFF_COPY,
  OAuthCreateAccount: HANDOFF_COPY,
  Callback: HANDOFF_COPY,
  Signin: HANDOFF_COPY,
  AccessDenied: {
    title: "That account can't sign in yet",
    body: "Google refused the sign-in for this account. If the app is still in testing, the account needs to be on the test-user list first.",
  },
  Configuration: {
    title: "Something's wrong on our side",
    body: "The sign-in isn't set up correctly on the server. Please try again later.",
  },
  Verification: {
    title: "That sign-in link isn't valid any more",
    body: "The link may have been used already or may have expired. Please start signing in again.",
  },
};

const FALLBACK: AuthErrorCopy = {
  title: "Couldn't sign you in",
  body: "Something went wrong during sign-in. Trying again usually fixes it.",
};

const HANDOFF_ERRORS = new Set([
  "OAuthCallback",
  "OAuthSignin",
  "OAuthCreateAccount",
  "Callback",
  "Signin",
]);

export function getAuthErrorCopy(error: string): AuthErrorCopy {
  return COPY[error] ?? FALLBACK;
}

export function isHandoffError(error: string): boolean {
  return HANDOFF_ERRORS.has(error);
}
