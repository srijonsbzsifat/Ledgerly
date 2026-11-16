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
  /** Column H: the account this entry belongs to (blank = the default account). */
  linkedAccount?: string;
  /** Column I: set on the two halves of a transfer, linking them together. */
  linkId?: string;
  /**
   * Where this entry lives in the sheet (month tab + 1-based row number),
   * so an edit can update the exact row in place. Present on rows read from
   * the sheet; absent on freshly appended rows (the list is reloaded after
   * a save, so the reloaded rows carry it).
   */
  tab?: string;
  row?: number;
}

/** One half of a transfer (money moved between the user's own accounts). */
export function isTransfer(t: Transaction): boolean {
  return !!(t.linkId && t.linkId.trim());
}

/** A category from the sheet's managed Categories list. */
export interface ManagedCategory {
  name: string;
  type: TxType;
  order: number;
}

/** An account from the sheet's managed Accounts list. */
export interface Account {
  name: string;
  type: string;
}

/** A deleted entry waiting in the Trash tab (30 days before it's gone for good). */
export interface TrashEntry extends Transaction {
  deletedAt: string; // YYYY-MM-DD
  trashRow: number;
}

/** A note from the sheet's Notes tab. */
export interface Note {
  id: string;
  created: string; // YYYY-MM-DD
  title: string;
  body: string;
  row?: number;
}

/**
 * A recurring payment the user marked (stored in the sheet's Recurring tab).
 * An active mark tells the pace math "this repeats every month" even before
 * the history proves it; a paused mark tells it "don't count or reserve
 * for this" even if the history says it recurs; a dismissed mark hides a
 * false positive (e.g. a one-off the detector mistook for a pattern) from
 * the detected list without counting it either.
 */
export interface MarkedPattern {
  category: string;
  description: string;
  /** Typical monthly amount. */
  amount: number;
  /** Typical day of the month (1-31). */
  day: number;
  status: "active" | "paused" | "dismissed";
}

/** The stable key for a category+description pair — the same key the pace
    classifier uses, so a mark always matches the entries it describes. */
export function patternKey(category: string, description: string): string {
  return description ? `${category} / ${description}` : category;
}

/** A monthly spending target (stored in the sheet's Budgets tab). */
export interface Budget {
  /** "YYYY-MM", e.g. "2026-11". */
  month: string;
  target: number;
}

/**
 * The target that applies to a month: the row for that month if one exists,
 * else the most recent row before it (targets carry forward until changed),
 * else null (the pace card falls back to income).
 */
export function effectiveTarget(
  budgets: Budget[],
  year: number,
  month: number // 1-12
): number | null {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  let best: Budget | null = null;
  for (const b of budgets) {
    if (b.month <= key && (!best || b.month > best.month)) best = b;
  }
  return best ? best.target : null;
}

/** The Overview sections the user can hide and reorder (R11). */
export type OverviewSectionId =
  | "scope"
  | "pace"
  | "insights"
  | "expected"
  | "quickadd"
  | "lists"
  | "calendar"
  | "accounts"
  | "charts";

export interface OverviewLayoutItem {
  id: OverviewSectionId;
  visible: boolean;
}

export const DEFAULT_OVERVIEW_LAYOUT: OverviewLayoutItem[] = [
  { id: "scope", visible: true },
  { id: "pace", visible: true },
  { id: "quickadd", visible: true },
  { id: "lists", visible: true },
  { id: "calendar", visible: true },
  { id: "insights", visible: true },
  { id: "expected", visible: true },
  { id: "accounts", visible: true },
  { id: "charts", visible: true },
];

/** The default order before 2026-11-16, when Insights + Expected sat
    above Quick add. Stored layouts that still follow it are migrated to
    the new order (visibility preserved); layouts the user reordered
    themselves are left alone. */
export const PREVIOUS_OVERVIEW_ORDER: OverviewSectionId[] = [
  "scope",
  "pace",
  "insights",
  "expected",
  "quickadd",
  "lists",
  "calendar",
  "accounts",
  "charts",
];

export const OVERVIEW_SECTION_LABELS: Record<OverviewSectionId, string> = {
  scope: "Month summary",
  pace: "Pace card",
  insights: "Insights",
  expected: "Expected this month",
  quickadd: "Quick add",
  lists: "Transactions & categories",
  calendar: "Calendar",
  accounts: "Accounts",
  charts: "Charts",
};

export const OVERVIEW_LAYOUT_STORAGE_KEY = "ledgerly-overview-layout";

/** The name transfers use as their category. Never offered as a pickable category. */
export const TRANSFER_CATEGORY = "Transfer";

/** The default account for entries with a blank Linked account column. */
export const DEFAULT_ACCOUNT_NAME = "Cash";

