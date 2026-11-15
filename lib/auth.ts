import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

/**
 * Refresh an expired Google access token using the stored refresh token.
 * Returns the updated token fields, or the old token with an `error` flag.
 */
async function refreshAccessToken(token: Record<string, unknown>) {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: String(token.refreshToken ?? ""),
      }),
    });
    const refreshed = await res.json();
    if (!res.ok) throw new Error(refreshed?.error ?? "refresh failed");

    return {
      ...token,
      accessToken: refreshed.access_token as string,
      accessTokenExpires: Date.now() + (refreshed.expires_in as number) * 1000,
      // Google only returns a new refresh token sometimes; keep the old one.
      refreshToken: (refreshed.refresh_token as string | undefined) ?? token.refreshToken,
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authOptions: NextAuthOptions = {
  // Long-lived sign-in: the session lasts 90 days and is re-issued (rolling)
  // at most once a day while the app is used, so an active user is never
  // signed out by the calendar. (Google's own refresh token can still end
  // the session if it is revoked, or after 6 months of no use — nothing in
  // the app can override that.)
  session: {
    strategy: "jwt",
    maxAge: 90 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  pages: {
    // The landing page carries the app's own sign-in button, so never show
    // NextAuth's built-in sign-in page.
    signIn: "/",
    // Friendly error page with a one-tap retry (see app/auth/error). The
    // built-in page's generic "Try signing in with a different account."
    // dead-ends users after the Chrome -> installed-app handoff drops the
    // OAuth state cookie; retrying from the error page works because it
    // runs in the same browsing context the callback lands in.
    error: "/auth/error",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/spreadsheets",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // First sign-in: persist the tokens in the (server-side, encrypted) JWT.
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: account.expires_at
            ? account.expires_at * 1000
            : Date.now() + 3600 * 1000,
        };
      }
      // Return the token while the access token is still valid, with a
      // 5-minute buffer: refreshing before expiry means no request ever
      // runs on a token that dies mid-flight and surfaces as "Session
      // expired". A missing expiry is treated as expired.
      if (
        typeof token.accessTokenExpires === "number" &&
        Date.now() < token.accessTokenExpires - 5 * 60 * 1000
      ) {
        return token;
      }
      // Otherwise refresh it.
      return refreshAccessToken(token as Record<string, unknown>);
    },
    async session({ session }) {
      // Deliberately do NOT expose access/refresh tokens to the client.
      // API routes read them server-side from the JWT via getToken().
      return session;
    },
  },
};
