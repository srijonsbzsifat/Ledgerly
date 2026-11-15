"use client";

import { useState } from "react";
import type { SheetInfo } from "@/lib/types";

/** Prefilled suggestion only — never used as the data source itself. */
const SUGGESTED_SHEET_ID = "1KoI56BVMJMysQKyHZPhqoFfwZyOyVyUaI1cq7nUx9zQ";

export function SheetPicker({ onConnected }: { onConnected: (info: SheetInfo) => void }) {
  const [input, setInput] = useState(SUGGESTED_SHEET_ID);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not connect to that sheet.");
      // The caller (Dashboard) records the sheet under the signed-in
      // user's backup key — this component never touches storage itself.
      onConnected(data as SheetInfo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-2xl">
        📗
      </div>
      <h2 className="text-xl font-bold tracking-tight">Connect your sheet</h2>
      <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Paste the link (or ID) of a Google Sheet in the Cash 2026 format —
        monthly tabs named January–December, with columns ID, Date, Type,
        Category, Description, Amount and Currency. Your Cash 2026 sheet is
        prefilled below; paste a different link to use another sheet.
      </p>
      <label className="mt-5 block text-sm font-medium" htmlFor="sheet-input">
        Google Sheet link or ID
      </label>
      <input
        id="sheet-input"
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void connect();
        }}
        placeholder="https://docs.google.com/spreadsheets/d/…"
        className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-950"
      />
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => void connect()}
        disabled={busy || !input.trim()}
        className="mt-5 w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-accent-strong hover:shadow-card-hover disabled:opacity-50"
      >
        {busy ? "Connecting…" : "Connect sheet"}
      </button>
      <p className="mt-4 text-xs leading-relaxed text-zinc-500">
        The dashboard only reads the sheet you connect, with your own Google
        account. You can switch sheets any time from the dashboard header.
      </p>
    </div>
  );
}
