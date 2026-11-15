"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { ThemeProvider } from "./ThemeProvider";

export function Providers({ children }: { children: ReactNode }) {
  // Re-check the session every 15 minutes while the app is open. Each check
  // runs the token callback server-side, so the hourly Google access token
  // is refreshed in the background before it expires — the user never hits
  // a timeout in the middle of using the dashboard.
  return (
    <SessionProvider refetchInterval={15 * 60}>
      <ThemeProvider>{children}</ThemeProvider>
    </SessionProvider>
  );
}
