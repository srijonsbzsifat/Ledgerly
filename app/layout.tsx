import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ledgerly",
  description:
    "View your expenses, balance and monthly charts — backed by your own Google Sheet.",
  manifest: "/manifest.webmanifest",
  // Google Search Console domain verification (OAuth consent screen
  // authorized domain). Next renders this as the google-site-verification
  // meta tag on every page, including the home page.
  verification: {
    google: "11n_Nk5COB__xH04qkj3J03SCOP3LQjc5jQrA3Zw8IQ",
  },
  appleWebApp: {
    capable: true,
    title: "Ledgerly",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#059669" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

/**
 * Runs before React hydrates so the saved theme applies with no flash.
 * Mirrors the logic in components/ThemeProvider.tsx.
 */
const themeInitScript = `(function(){try{var t=localStorage.getItem('cash-theme');var a=localStorage.getItem('cash-accent');a=(a==='emerald'||a==='indigo')?a:'emerald';var dark=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark);document.documentElement.setAttribute('data-accent',a);}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${inter.variable} font-sans`}>
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