/** Default categories for a brand-new sheet (a sheet with entries is seeded from its own data instead). */
export const DEFAULT_CATEGORIES: ManagedCategory[] = [
  { name: "Food", type: "Debit", order: 0 },
  { name: "Groceries", type: "Debit", order: 1 },
  { name: "Transport", type: "Debit", order: 2 },
  { name: "Bills", type: "Debit", order: 3 },
  { name: "Apparel", type: "Debit", order: 4 },
  { name: "Health", type: "Debit", order: 5 },
  { name: "Shopping", type: "Debit", order: 6 },
  { name: "Gift", type: "Debit", order: 7 },
  { name: "Subscriptions", type: "Debit", order: 8 },
  { name: "Education", type: "Debit", order: 9 },
  { name: "Other", type: "Debit", order: 10 },
  { name: "Salary", type: "Credit", order: 0 },
  { name: "Freelance", type: "Credit", order: 1 },
  { name: "Other income", type: "Credit", order: 2 },
];

export interface SheetInfo {
  id: string;
  title: string;
  tabs: string[];
}

/** A sheet the user has connected — their own, or one shared with them. */
export interface ConnectedSheet {
  id: string;
  title: string;
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

export const SHEETS_LIST_STORAGE_KEY = "cash-sheets";

/**
 * Per-user localStorage key for the LIST of connected sheets (their own
 * plus any shared with them). Owner-scoped like the backup above: one
 * account's list is never readable under another account's key. The list
 * holds only sheet IDs and titles — the data itself is never stored.
 */
export function sheetListStorageKeyFor(email: string) {
  return `${SHEETS_LIST_STORAGE_KEY}:${email}`;
}

export type AccentName = "emerald" | "indigo";

export const ACCENTS: Record<
  AccentName,
  { label: string; swatch: string; chart: string; chartLight: string }
> = {
  emerald: {
    label: "Emerald",
    swatch: "#059669",
    chart: "#059669",
    chartLight: "#34d399",
  },
  indigo: {
    label: "Indigo",
    swatch: "#6366f1",
    chart: "#6366f1",
    chartLight: "#a5b4fc",
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
  // Lakh grouping, as used in Bangladesh: 107112 -> 1,07,112.
  return "৳" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/** Income / expense / balance totals for a set of transactions. Transfers
 *  (entries linked by a Link ID) are money moved between the user's own
 *  accounts, so they never count as income or spending. */
export function totalsOf(txs: Transaction[]) {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (isTransfer(t)) continue;
    if (t.type === "Credit") income += t.amount;
    else expense += t.amount;
  }
  return { income, expense, balance: income - expense };
}

/** Per-account balances. Transfers count here (out of one account, into
 *  another); entries with a blank account belong to the first account in
 *  the list (the default). Names not in the list (orphaned by a rename done
 *  in Sheets) appear as their own rows rather than vanishing. */
export function accountBalances(
  txs: Transaction[],
  accounts: Account[]
): { name: string; type: string; balance: number }[] {
  const defaultName = accounts[0]?.name ?? DEFAULT_ACCOUNT_NAME;
  const map = new Map<string, number>();
  for (const a of accounts) map.set(a.name, 0);
  for (const t of txs) {
    const name = (t.linkedAccount ?? "").trim() || defaultName;
    const delta = t.type === "Credit" ? t.amount : -t.amount;
    map.set(name, (map.get(name) ?? 0) + delta);
  }
  return [...map.entries()].map(([name, balance]) => ({
    name,
    type: accounts.find((a) => a.name === name)?.type ?? "Cash",
    balance,
  }));
}

/** The category to show in reports: the entry's own category when it is in
 *  the managed list, "Uncategorised" when it isn't. A null list means the
 *  list hasn't loaded — everything passes through unchanged. */
export function displayCategory(
  name: string,
  type: TxType,
  managed: ManagedCategory[] | null
): string {
  if (!managed) return name;
  return managed.some((c) => c.name === name && c.type === type)
    ? name
    : "Uncategorised";
}

/** Split a YYYY-MM-DD date into its parts, or null when it isn't one. */
export function parseISODate(date: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

export function monthIndexFromDate(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return month - 1;
}

/** Short human date for the transactions list: "15 Nov", with the year only when it isn't the current one. */
/** Compact amount for tight spaces (calendar cells): ৳60k, ৳1.46L, ৳100. */
export function formatBDTCompact(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 100000) {
    const lakh = parseFloat((amount / 100000).toFixed(2));
    return `৳${lakh}L`;
  }
  if (abs >= 1000) {
    const k = parseFloat((amount / 1000).toFixed(1));
    return `৳${k}k`;
  }
  return formatBDT(Math.round(amount));
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Sat, 14 Nov" — the day-group header for the Transactions list.
    Today's group reads "Today, 14 Nov". */
export function formatDayHeader(iso: string): string {
  const p = parseISODate(iso);
  if (!p) return iso;
  const now = new Date();
  const isToday =
    p.year === now.getFullYear() &&
    p.month === now.getMonth() + 1 &&
    p.day === now.getDate();
  const label = isToday
    ? "Today"
    : WEEKDAY_SHORT[new Date(p.year, p.month - 1, p.day).getDay()];
  return `${label}, ${formatDateShort(iso)}`;
}

export function formatDateShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return iso;
  const label = `${Number(m[3])} ${MONTH_SHORT[month - 1]}`;
  return year === new Date().getFullYear() ? label : `${label} ${year}`;
}
