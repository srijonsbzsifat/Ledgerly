"use client";

import { useEffect, useMemo, useState } from "react";
import type { ManageSection } from "./ManageView";

export type HelpAction =
  | { kind: "tab"; tab: "overview" | "transactions" | "reports" | "manage"; section?: ManageSection }
  | { kind: "add" };

interface Article {
  title: string;
  body: string;
  keywords: string[];
  action?: { label: string; act: HelpAction };
}

const ARTICLES: Article[] = [
  {
    title: "Add an entry",
    body: "Use Quick add on the Overview, the + button, or the Add entry button. Pick money out or money in, an amount, a category and a date — it lands in the right month's tab of your sheet.",
    keywords: ["add", "entry", "new", "quick add", "record"],
    action: { label: "Add an entry", act: { kind: "add" } },
  },
  {
    title: "Edit or delete an entry",
    body: "Every row in Transactions (and the recent list on the Overview) has edit and delete buttons. Edits check the row hasn't changed in the sheet before saving. Deleted entries wait 30 days in Trash before going for good.",
    keywords: ["edit", "delete", "change", "fix", "remove", "trash"],
    action: { label: "Go to Transactions", act: { kind: "tab", tab: "transactions" } },
  },
  {
    title: "Switch between sheets",
    body: "Tap the sheet name at the top to switch between your sheets — your own and any shared with you. Add another sheet from the same menu, or create a new one in the Cash 2026 format.",
    keywords: ["switch", "sheet", "partner", "shared", "multiple", "change sheet"],
  },
  {
    title: "Create a new sheet",
    body: "From the sheet menu, choose Add another sheet, then Create a new sheet. It is made in your Google Drive with all 12 monthly tabs, ready to use.",
    keywords: ["create", "new sheet", "start", "fresh"],
  },
  {
    title: "Add a category",
    body: "Manage → Categories lists every category, split by money out and money in. Add one at the bottom of either column; it appears in the pickers straight away. Rename, reorder and delete from the same screen.",
    keywords: ["category", "categories", "new category", "rename", "reorder"],
    action: { label: "Go to Categories", act: { kind: "tab", tab: "manage", section: "categories" } },
  },
  {
    title: "Why does an entry show as Uncategorised?",
    body: "Reports group entries by the categories in your managed list. An entry typed straight into the sheet (or imported) with a category that isn't in the list shows as Uncategorised. Manage → Categories lists those at the bottom with one-tap adds.",
    keywords: ["uncategorised", "unknown", "missing category"],
    action: { label: "Go to Categories", act: { kind: "tab", tab: "manage", section: "categories" } },
  },
  {
    title: "Accounts and transfers",
    body: "Every entry belongs to an account — Cash by default. Add bank or mobile-money accounts in Manage → Accounts, then move money between them with the Transfer option in Quick add or the add form. Transfers never count as income or spending.",
    keywords: ["account", "bank", "bkash", "cash", "transfer", "move money"],
    action: { label: "Go to Accounts", act: { kind: "tab", tab: "manage", section: "accounts" } },
  },
  {
    title: "See reports for a month or year",
    body: "The Reports tab tells the story of a month or a year: what you spent, daily trends, income vs spending, where it went, and a year summary. Switch between Month and Year at the top.",
    keywords: ["report", "reports", "month", "year", "summary", "trend", "chart"],
    action: { label: "Go to Reports", act: { kind: "tab", tab: "reports" } },
  },
  {
    title: "Import entries from a file",
    body: "Manage → Import & export takes a CSV file — a bank statement or a spreadsheet — and shows you every row before anything is added. Columns are guessed from the header names; fix any wrong guess, then import. Duplicates are not checked.",
    keywords: ["import", "csv", "bank statement", "spreadsheet", "upload", "restore backup"],
    action: { label: "Go to Import & export", act: { kind: "tab", tab: "manage", section: "import" } },
  },
  {
    title: "Export or back up my data",
    body: "Manage → Import & export: a CSV backup keeps every detail (IDs, accounts, transfer links) so it can be imported back later. A CSV or PDF statement is a clean list of entries for a month or all months.",
    keywords: ["export", "backup", "download", "pdf", "statement"],
    action: { label: "Go to Import & export", act: { kind: "tab", tab: "manage", section: "import" } },
  },
  {
    title: "Restore a deleted entry",
    body: "Manage → Trash keeps deleted entries for 30 days. Restore puts one back in its monthly tab; Delete forever removes it now.",
    keywords: ["restore", "trash", "deleted", "undo", "recover"],
    action: { label: "Go to Trash", act: { kind: "tab", tab: "manage", section: "trash" } },
  },
  {
    title: "Install Ledgerly on my phone",
    body: "On Android, open the site in Chrome, tap the three dots and choose Install app (or Add to Home screen). On iPhone, open it in Safari, tap Share and choose Add to Home Screen. It then opens like any other app.",
    keywords: ["install", "app", "phone", "android", "iphone", "home screen", "pwa"],
  },
  {
    title: "Why does Google warn the app isn't verified?",
    body: "Ledgerly is waiting for Google to verify it. Until then, signing in shows an unverified-app warning — tap Advanced, then Go to the site to continue. Your data stays in your own Google Sheet; nothing is stored anywhere else.",
    keywords: ["verified", "warning", "unsafe", "google", "sign in", "permission"],
  },
  {
    title: "Is my data private?",
    body: "Yes. Ledgerly reads and writes only the sheet you connect, and the connection is tied to your signed-in Google account — another account on the same phone never sees your sheet. No database, no tracking, no ads.",
    keywords: ["privacy", "private", "safe", "data", "secure", "who sees"],
  },
];

/**
 * Searchable help modal, opened from the ? button in the header or with
 * Ctrl/⌘+K. Each article can jump straight to the screen it describes.
 */
export function HelpModal({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (action: HelpAction) => void;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ARTICLES;
    return ARTICLES.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.body.toLowerCase().includes(q) ||
        a.keywords.some((k) => k.includes(q))
    );
  }, [query]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Help"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-card dark:bg-zinc-900 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold tracking-tight">Help</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help"
            className="rounded-full px-3 py-1 text-lg leading-none text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ×
          </button>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help…"
          autoFocus
          autoComplete="off"
          className="mt-3 w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-950"
        />
        <div className="mt-4 max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {results.length === 0 && (
            <p className="py-6 text-center text-sm text-zinc-500">
              Nothing matches “{query}”. Try fewer words.
            </p>
          )}
          {results.map((a) => (
            <article key={a.title} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h3 className="text-sm font-bold">{a.title}</h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{a.body}</p>
              {a.action && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigate(a.action!.act);
                  }}
                  className="mt-2 text-sm font-semibold text-accent-ink hover:underline"
                >
                  {a.action.label} →
                </button>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
