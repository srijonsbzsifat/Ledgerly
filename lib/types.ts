export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export type TxType = "Debit" | "Credit";

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  type: TxType;
  category: string;
  description: string;
  amount: number;
  currency: string;
  /**
   * Where this entry lives in the sheet (month tab + 1-based row number),
   * so an edit can update the exact row in place. Present on rows read from
   * the sheet; absent on freshly appended rows (the list is reloaded after
   * a save, so the reloaded rows carry it).
   */
  tab?: string;
  row?: number;
}

export interface SheetInfo {
  id: string;
  title: string;
  tabs: string[];
}

/**
 * localStorage backup of the connected sheet's ID. The server reads the
 * sheet from an httpOnly cookie, but clearing browsing data wipes cookies —
 * this lets the app silently re-establish the cookie on next load instead
 * of asking the user to connect the sheet again.
 *
 * The backup is OWNER-SCOPED: use sheetStorageKeyFor(email), never the bare
 * key. The bare key is a legacy value from before scoping; it is removed on
 * sight and never read, so one signed-in account can never inherit another
 * account's sheet from this device.
 */
export const SHEET_ID_STORAGE_KEY = "cash-sheet-id";

/** Per-user localStorage key for the connected sheet's ID. */
export function sheetStorageKeyFor(email: string) {
  return `${SHEET_ID_STORAGE_KEY}:${email}`;
}

export type AccentName = "emerald" | "indigo" | "amber";

export const ACCENTS: Record<
  AccentName,
  { label: string; swatch: string; chart: string; chartLight: string }
> = {
  emerald: {
    label: "Emerald",
    swatch: "#10b981",
    chart: "#10b981",
    chartLight: "#6ee7b7",
  },
  indigo: {
    label: "Indigo",
    swatch: "#6366f1",
    chart: "#6366f1",
    chartLight: "#a5b4fc",
  },
  amber: {
    label: "Amber",
    swatch: "#f59e0b",
    chart: "#f59e0b",
    chartLight: "#fcd34d",
  },
};

/** Expense colour used in charts (constant across accents). */
export const EXPENSE_COLOR = "#f43f5e";
export const EXPENSE_COLOR_LIGHT = "#fda4af";

/** Category pie-chart palette. */
export const PIE_COLORS = [
  "#10b981",
  "#6366f1",
  "#f59e0b",
  "#f43f5e",
  "#06b6d4",
  "#a855f7",
  "#84cc16",
  "#f97316",
  "#14b8a6",
  "#eab308",
  "#ec4899",
  "#64748b",
];

export function formatBDT(n: number): string {
  return "৳" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function monthIndexFromDate(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return month - 1;
}

/** Short human date for the transactions list: "15 Nov", with the year only when it isn't the current one. */
export function formatDateShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return iso;
  const label = `${Number(m[3])} ${MONTH_SHORT[month - 1]}`;
  return year === new Date().getFullYear() ? label : `${label} ${year}`;
}
