import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Ledgerly",
  description:
    "How Ledgerly handles your Google account and spreadsheet data.",
};

const SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: "What this app is",
    body: [
      "Ledgerly is a personal expense dashboard. It reads a Google Sheet you choose — in the Cash 2026 format, with monthly tabs — and shows your balance, monthly income versus expenses, category breakdowns and transactions. You can also add new expense and income entries from the app, which are written back to that same sheet. If you don't have a sheet yet, the app can create a new one for you in your Google Drive, already set up in the same format.",
    ],
  },
  {
    heading: "What data the app accesses",
    body: [
      "When you sign in with Google, the app receives your basic profile information (name, email address and profile picture) so it can show who is signed in.",
      "When you connect a sheet, the app accesses that spreadsheet only: it reads the rows of its monthly tabs and appends new rows when you add an entry. It does not read, list or access any other file in your Google Drive. If you choose to create a new sheet, the app creates one new spreadsheet in your Drive — that is the only file it ever creates. Inside a connected sheet, the app may add tabs of its own — Categories, Accounts, Trash, Notes, Recurring and Budgets — to store the lists and notes you manage in the app. Those tabs live in your sheet, under your control, and nothing in them leaves Google.",
      "The app asks Google for exactly two things: your basic profile, and access to Google Sheets. It never asks for access to your email, contacts, calendar or Drive files.",
    ],
  },
  {
    heading: "How your data is handled",
    body: [
      "Your expense data lives in your own Google Sheet and stays there. The app does not copy your transactions to its own database — there is no database. Every time you open the app it reads the current rows from your sheet.",
      "The Google sign-in tokens that let the app talk to Sheets are kept server-side inside an encrypted session, and are never shown to the browser. They are used only to read and write the sheet you connected.",
      "The IDs and titles of the sheets you connect are remembered in two places on your own device: the active sheet in a browser cookie (so the server knows which sheet to read) and the list of your sheets in your browser's local storage (so you can switch between them and reconnect if the cookie is lost). The connection is tied to the Google account that made it — signing in as a different account never reuses another account's sheets. Your colour theme preference is also stored in local storage on your device. Nothing else is stored.",
    ],
  },
  {
    heading: "What the app does not do",
    body: [
      "The app does not sell, share or send your data to any third party. It has no advertising, no analytics and no trackers.",
      "The app does not read any spreadsheet you have not explicitly connected, and it never changes a sheet except through the entries you add, edit or delete — and it only creates a new spreadsheet when you ask it to.",
    ],
  },
  {
    heading: "Disconnecting and deleting",
    body: [
      "You can disconnect your sheet at any time from the dashboard header (Change / disconnect sheet). This removes the sheet connection from the app; your spreadsheet itself is untouched.",
      "You can revoke the app's access to your Google account entirely at any time from your Google account permissions page (myaccount.google.com/permissions). Once revoked, the app cannot read or write your sheet, and its stored sign-in tokens stop working.",
      "Because the app stores no copy of your data, there is nothing further to delete on our side. Deleting rows from your sheet is done in Google Sheets itself.",
    ],
  },
  {
    heading: "Security",
    body: [
      "All traffic between your browser and the app uses HTTPS. Sign-in tokens are encrypted at rest in the session and are never exposed to the browser or logged.",
    ],
  },
  {
    heading: "Changes to this policy",
    body: [
      "If this policy changes, the new version will be published on this page with a new effective date. Continued use of the app after a change means you accept the updated policy.",
    ],
  },
  {
    heading: "Contact",
    body: [
      "Questions about this policy or the app can be sent to srijonsbzsifat@gmail.com.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
      <Link
        href="/"
        className="text-sm font-medium text-accent-ink hover:underline"
      >
        ← Back to Ledgerly
      </Link>
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-4xl">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Ledgerly · Effective 14 November 2026
      </p>
      <div className="mt-8 space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2 className="text-lg font-bold tracking-tight">
              {section.heading}
            </h2>
            {section.body.map((paragraph) => (
              <p
                key={paragraph.slice(0, 32)}
                className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400"
              >
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}
