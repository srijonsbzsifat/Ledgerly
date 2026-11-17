"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_ACCOUNT_NAME,
  DEFAULT_OVERVIEW_LAYOUT,
  MONTHS,
  MONTH_SHORT,
  OVERVIEW_LAYOUT_STORAGE_KEY,
  PREVIOUS_OVERVIEW_ORDER,
  SHEET_ID_STORAGE_KEY,
  accountBalances,
  displayCategory,
  formatBDT,
  formatDateShort,
  formatDayHeader,
  isTransfer,
  monthIndexFromDate,
  parseISODate,
  sheetListStorageKeyFor,
  sheetStorageKeyFor,
  totalsOf,
  type Account,
  type Budget,
  type ConnectedSheet,
  type ManagedCategory,
  type MarkedPattern,
  type OverviewLayoutItem,
  type OverviewSectionId,
  type SheetInfo,
  type Transaction,
  type TxType,
} from "@/lib/types";
import { AddTransactionModal } from "./AddTransactionModal";
import { BrandLoader } from "./BrandLoader";
import { BulkDeleteDialog } from "./BulkDeleteDialog";
import { CategoryDonut, MonthlyBarChart, type CategoryPoint, type MonthlyPoint } from "./Charts";
import { CategoryBars } from "./CategoryBars";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { HelpModal, type HelpAction } from "./HelpModal";
import { DeleteIcon, EditIcon, IconButton } from "./IconButton";
import { ExpectedList } from "./ExpectedList";
import { InsightsStrip } from "./InsightsStrip";
import { LogoLockup } from "./Logo";
import { ManageView, type ManageSection } from "./ManageView";
import { MonthCalendar } from "./MonthCalendar";
import { OverviewCustomiseModal } from "./OverviewCustomiseModal";
import { PaceCard } from "./PaceCard";
import { ProfileMenu } from "./ProfileMenu";
import { QuickAdd } from "./QuickAdd";
import { RecentList } from "./RecentList";
import { ReportsView } from "./ReportsView";
import { SheetPicker } from "./SheetPicker";
import { SheetSwitcher } from "./SheetSwitcher";
import { Sidebar, type SidebarId } from "./Sidebar";
import { TabMenu } from "./TabMenu";
import { Card, Spinner } from "./ui";

type MonthFilter = "all" | number;
type YearFilter = "all" | number;
type Tab = "overview" | "transactions" | "reports" | "manage";

interface Props {
  userName: string;
  userImage: string | null;
}

function Delta({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
  if (previous === 0) {
    if (current === 0) return <span className="text-xs text-zinc-400">no change</span>;
    return <span className="text-xs font-medium text-zinc-500">new this month</span>;
  }
  const pct = ((current - previous) / previous) * 100;
  const up = pct > 0.5;
  const down = pct < -0.5;
  if (!up && !down) return <span className="text-xs text-zinc-400">≈ same as last month</span>;
  const good = invert ? down : up;
  return (
    <span className={`text-xs font-medium ${good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}% vs last month
    </span>
  );
}

/** "Updating…" while a refresh is in flight, otherwise "Last synced HH:MM". */
function SyncPill({
  loading,
  hasData,
  lastSyncedAt,
}: {
  loading: boolean;
  hasData: boolean;
  lastSyncedAt: number | null;
}) {
  if (loading && hasData) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-ink">
        <Spinner className="h-3 w-3" />
        Updating…
      </span>
    );
  }
  if (!lastSyncedAt) return null;
  const time = new Date(lastSyncedAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
      ✓ Last synced {time}
    </span>
  );
}

/** Month and year selector dropdowns, shared by both tabs and kept in sync
    via props. A year selector sits next to the month selector: one sheet
    holds every year, so each year's month is viewed independently (January
    2026 vs January 2027), with "All years" keeping the combined view. */
function MonthSelector({
  monthFilter,
  onChange,
  yearFilter,
  years,
  onYearChange,
}: {
  monthFilter: MonthFilter;
  onChange: (m: MonthFilter) => void;
  yearFilter: YearFilter;
  years: number[];
  onYearChange: (y: YearFilter) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={yearFilter === "all" ? "all" : String(yearFilter)}
        onChange={(e) => {
          const v = e.target.value;
          onYearChange(v === "all" ? "all" : Number(v));
        }}
        aria-label="Filter by year"
        className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold outline-none transition focus:border-accent hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
      >
        {years.map((y) => (
          <option key={y} value={String(y)}>
            {y}
          </option>
        ))}
        <option value="all">All years</option>
      </select>
      <select
        value={monthFilter === "all" ? "all" : String(monthFilter)}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "all" ? "all" : Number(v));
        }}
        aria-label="Filter by month"
        className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold outline-none transition focus:border-accent hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
      >
        <option value="all">All months</option>
        {MONTHS.map((m, i) => (
          <option key={m} value={String(i)}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}


/** One entry row in the Transactions table (desktop). */
function TxRow({
  t,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
}: {
  t: Transaction;
  selected: boolean;
  onToggleSelect: (id: string, checked: boolean) => void;
  onEdit: (t: Transaction) => void;
  onDelete: (t: Transaction) => void;
}) {
  return (
    <tr className="border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50 dark:border-zinc-800/70 dark:hover:bg-zinc-800/50">
      <td className="py-2.5 pr-2">
        <input
          type="checkbox"
          aria-label={`Select ${t.description || t.category}`}
          checked={selected}
          onChange={(e) => onToggleSelect(t.id, e.target.checked)}
          className="h-4 w-4 accent-emerald-600"
        />
      </td>
      <td className="whitespace-nowrap py-2.5 pr-3 tabular-nums text-zinc-600 dark:text-zinc-400">
        {formatDateShort(t.date)}
      </td>
      <td className="py-2.5 pr-3 font-medium">
        {isTransfer(t) ? "⇄ " : ""}
        {t.category}
      </td>
      <td className="max-w-56 truncate py-2.5 pr-3 text-zinc-600 dark:text-zinc-400">
        {t.description || "—"}
      </td>
      <td
        className={`whitespace-nowrap py-2.5 text-right font-semibold tabular-nums ${
          t.type === "Credit"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-rose-600 dark:text-rose-400"
        }`}
      >
        {t.type === "Credit" ? "+" : "−"}
        {formatBDT(t.amount)}
      </td>
      <td className="py-2.5 pl-3">
        {t.tab && t.row ? (
          <span className="flex justify-end gap-1.5">
            <IconButton label="Edit" onClick={() => onEdit(t)}>
              <EditIcon />
            </IconButton>
            <IconButton label="Delete" tone="danger" onClick={() => onDelete(t)}>
              <DeleteIcon />
            </IconButton>
          </span>
        ) : null}
      </td>
    </tr>
  );
}

/** One entry card in the Transactions list (mobile). When grouped under a
    day header, the date drops out of the subtitle — the header owns it. */
function TxCard({
  t,
  grouped,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
}: {
  t: Transaction;
  grouped: boolean;
  selected: boolean;
  onToggleSelect: (id: string, checked: boolean) => void;
  onEdit: (t: Transaction) => void;
  onDelete: (t: Transaction) => void;
}) {
  const subtitle = grouped
    ? t.description
      ? t.category
      : null
    : t.description
      ? `${t.category} · ${formatDateShort(t.date)}`
      : formatDateShort(t.date);
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <input
        type="checkbox"
        aria-label={`Select ${t.description || t.category}`}
        checked={selected}
        onChange={(e) => onToggleSelect(t.id, e.target.checked)}
        className="mt-1.5 h-4 w-4 shrink-0 accent-emerald-600"
      />
      <div className="min-w-0 flex-1 pt-1">
        <p className="truncate font-medium">
          {isTransfer(t) ? "⇄ " : ""}
          {t.description || t.category}
        </p>
        {subtitle && (
          <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span
          className={`whitespace-nowrap pt-1 text-[15px] font-semibold tabular-nums ${
            t.type === "Credit"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          }`}
        >
          {t.type === "Credit" ? "+" : "−"}
          {formatBDT(t.amount)}
        </span>
        {t.tab && t.row ? (
          <span className="flex gap-1.5">
            <IconButton label="Edit" onClick={() => onEdit(t)}>
              <EditIcon />
            </IconButton>
            <IconButton label="Delete" tone="danger" onClick={() => onDelete(t)}>
              <DeleteIcon />
            </IconButton>
          </span>
        ) : null}
      </div>
    </li>
  );
}

export function Dashboard({ userName, userImage }: Props) {
  const [sheet, setSheet] = useState<SheetInfo | null>(null);
  const [sheetChecked, setSheetChecked] = useState(false);
  // A TRANSIENT sheet-check failure (Google rate limit / Google-side
  // hiccup): the sheet itself is fine, so the cookie and the remembered
  // sheet are kept and the user gets a retry card instead of the picker.
  const [sheetCheckError, setSheetCheckError] = useState<string | null>(null);
  const [sheetCheckAttempt, setSheetCheckAttempt] = useState(0);
  const [authExpired, setAuthExpired] = useState(false);
  const { data: session, status: sessionStatus } = useSession();
  const userEmail = session?.user?.email ?? null;
  // Every sheet this user has connected (their own + shared with them).
  // Stored per-user in localStorage; the server only ever knows the ACTIVE
  // sheet (via the owner-scoped cookie), so switching is just reconnecting
  // to another id the user already has access to.
  const [sheets, setSheets] = useState<ConnectedSheet[]>([]);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  // Null = Manage's list view; otherwise the open section.
  const [manageSection, setManageSection] = useState<ManageSection | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [monthFilter, setMonthFilter] = useState<MonthFilter>(() => new Date().getMonth());
  // One sheet holds every year, so the month scope needs a year too —
  // defaults to the current year; "all" keeps the combined view.
  const [yearFilter, setYearFilter] = useState<YearFilter>(() => new Date().getFullYear());
  const [typeFilter, setTypeFilter] = useState<"all" | TxType>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [categoryView, setCategoryView] = useState<TxType>("Debit");
  // Transactions pagination: 25 rows by default, up to 100.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);
  // Bulk selection in Transactions (transaction ids) + the entries awaiting
  // bulk-delete confirmation.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState<Transaction[] | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [sortKey, setSortKey] = useState<"date" | "amount">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // Managed lists from the sheet's Categories / Accounts / Recurring /
  // Budgets tabs. Null until loaded — pickers fall back to categories
  // derived from the entries, and the pace card runs on auto-detection
  // alone (and on income when no target is set).
  const [managedCategories, setManagedCategories] = useState<ManagedCategory[] | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [markedPatterns, setMarkedPatterns] = useState<MarkedPattern[] | null>(null);
  const [budgets, setBudgets] = useState<Budget[] | null>(null);

  // Overview layout (R11): which sections show, in which order. Stored in
  // localStorage on this device; a stored layout that is missing a section
  // (from an older version) gets it inserted at its default position.
  const [overviewLayout, setOverviewLayout] = useState<OverviewLayoutItem[]>(() => {
    try {
      const raw = window.localStorage.getItem(OVERVIEW_LAYOUT_STORAGE_KEY);
      if (!raw) return DEFAULT_OVERVIEW_LAYOUT;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return DEFAULT_OVERVIEW_LAYOUT;
      const known = new Set(DEFAULT_OVERVIEW_LAYOUT.map((s) => s.id));
      const kept: OverviewLayoutItem[] = (
        parsed as Array<Record<string, unknown>>
      )
        .filter(
          (s) =>
            typeof s === "object" &&
            s !== null &&
            known.has(s.id as OverviewSectionId) &&
            typeof s.visible === "boolean"
        )
        .map((s) => ({
          id: s.id as OverviewSectionId,
          visible: s.visible as boolean,
        }));
      // Insert any missing sections at their default position (before the
      // next default section that is present), instead of appending them
      // at the end — so a section added by an update lands where it
      // belongs in the default order.
      for (const d of DEFAULT_OVERVIEW_LAYOUT) {
        if (kept.some((s) => s.id === d.id)) continue;
        const dIdx = DEFAULT_OVERVIEW_LAYOUT.findIndex((x) => x.id === d.id);
        let insertAt = kept.length;
        for (let j = dIdx + 1; j < DEFAULT_OVERVIEW_LAYOUT.length; j++) {
          const pos = kept.findIndex(
            (s) => s.id === DEFAULT_OVERVIEW_LAYOUT[j].id
          );
          if (pos !== -1) {
            insertAt = pos;
            break;
          }
        }
        kept.splice(insertAt, 0, d);
      }
      // Migrate layouts that still follow the previous default order
      // (Insights + Expected above Quick add) to the new order — Insights
      // and Expected now sit below the Calendar. Visibility is preserved;
      // only the order changes. Layouts the user reordered themselves
      // don't match the old order, so they're left alone.
      if (
        kept.length === PREVIOUS_OVERVIEW_ORDER.length &&
        kept.every((s, i) => s.id === PREVIOUS_OVERVIEW_ORDER[i])
      ) {
        const byId = new Map(kept.map((s) => [s.id, s]));
        return DEFAULT_OVERVIEW_LAYOUT.map((d) => byId.get(d.id) ?? d);
      }
      return kept;
    } catch {
      return DEFAULT_OVERVIEW_LAYOUT;
    }
  });
  const [customiseOpen, setCustomiseOpen] = useState(false);

  function saveOverviewLayout(next: OverviewLayoutItem[]) {
    setOverviewLayout(next);
    try {
      window.localStorage.setItem(
        OVERVIEW_LAYOUT_STORAGE_KEY,
        JSON.stringify(next)
      );
    } catch {
      // Layout just won't persist on this device.
    }
  }

  /** CSS flex order + visibility for an Overview section (R11). */
  function sectionOrder(id: OverviewSectionId): number {
    const i = overviewLayout.findIndex((s) => s.id === id);
    return i === -1 ? 99 : i;
  }
  function sectionVisible(id: OverviewSectionId): boolean {
    return overviewLayout.find((s) => s.id === id)?.visible ?? true;
  }

  // When transactions were last loaded successfully — used to throttle
  // background refreshes so resume/focus events don't refetch in a burst.
  const lastLoadedAt = useRef(0);
  // Same timestamp as state, so the "Last synced" pill can render it.
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not load transactions.");
      setTransactions(data.transactions as Transaction[]);
      lastLoadedAt.current = Date.now();
      setLastSyncedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  /** Load the managed Categories + Accounts lists (created on first use). */
  const loadManagedLists = useCallback(async () => {
    try {
      const [catsRes, acctsRes, recurRes, budgetsRes] = await Promise.all([
        fetch("/api/categories", { cache: "no-store" }),
        fetch("/api/accounts", { cache: "no-store" }),
        fetch("/api/recurring", { cache: "no-store" }),
        fetch("/api/budgets", { cache: "no-store" }),
      ]);
      const catsData = await catsRes.json();
      const acctsData = await acctsRes.json();
      const recurData = await recurRes.json();
      const budgetsData = await budgetsRes.json();
      if (catsRes.ok && Array.isArray(catsData.categories)) {
        setManagedCategories(catsData.categories as ManagedCategory[]);
      }
      if (acctsRes.ok && Array.isArray(acctsData.accounts)) {
        setAccounts(acctsData.accounts as Account[]);
      }
      if (recurRes.ok && Array.isArray(recurData.patterns)) {
        setMarkedPatterns(recurData.patterns as MarkedPattern[]);
      }
      if (budgetsRes.ok && Array.isArray(budgetsData.budgets)) {
        setBudgets(budgetsData.budgets as Budget[]);
      }
    } catch {
      // Lists stay null and pickers fall back to derived categories.
    }
  }, []);

  /** This user's connected-sheet list, read from their own storage key. */
  function readSheetList(): ConnectedSheet[] {
    if (!userEmail) return [];
    try {
      const raw = window.localStorage.getItem(
        sheetListStorageKeyFor(userEmail)
      );
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (s): s is ConnectedSheet =>
          typeof s === "object" &&
          s !== null &&
          typeof (s as ConnectedSheet).id === "string" &&
          typeof (s as ConnectedSheet).title === "string"
      );
    } catch {
      return [];
    }
  }

  function writeSheetList(list: ConnectedSheet[]) {
    setSheets(list);
    if (!userEmail) return;
    window.localStorage.setItem(
      sheetListStorageKeyFor(userEmail),
      JSON.stringify(list)
    );
  }

  /** Add a sheet to the list, or refresh its title if it's already there. */
  function upsertSheet(info: SheetInfo) {
    const list = readSheetList();
    const idx = list.findIndex((s) => s.id === info.id);
    if (idx >= 0) list[idx] = { id: info.id, title: info.title };
    else list.push({ id: info.id, title: info.title });
    writeSheetList(list);
  }

  // Load this user's sheet list once their email is known.
  useEffect(() => {
    if (userEmail) setSheets(readSheetList());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail]);

  // On load: check whether a sheet is already connected (cookie).
  //
  // This waits for the session to finish loading first. Google access
  // tokens last 1 hour, and the session fetch is what refreshes an expired
  // one. Checking the sheet before that refresh lands reads the expired
  // token, fails, and wrongly shows the "connect a sheet" picker — exactly
  // what happened after the app sat closed for a couple of hours.
  //
  // The connection is OWNER-SCOPED: the server only honours a sheet cookie
  // owned by the signed-in user, and the localStorage backup below is read
  // only under this user's key. A different account signing in on this
  // device gets the picker, never the previous user's sheet.
  useEffect(() => {
    if (sessionStatus === "loading") return;
    let cancelled = false;
    // Legacy unscoped backup (pre-fix): remove it, never read it.
    window.localStorage.removeItem(SHEET_ID_STORAGE_KEY);
    (async () => {
      setSheetCheckError(null);
      try {
        const res = await fetch("/api/sheet", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (res.status === 401) {
          // Signed in, but the Google token can't be refreshed — the user
          // needs to sign in again, not reconnect the sheet.
          setAuthExpired(true);
          return;
        }
        if (res.status === 429 || res.status === 503) {
          // TRANSIENT — Google is rate-limiting us or having a hiccup.
          // The sheet and the cookie are fine; do NOT delete either (an
          // earlier version did, and a one-minute rate limit dropped the
          // whole connection). Show a retry card instead of the picker.
          setSheetCheckError(
            data?.error ??
              "Google Sheets is busy right now. Wait a moment and retry."
          );
          return;
        }
        if (res.status === 502) {
          // Stored sheet unreachable for this user — drop the stale cookie
          // so every load doesn't retry it, then fall through to the
          // reconnect attempt below.
          await fetch("/api/sheet", { method: "DELETE" });
        }
        if (res.ok && data?.connected) {
          upsertSheet(data as SheetInfo);
          setSheet(data as SheetInfo);
          return;
        }
        // No sheet cookie for this user. If THIS user has a remembered
        // sheet on this device, reconnect silently instead of asking them
        // to paste the link again. Never read another user's key.
        if (!userEmail) return;
        const storageKey = sheetStorageKeyFor(userEmail);
        const savedId = window.localStorage.getItem(storageKey);
        if (!savedId) return;
        const reconnect = await fetch("/api/sheet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: savedId }),
        });
        const reconnectData = await reconnect.json();
        if (cancelled) return;
        if (reconnect.status === 401) {
          setAuthExpired(true);
          return;
        }
        if (reconnect.status === 429 || reconnect.status === 503) {
          // Transient — keep the remembered sheet, offer a retry.
          setSheetCheckError(
            reconnectData?.error ??
              "Google Sheets is busy right now. Wait a moment and retry."
          );
          return;
        }
        if (reconnect.ok && reconnectData?.connected) {
          upsertSheet(reconnectData as SheetInfo);
          setSheet(reconnectData as SheetInfo);
        } else {
          // Saved sheet is no longer reachable — forget it, show the picker.
          window.localStorage.removeItem(storageKey);
        }
      } catch {
        // Network error — offer a retry instead of the picker; the sheet
        // and cookie are untouched, so retrying usually just works.
        setSheetCheckError(
          "Couldn't reach the server. Check your connection and retry."
        );
      } finally {
        if (!cancelled) setSheetChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionStatus, userEmail, sheetCheckAttempt]);

  useEffect(() => {
    if (sheet) {
      void loadTransactions();
      void loadManagedLists();
    }
  }, [sheet, loadTransactions, loadManagedLists]);

  // Ctrl/⌘+K opens help from anywhere on the dashboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setHelpOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // A filter change makes the old bulk selection stale — clear it — and
  // the old page number meaningless, so back to page 1.
  useEffect(() => {
    setSelected(new Set());
    setPage(1);
  }, [monthFilter, yearFilter, typeFilter, categoryFilter, search]);

  // Refresh whenever the app comes back into view. An installed PWA is
  // restored from memory when reopened, so without this the dashboard keeps
  // showing the data from when it was last opened — new entries added
  // elsewhere (chat, another device) never appear until a manual refresh.
  // Throttled to at most one refresh per 10s: visibilitychange and focus
  // usually fire together on resume.
  useEffect(() => {
    if (!sheet) return;
    const maybeRefresh = () => {
      if (document.hidden) return;
      if (Date.now() - lastLoadedAt.current < 10_000) return;
      void loadTransactions();
    };
    const onVisibility = () => {
      if (!document.hidden) maybeRefresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", maybeRefresh);
    window.addEventListener("online", maybeRefresh);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", maybeRefresh);
      window.removeEventListener("online", maybeRefresh);
    };
  }, [sheet, loadTransactions]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  /** Sheet just connected: remember it under THIS user's key, then show it. */
  function handleConnected(info: SheetInfo) {
    if (userEmail) {
      window.localStorage.setItem(sheetStorageKeyFor(userEmail), info.id);
    }
    upsertSheet(info);
    setSheet(info);
    setShowAddSheet(false);
  }

  /**
   * Switch to another connected sheet. Re-validates through /api/sheet, so
   * a sheet the user lost access to (partner unshared it) fails here with
   * a clear error instead of silently showing stale data. Returns false
   * when the switch did not happen.
   */
  async function switchSheet(id: string): Promise<boolean> {
    if (!sheet || id === sheet.id || switching) return id === sheet?.id;
    setSwitching(true);
    setError(null);
    try {
      const res = await fetch("/api/sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: id }),
      });
      const data = await res.json();
      if (res.status === 401) {
        setAuthExpired(true);
        return false;
      }
      if (!res.ok || !data?.connected) {
        throw new Error(data?.error ?? "Could not open that sheet.");
      }
      handleConnected(data as SheetInfo);
      setToast(`📗 Switched to ${data.title}.`);
      // Don't flash the old sheet's entries while the new ones load.
      setTransactions([]);
      setManagedCategories(null);
      setAccounts(null);
      setMarkedPatterns(null);
      setBudgets(null);
      setMonthFilter(new Date().getMonth());
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return false;
    } finally {
      setSwitching(false);
    }
  }

  /**
   * Remove a sheet from this user's list. Only unlinks it from Ledgerly —
   * the spreadsheet itself is untouched, and it can be connected again any
   * time. Removing the active sheet switches to another one if any remain;
   * removing the last one fully disconnects. If the switch fails (access
   * lost), the sheet stays connected.
   */
  async function removeSheet(id: string) {
    if (sheet && id === sheet.id) {
      const remaining = readSheetList().filter((s) => s.id !== id);
      if (remaining.length > 0) {
        const ok = await switchSheet(remaining[0].id);
        if (!ok) return;
      } else {
        await fetch("/api/sheet", { method: "DELETE" });
        window.localStorage.removeItem(SHEET_ID_STORAGE_KEY);
        if (userEmail)
          window.localStorage.removeItem(sheetStorageKeyFor(userEmail));
        setSheet(null);
        setTransactions([]);
        setManagedCategories(null);
        setAccounts(null);
        setMarkedPatterns(null);
        setBudgets(null);
        setMonthFilter(new Date().getMonth());
      }
    }
    writeSheetList(readSheetList().filter((s) => s.id !== id));
  }

  /** Disconnect the CURRENT sheet (other connected sheets stay listed). */
  async function disconnect() {
    if (sheet) await removeSheet(sheet.id);
  }

  /**
   * Sign out AND drop the sheet connection. The plain signOut() used to
   * leave the sheet cookie + backup behind, so the next account on this
   * device inherited the previous user's sheet.
   */
  async function handleSignOut() {
    try {
      await fetch("/api/sheet", { method: "DELETE" });
    } catch {
      // Cookie cleanup is best-effort; the server also refuses to honour
      // a cookie owned by a different user.
    }
    window.localStorage.removeItem(SHEET_ID_STORAGE_KEY);
    if (userEmail) window.localStorage.removeItem(sheetStorageKeyFor(userEmail));
    await signOut();
  }

  /** Delete the selected entries, in batches of 100 (the API's cap). */
  async function bulkDelete(entries: Transaction[]) {
    const withLocation = entries.filter((t) => t.tab && t.row);
    if (withLocation.length === 0) return;
    setBulkBusy(true);
    try {
      let deleted = 0;
      let failed = 0;
      for (let i = 0; i < withLocation.length; i += 100) {
        const chunk = withLocation.slice(i, i + 100);
        const res = await fetch("/api/transactions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entries: chunk.map((t) => ({
              id: t.id,
              tab: t.tab,
              row: t.row,
              originalDate: t.date,
              originalType: t.type,
              originalAmount: t.amount,
            })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Could not delete the entries.");
        deleted += data.deleted ?? 0;
        failed += data.failed?.length ?? 0;
      }
      setSelected(new Set());
      setBulkDeleting(null);
      setToast(
        failed > 0
          ? `🗑️ ${deleted} moved to Trash, ${failed} could not be deleted.`
          : `🗑️ ${deleted} entr${deleted === 1 ? "y" : "ies"} moved to Trash.`
      );
      void loadTransactions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBulkBusy(false);
    }
  }

  /** Main tab switch. Opening Manage always lands on its list view;
      help jumps set a section directly instead (handleHelpNavigate). */
  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
    if (tab === "manage") setManageSection(null);
  }

  /** Sidebar navigation (desktop). Notes jumps straight to Manage →
      Notes; the other items are plain tab switches. */
  function handleSidebarSelect(id: SidebarId) {
    if (id === "notes") {
      setActiveTab("manage");
      setManageSection("notes");
    } else {
      handleTabChange(id);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Jump to Manage → Accounts — the fix offered when Transfer is tapped
      with only one account. Closes the add modal first if it's open. */
  function goToAccounts() {
    setModalOpen(false);
    setEditingTx(null);
    setActiveTab("manage");
    setManageSection("accounts");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** A help article's "Take me there" jump. */
  function handleHelpNavigate(action: HelpAction) {
    if (action.kind === "add") {
      setEditingTx(null);
      setModalOpen(true);
      return;
    }
    setActiveTab(action.tab);
    if (action.tab === "manage" && action.section) {
      setManageSection(action.section);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Categories for the Transactions filter: the managed list in its order,
  // plus any category found on entries but not in the list (transfers
  // excluded — they aren't a pickable category). Falls back to the
  // categories found on entries while the list is still loading.
  const categories = useMemo(() => {
    if (!managedCategories) {
      const set = new Set<string>();
      for (const t of transactions) {
        if (!isTransfer(t)) set.add(t.category);
      }
      return [...set].sort((a, b) => a.localeCompare(b));
    }
    const ordered = [...managedCategories].sort((a, b) =>
      a.type === b.type ? a.order - b.order : a.type === "Debit" ? -1 : 1
    );
    const list = ordered.map((c) => c.name);
    const extra = new Set<string>();
    for (const t of transactions) {
      if (isTransfer(t)) continue;
      if (!managedCategories.some((c) => c.name === t.category && c.type === t.type)) {
        extra.add(t.category);
      }
    }
    return [...list, ...[...extra].sort((a, b) => a.localeCompare(b))];
  }, [managedCategories, transactions]);

  // Categories split by type, in managed order, for the quick-add and modal
  // dropdowns. Falls back to derived lists while the managed list loads.
  const expenseCategories = useMemo(() => {
    if (!managedCategories) {
      const set = new Set<string>();
      for (const t of transactions) if (t.type === "Debit" && !isTransfer(t)) set.add(t.category);
      return [...set].sort((a, b) => a.localeCompare(b));
    }
    return managedCategories
      .filter((c) => c.type === "Debit")
      .sort((a, b) => a.order - b.order)
      .map((c) => c.name);
  }, [managedCategories, transactions]);

  const incomeCategories = useMemo(() => {
    if (!managedCategories) {
      const set = new Set<string>();
      for (const t of transactions) if (t.type === "Credit" && !isTransfer(t)) set.add(t.category);
      return [...set].sort((a, b) => a.localeCompare(b));
    }
    return managedCategories
      .filter((c) => c.type === "Credit")
      .sort((a, b) => a.order - b.order)
      .map((c) => c.name);
  }, [managedCategories, transactions]);

  const accountNames = useMemo(
    () => (accounts?.length ? accounts.map((a) => a.name) : [DEFAULT_ACCOUNT_NAME]),
    [accounts]
  );

  const balances = useMemo(
    () =>
      accountBalances(
        transactions,
        accounts?.length ? accounts : [{ name: DEFAULT_ACCOUNT_NAME, type: "Cash" }]
      ),
    [transactions, accounts]
  );

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  // Years present in the sheet's entries, newest first — always including
  // the current year so it stays selectable on a fresh sheet.
  const years = useMemo(() => {
    const set = new Set<number>([currentYear]);
    for (const t of transactions) {
      const y = parseISODate(t.date)?.year;
      if (y) set.add(y);
    }
    return [...set].sort((a, b) => b - a);
  }, [transactions, currentYear]);

  // If the selected year has no entries in the active sheet (e.g. after
  // switching sheets), fall back to the current year instead of showing
  // an empty view with no obvious cause.
  const effectiveYear: YearFilter =
    yearFilter === "all" || years.includes(yearFilter) ? yearFilter : currentYear;

  // The month scope: the selected month of the selected year. "All months"
  // is the whole selected year; with "All years" it is everything.
  const scopedTx = useMemo(
    () =>
      transactions.filter((t) => {
        if (effectiveYear !== "all" && parseISODate(t.date)?.year !== effectiveYear)
          return false;
        if (monthFilter !== "all" && monthIndexFromDate(t.date) !== monthFilter)
          return false;
        return true;
      }),
    [transactions, monthFilter, effectiveYear]
  );

  const allTotals = useMemo(() => totalsOf(transactions), [transactions]);
  const scopeTotals = useMemo(() => totalsOf(scopedTx), [scopedTx]);

  // The scope cards' previous-month comparison, relative to the selected
  // month and year — January now compares against December of the previous
  // year instead of showing nothing.
  const prevMonthTotals = useMemo(() => {
    if (monthFilter === "all") return null;
    if (effectiveYear === "all") {
      if (monthFilter === 0) return null;
      return totalsOf(
        transactions.filter((t) => monthIndexFromDate(t.date) === monthFilter - 1)
      );
    }
    const prevMonth = monthFilter === 0 ? 11 : monthFilter - 1;
    const prevYear = monthFilter === 0 ? effectiveYear - 1 : effectiveYear;
    return totalsOf(
      transactions.filter((t) => {
        const p = parseISODate(t.date);
        return p?.year === prevYear && p.month - 1 === prevMonth;
      })
    );
  }, [transactions, monthFilter, effectiveYear]);

  // The Overview's monthly chart shows the selected year's months (all
  // years stacked together when "All years" is selected).
  const monthlySeries: MonthlyPoint[] = useMemo(() => {
    const byMonth = MONTHS.map((_, i) => ({ income: 0, expense: 0 }));
    for (const t of transactions) {
      if (isTransfer(t)) continue;
      const p = parseISODate(t.date);
      if (!p) continue;
      if (effectiveYear !== "all" && p.year !== effectiveYear) continue;
      const idx = p.month - 1;
      if (t.type === "Credit") byMonth[idx].income += t.amount;
      else byMonth[idx].expense += t.amount;
    }
    return byMonth.map((m, i) => ({ month: MONTH_SHORT[i], ...m }));
  }, [transactions, effectiveYear]);

  const categoryData: CategoryPoint[] = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of scopedTx) {
      if (t.type !== categoryView || isTransfer(t)) continue;
      const name = displayCategory(t.category, t.type, managedCategories);
      map.set(name, (map.get(name) ?? 0) + t.amount);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [scopedTx, categoryView, managedCategories]);

  // Expense categories for the selected month, for "Where it went" —
  // independent of the donut's Spending/Income toggle above.
  const expenseCategoryData: CategoryPoint[] = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of scopedTx) {
      if (t.type !== "Debit" || isTransfer(t)) continue;
      const name = displayCategory(t.category, t.type, managedCategories);
      map.set(name, (map.get(name) ?? 0) + t.amount);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [scopedTx, managedCategories]);

  const filteredTable = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = scopedTx.filter((t) => {
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (
        q &&
        !`${t.description} ${t.category} ${t.date}`.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) =>
      sortKey === "date"
        ? dir * a.date.localeCompare(b.date)
        : dir * (a.amount - b.amount)
    );
  }, [scopedTx, typeFilter, categoryFilter, search, sortKey, sortDir]);

  // Pagination over the filtered, sorted table. safePage clamps the page
  // after a delete or a reload shrinks the list below the current page.
  const totalPages = Math.max(1, Math.ceil(filteredTable.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageEntries = useMemo(
    () =>
      filteredTable.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredTable, safePage, pageSize]
  );

  // Day groups for the Transactions list: when sorted by date, the page's
  // entries are grouped under a header per day (date, count, day totals),
  // so a day's entries read as one block. When sorted by amount the list
  // stays flat — day grouping only makes sense in date order. A day split
  // across two pages gets a header on each page, with that page's entries.
  // Day totals skip transfers, like every other total in the app.
  const pageDayGroups = useMemo(() => {
    if (sortKey !== "date") return null;
    const groups: {
      date: string;
      entries: Transaction[];
      spent: number;
      income: number;
    }[] = [];
    for (const t of pageEntries) {
      const last = groups[groups.length - 1];
      if (last && last.date === t.date) {
        last.entries.push(t);
        if (!isTransfer(t)) {
          if (t.type === "Credit") last.income += t.amount;
          else last.spent += t.amount;
        }
      } else {
        groups.push({
          date: t.date,
          entries: [t],
          spent:
            !isTransfer(t) && t.type === "Debit" ? t.amount : 0,
          income:
            !isTransfer(t) && t.type === "Credit" ? t.amount : 0,
        });
      }
    }
    return groups;
  }, [pageEntries, sortKey]);

  const toggleSelect = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const openEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setModalOpen(true);
  };
  // Select-all covers the current page only; the selection itself survives
  // across pages, so entries can be picked on several pages, then deleted
  // together.
  const pageAllSelected =
    pageEntries.length > 0 && pageEntries.every((t) => selected.has(t.id));
  const pageSomeSelected = pageEntries.some((t) => selected.has(t.id));

  const selectedEntries = useMemo(
    () => transactions.filter((t) => selected.has(t.id)),
    [transactions, selected]
  );

  const monthLabel =
    (monthFilter === "all" ? "All months" : MONTHS[monthFilter]) +
    (effectiveYear === "all" ? "" : ` ${effectiveYear}`);

  // Newest first for the Overview's recent list (within a day, the most
  // recently added row first — the sheet appends chronologically, so the
  // reverse puts the newest row first before the stable date sort).
  const recentTx = useMemo(
    () =>
      [...scopedTx]
        .reverse()
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 8),
    [scopedTx]
  );

  // Today's transactions (R10) — the "did I already log that?" check. The
  // list only shows when the selected scope includes today.
  const todayStr = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);
  const todayTx = useMemo(
    () =>
      transactions
        .filter((t) => t.date === todayStr)
        .reverse(),
    [transactions, todayStr]
  );
  const todaySpent = useMemo(
    () =>
      todayTx.reduce(
        (sum, t) =>
          sum + (t.type === "Debit" && !isTransfer(t) ? t.amount : 0),
        0
      ),
    [todayTx]
  );
  const showToday =
    (monthFilter === "all" || monthFilter === currentMonth) &&
    (effectiveYear === "all" || effectiveYear === currentYear);

  // First load: no data yet, so show loading states instead of zeros.
  const initialLoading = loading && transactions.length === 0;

  return (
    <div className={sheet ? "min-h-screen lg:pl-64" : "min-h-screen"}>
      {sheet && (
        <Sidebar
          activeTab={activeTab}
          manageSection={manageSection}
          transactionCount={scopedTx.length}
          onSelect={handleSidebarSelect}
          onHelp={() => setHelpOpen(true)}
        />
      )}
      <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-zinc-50/80 backdrop-blur-md dark:border-zinc-800/70 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          {/* The sidebar carries the logo on desktop, so the header's copy
              hides there — but only while a sheet is connected (the
              sidebar only renders then). */}
          <span className={sheet ? "lg:hidden" : ""}>
            <LogoLockup />
          </span>
          {sheet && (
            <SheetSwitcher
              sheets={sheets}
              activeId={sheet.id}
              switching={switching}
              onSwitch={(id) => void switchSheet(id)}
              onRemove={(id) => void removeSheet(id)}
              onAdd={() => setShowAddSheet(true)}
            />
          )}
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {sheet && (
              <button
                type="button"
                onClick={() => {
                  setEditingTx(null);
                  setModalOpen(true);
                }}
                className="hidden items-center gap-1 whitespace-nowrap rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-accent-strong hover:shadow-card-hover sm:inline-flex"
              >
                + Add entry
              </button>
            )}
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-label="Help"
              title="Help (Ctrl+K)"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-sm font-bold text-zinc-600 shadow-card transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              ?
            </button>
            <ProfileMenu
              userName={userName}
              userImage={userImage}
              userEmail={userEmail}
              sheetConnected={!!sheet}
              onDisconnect={() => void disconnect()}
              onSignOut={() => void handleSignOut()}
            />
          </div>
        </div>
        {/* Tab navigation lives in the sticky header — pills on desktop, a
            burger menu on mobile — so it's always reachable without
            scrolling back to the top. On a wide screen the sidebar is
            the navigation instead, so this row hides there. */}
        {sheet && (
          <div className="mx-auto max-w-6xl px-4 pb-3 sm:px-6 lg:hidden">
            <TabMenu
              activeTab={activeTab}
              onChange={handleTabChange}
              transactionCount={scopedTx.length}
            />
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
        {!sheetChecked ? (
          <BrandLoader />
        ) : authExpired ? (
          <div className="flex min-h-[60vh] items-center justify-center py-10">
            <div className="mx-auto w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-6 text-center shadow-card dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-2xl">
                🔑
              </div>
              <h2 className="text-xl font-bold tracking-tight">Session expired</h2>
              <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                Your Google sign-in ran out — the dashboard can&apos;t reach
                your sheet until you sign in again. Your sheet stays
                connected, so you won&apos;t need to paste the link again.
              </p>
              <button
                type="button"
                onClick={() => void signIn("google")}
                className="mt-5 w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-accent-strong"
              >
                Sign in with Google
              </button>
            </div>
          </div>
        ) : sheetCheckError ? (
          <div className="flex min-h-[60vh] items-center justify-center py-10">
            <div className="mx-auto w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-6 text-center shadow-card dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-2xl">
                ⏳
              </div>
              <h2 className="text-xl font-bold tracking-tight">Google Sheets is busy</h2>
              <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {sheetCheckError}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                Your sheet stays connected — nothing was lost. Give it a
                moment, then retry.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSheetCheckError(null);
                  setSheetChecked(false);
                  setSheetCheckAttempt((a) => a + 1);
                }}
                className="mt-5 w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-accent-strong"
              >
                Retry
              </button>
            </div>
          </div>
        ) : !sheet ? (
          <div className="flex min-h-[60vh] items-center justify-center py-10">
            <SheetPicker onConnected={handleConnected} />
          </div>
        ) : initialLoading ? (
          // First data load (or a sheet switch): the branded loader
          // covers the whole content area instead of the per-section
          // skeleton blocks, which never read as "loading" at all.
          <BrandLoader />
        ) : (
          <>
            {toast && (
              <div className="mb-4 rounded-2xl bg-accent-soft px-4 py-3 text-sm font-medium text-accent-ink">
                {toast}
              </div>
            )}
            {error && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => void loadTransactions()}
                  className="rounded-full bg-red-100 px-3 py-1 font-semibold transition hover:bg-red-200 dark:bg-red-900 dark:hover:bg-red-800"
                >
                  Retry
                </button>
              </div>
            )}

            {activeTab === "overview" ? (
              <>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
                    Overview
                  </h1>
                  <SyncPill loading={loading} hasData={transactions.length > 0} lastSyncedAt={lastSyncedAt} />
                  <button
                    type="button"
                    onClick={() => setCustomiseOpen(true)}
                    className="ml-auto rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-600 shadow-card transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    ⚙️ Customise
                  </button>
                </div>

                {/* Balance strip (R8): the all-time totals, demoted from the
                    big hero — the pace card below is the prominent figure
                    now, and the scope cards carry the vs-last-month deltas. */}
                {initialLoading ? (
                  <div className="mt-4 h-16 animate-pulse rounded-3xl bg-zinc-200/70 dark:bg-zinc-800/70" />
                ) : (
                <section className="mt-4 flex flex-wrap items-baseline gap-x-8 gap-y-1 rounded-3xl border border-zinc-200 bg-white px-6 py-4 shadow-card dark:border-zinc-800 dark:bg-zinc-900">
                  <span>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      Total balance ·{" "}
                    </span>
                    <span className="text-xl font-extrabold tracking-tight tabular-nums">
                      {formatBDT(allTotals.balance)}
                    </span>
                  </span>
                  <span className="text-sm">
                    <span className="text-zinc-500 dark:text-zinc-400">
                      Income ·{" "}
                    </span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatBDT(allTotals.income)}
                    </span>
                  </span>
                  <span className="text-sm">
                    <span className="text-zinc-500 dark:text-zinc-400">
                      Expenses ·{" "}
                    </span>
                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                      {formatBDT(allTotals.expense)}
                    </span>
                  </span>
                </section>
                )}

                {/* Month selector */}
                <div className="mt-6">
                  <MonthSelector monthFilter={monthFilter} onChange={setMonthFilter} yearFilter={effectiveYear} years={years} onYearChange={setYearFilter} />
                </div>

                {/* Overview sections (R11): a flex column whose children
                    carry their order from the user's layout, so hiding and
                    reordering is a style change, not a JSX move. */}
                <div className="flex flex-col">
                {/* Scope summary cards */}
                {sectionVisible("scope") && (
                <div style={{ order: sectionOrder("scope") }}>
                {initialLoading ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-28 animate-pulse rounded-3xl bg-zinc-200/70 dark:bg-zinc-800/70"
                      />
                    ))}
                  </div>
                ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <Card>
                    <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                      {monthLabel} · Income
                    </p>
                    <p className="mt-1 text-2xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">
                      {formatBDT(scopeTotals.income)}
                    </p>
                    <div className="mt-1">
                      {prevMonthTotals ? (
                        <Delta current={scopeTotals.income} previous={prevMonthTotals.income} />
                      ) : (
                        <span className="text-xs text-zinc-400">
                          {monthFilter === "all" ? "Across all months" : "No earlier month to compare"}
                        </span>
                      )}
                    </div>
                  </Card>
                  <Card>
                    <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                      {monthLabel} · Expenses
                    </p>
                    <p className="mt-1 text-2xl font-extrabold tracking-tight text-rose-600 dark:text-rose-400">
                      {formatBDT(scopeTotals.expense)}
                    </p>
                    <div className="mt-1">
                      {prevMonthTotals ? (
                        <Delta current={scopeTotals.expense} previous={prevMonthTotals.expense} invert />
                      ) : (
                        <span className="text-xs text-zinc-400">
                          {monthFilter === "all" ? "Across all months" : "No earlier month to compare"}
                        </span>
                      )}
                    </div>
                  </Card>
                  <Card>
                    <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                      {monthLabel} · Balance
                    </p>
                    <p className="mt-1 text-2xl font-extrabold tracking-tight">
                      {formatBDT(scopeTotals.balance)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {scopedTx.length} transaction{scopedTx.length === 1 ? "" : "s"}
                    </p>
                  </Card>
                </div>
                )}
                </div>
                )}

                {!initialLoading && (
                  <>
                    {/* Pace card (R1–R4): only for a single selected month —
                        pace is a single-month concept, so it hides for "All
                        months" / "All years". */}
                    {monthFilter !== "all" &&
                      effectiveYear !== "all" &&
                      transactions.length > 0 &&
                      sectionVisible("pace") && (
                        <div style={{ order: sectionOrder("pace") }}>
                          <PaceCard
                            transactions={transactions}
                            year={effectiveYear}
                            month={monthFilter + 1}
                            marked={markedPatterns ?? []}
                            budgets={budgets ?? []}
                            onBudgetsChanged={setBudgets}
                          />
                        </div>
                      )}

                    {/* Insights strip (R7): top spending + unusual flags —
                        a single-month concept like the pace card. */}
                    {monthFilter !== "all" &&
                      effectiveYear !== "all" &&
                      transactions.length > 0 &&
                      sectionVisible("insights") && (
                        <div style={{ order: sectionOrder("insights") }}>
                          <InsightsStrip
                            transactions={transactions}
                            year={effectiveYear}
                            month={monthFilter + 1}
                          />
                        </div>
                      )}

                    {/* Expected this month (R12): the recurring payments
                        still to come — the same fixed set the pace card
                        reserves for. */}
                    {monthFilter !== "all" &&
                      effectiveYear !== "all" &&
                      transactions.length > 0 &&
                      sectionVisible("expected") && (
                        <div style={{ order: sectionOrder("expected") }}>
                          <ExpectedList
                            transactions={transactions}
                            year={effectiveYear}
                            month={monthFilter + 1}
                            marked={markedPatterns ?? []}
                            onManage={() => {
                              setManageSection("recurring");
                              setActiveTab("manage");
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          />
                        </div>
                      )}

                    {/* Quick add (R6): first interactive element, right under
                        the pace hero instead of 6th on the page. */}
                    {sectionVisible("quickadd") && (
                    <div style={{ order: sectionOrder("quickadd") }}>
                    <Card className="mt-4">
                      <h2 className="text-base font-bold tracking-tight">Quick add</h2>
                      <div className="mt-3">
                        <QuickAdd
                          expenseCategories={expenseCategories}
                          incomeCategories={incomeCategories}
                          accounts={accountNames}
                          transactions={transactions}
                          onSaved={() => {
                            setToast("✅ Entry saved to your sheet.");
                            void loadTransactions();
                          }}
                          onManageAccounts={goToAccounts}
                        />
                      </div>
                    </Card>
                    </div>
                    )}

                    {/* Today + recent transactions + where it went */}
                    {sectionVisible("lists") && (
                    <div style={{ order: sectionOrder("lists") }}>
                    <div className="mt-4 grid gap-4 lg:grid-cols-5">
                      <Card className="lg:col-span-3">
                        {showToday && (
                          <>
                            <h2 className="text-base font-bold tracking-tight">
                              Today
                              {todaySpent > 0 && (
                                <span className="ml-2 text-sm font-semibold text-rose-600 dark:text-rose-400">
                                  {formatBDT(todaySpent)}
                                </span>
                              )}
                            </h2>
                            <div className="mt-2">
                              <RecentList
                                transactions={todayTx}
                                total={todayTx.length}
                                monthLabel="Today"
                                emptyText="Nothing logged today yet."
                                onEdit={(t) => {
                                  setEditingTx(t);
                                  setModalOpen(true);
                                }}
                                onDelete={(t) => setDeletingTx(t)}
                              />
                            </div>
                          </>
                        )}
                        <h2
                          className={`${showToday ? "mt-6" : ""} text-base font-bold tracking-tight`}
                        >
                          Recent transactions · {monthLabel}
                        </h2>
                        <div className="mt-2">
                          <RecentList
                            transactions={recentTx}
                            total={scopedTx.length}
                            monthLabel={monthLabel}
                            groupByDay
                            onEdit={(t) => {
                              setEditingTx(t);
                              setModalOpen(true);
                            }}
                            onDelete={(t) => setDeletingTx(t)}
                            onShowAll={() => {
                              setActiveTab("transactions");
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          />
                        </div>
                      </Card>
                      <Card className="lg:col-span-2">
                        <h2 className="text-base font-bold tracking-tight">
                          {monthFilter === "all" ? "Where it went" : `Where ${monthLabel} went`}
                        </h2>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          By category, {monthLabel.toLowerCase()}
                        </p>
                        <div className="mt-4">
                          <CategoryBars data={expenseCategoryData} />
                        </div>
                      </Card>
                    </div>
                    </div>
                    )}

                    {/* Calendar (R13): the selected month as a heatmap —
                        a single-month concept like the pace card. */}
                    {monthFilter !== "all" &&
                      effectiveYear !== "all" &&
                      transactions.length > 0 &&
                      sectionVisible("calendar") && (
                        <div style={{ order: sectionOrder("calendar") }}>
                          <MonthCalendar
                            transactions={transactions}
                            year={effectiveYear}
                            month={monthFilter + 1}
                            onEdit={(t) => {
                              setEditingTx(t);
                              setModalOpen(true);
                            }}
                            onDelete={(t) => setDeletingTx(t)}
                          />
                        </div>
                      )}

                    {/* Accounts: each account's balance, with a way to manage them. */}
                    {sectionVisible("accounts") && (
                    <div style={{ order: sectionOrder("accounts") }}>
                    <Card className="mt-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-base font-bold tracking-tight">Accounts</h2>
                        <button
                          type="button"
                          onClick={() => {
                            setManageSection("accounts");
                            setActiveTab("manage");
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="text-sm font-semibold text-accent-ink hover:underline"
                        >
                          Manage →
                        </button>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {balances.map((b) => (
                          <div
                            key={b.name}
                            className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/50"
                          >
                            <p className="truncate text-sm font-medium">
                              {b.name}
                              <span className="ml-2 text-xs font-normal text-zinc-500">
                                {b.type}
                              </span>
                            </p>
                            <p
                              className={`mt-1 text-lg font-extrabold tracking-tight tabular-nums ${
                                b.balance >= 0
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-rose-600 dark:text-rose-400"
                              }`}
                            >
                              {formatBDT(b.balance)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </Card>
                    </div>
                    )}
                  </>
                )}

                {sectionVisible("charts") && (
                <div style={{ order: sectionOrder("charts") }}>
                {initialLoading ? (
                  <div className="mt-4 space-y-4">
                    <div className="h-80 animate-pulse rounded-3xl bg-zinc-200/70 dark:bg-zinc-800/70" />
                    <div className="h-64 animate-pulse rounded-3xl bg-zinc-200/70 dark:bg-zinc-800/70" />
                  </div>
                ) : transactions.length === 0 && !error ? (
                  <Card className="mt-4 text-center">
                    <p className="text-4xl">🗒️</p>
                    <h2 className="mt-3 text-lg font-bold">No transactions yet</h2>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">
                      This sheet has no rows in its monthly tabs yet. Add your
                      first entry and it will appear here.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTx(null);
                        setModalOpen(true);
                      }}
                      className="mt-5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-accent-strong"
                    >
                      + Add your first entry
                    </button>
                  </Card>
                ) : (
                  <>
                    {/* Charts */}
                    <h2 className="mt-8 text-lg font-bold tracking-tight">Charts</h2>
                    <div className="mt-3 grid gap-4 lg:grid-cols-5">
                      <Card className="lg:col-span-3">
                        <h3 className="text-base font-bold tracking-tight">
                          Income vs expenses by month
                        </h3>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          Full year, all months
                        </p>
                        <div className="mt-4">
                          <MonthlyBarChart data={monthlySeries} />
                        </div>
                      </Card>
                      <Card className="lg:col-span-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="text-base font-bold tracking-tight">
                              {categoryView === "Debit" ? "Spending" : "Income"} by category
                            </h3>
                            <p className="mt-0.5 text-xs text-zinc-500">{monthLabel}</p>
                          </div>
                          <div className="flex rounded-full bg-zinc-100 p-0.5 text-xs font-semibold dark:bg-zinc-800">
                            {(
                              [
                                { value: "Debit", label: "Spending" },
                                { value: "Credit", label: "Income" },
                              ] as const
                            ).map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => setCategoryView(opt.value)}
                                aria-pressed={categoryView === opt.value}
                                className={`rounded-full px-3 py-1.5 transition ${
                                  categoryView === opt.value
                                    ? "bg-white shadow-card dark:bg-zinc-900"
                                    : "text-zinc-500"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="mt-4">
                          {categoryData.length === 0 ? (
                            <p className="py-16 text-center text-sm text-zinc-500">
                              No {categoryView === "Debit" ? "spending" : "income"} in {monthLabel.toLowerCase()}.
                            </p>
                          ) : (
                            <CategoryDonut data={categoryData} />
                          )}
                        </div>
                      </Card>
                    </div>
                  </>
                )}
                </div>
                )}
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
                  <span>
                    Connected sheet: <span className="font-medium text-zinc-700 dark:text-zinc-300">{sheet.title}</span>
                    {sheet.tabs.length > 0 && ` · ${sheet.tabs.length} tab${sheet.tabs.length === 1 ? "" : "s"}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => void disconnect()}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 font-medium transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                  >
                    Change / disconnect sheet
                  </button>
                </div>
              </>
            ) : activeTab === "transactions" ? (
              <>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
                    Transactions
                  </h1>
                  <SyncPill loading={loading} hasData={transactions.length > 0} lastSyncedAt={lastSyncedAt} />
                </div>

                {/* Month selector (synced with Overview) */}
                <div className="mt-4">
                  <MonthSelector monthFilter={monthFilter} onChange={setMonthFilter} yearFilter={effectiveYear} years={years} onYearChange={setYearFilter} />
                </div>

                {initialLoading ? (
                  <div className="mt-4 flex h-96 flex-col items-center justify-center gap-3 rounded-3xl bg-zinc-200/70 text-sm font-medium text-zinc-500 dark:bg-zinc-800/70 dark:text-zinc-400">
                    <Spinner className="h-6 w-6 text-accent" />
                    Loading your data…
                  </div>
                ) : (
                  <Card className="mt-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-base font-bold tracking-tight">
                        Transactions · {monthLabel}
                      </h2>
                      <button
                        type="button"
                        onClick={() => void loadTransactions()}
                        disabled={loading}
                        className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        {loading ? "Refreshing…" : "↻ Refresh"}
                      </button>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search description or category…"
                        className="rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-950"
                      />
                      <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value as "all" | TxType)}
                        aria-label="Filter by type"
                        className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-accent dark:border-zinc-700 dark:bg-zinc-950"
                      >
                        <option value="all">All types</option>
                        <option value="Debit">Expenses only</option>
                        <option value="Credit">Income only</option>
                      </select>
                      <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        aria-label="Filter by category"
                        className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-accent dark:border-zinc-700 dark:bg-zinc-950"
                      >
                        <option value="all">All categories</option>
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <select
                        value={`${sortKey}-${sortDir}`}
                        onChange={(e) => {
                          const [k, d] = e.target.value.split("-") as [
                            "date" | "amount",
                            "asc" | "desc",
                          ];
                          setSortKey(k);
                          setSortDir(d);
                        }}
                        aria-label="Sort transactions"
                        className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-accent dark:border-zinc-700 dark:bg-zinc-950"
                      >
                        <option value="date-desc">Newest first</option>
                        <option value="date-asc">Oldest first</option>
                        <option value="amount-desc">Amount: high to low</option>
                        <option value="amount-asc">Amount: low to high</option>
                      </select>
                    </div>

                    {selected.size > 0 && (
                      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-accent-soft px-4 py-2.5 text-sm font-medium text-accent-ink">
                        <span>
                          {selected.size} selected
                        </span>
                        <button
                          type="button"
                          onClick={() => setBulkDeleting(selectedEntries)}
                          className="rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-rose-700"
                        >
                          🗑️ Delete selected
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelected(new Set())}
                          className="text-xs font-semibold underline"
                        >
                          Clear
                        </button>
                      </div>
                    )}

                    {filteredTable.length === 0 ? (
                      <p className="py-12 text-center text-sm text-zinc-500">
                        {scopedTx.length === 0
                          ? `No transactions in ${monthLabel.toLowerCase()}.`
                          : "No transactions match these filters."}
                      </p>
                    ) : (
                      <>
                        {/* Desktop table. No Type column: the amount's colour
                            (+ green / − red) already says income vs expense. */}
                        <div className="scrollbar-thin -mx-5 mt-4 hidden overflow-x-auto px-5 sm:-mx-6 sm:block sm:px-6">
                          <table className="w-full min-w-[560px] text-sm">
                            <thead>
                              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                                <th className="py-2.5 pr-2">
                                  <input
                                    type="checkbox"
                                    aria-label="Select all on this page"
                                    checked={pageAllSelected}
                                    ref={(el) => {
                                      if (el) el.indeterminate = !pageAllSelected && pageSomeSelected;
                                    }}
                                    onChange={(e) => {
                                      setSelected((prev) => {
                                        const next = new Set(prev);
                                        if (e.target.checked) {
                                          for (const t of pageEntries) next.add(t.id);
                                        } else {
                                          for (const t of pageEntries) next.delete(t.id);
                                        }
                                        return next;
                                      });
                                    }}
                                    className="h-4 w-4 accent-emerald-600"
                                  />
                                </th>
                                <th className="py-2.5 pr-3 font-semibold">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (sortKey === "date") {
                                        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
                                      } else {
                                        setSortKey("date");
                                        setSortDir("desc");
                                      }
                                    }}
                                    className="uppercase tracking-wide"
                                  >
                                    Date {sortKey === "date" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                                  </button>
                                </th>
                                <th className="py-2.5 pr-3 font-semibold">Category</th>
                                <th className="py-2.5 pr-3 font-semibold">Description</th>
                                <th className="py-2.5 text-right font-semibold">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (sortKey === "amount") {
                                        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
                                      } else {
                                        setSortKey("amount");
                                        setSortDir("desc");
                                      }
                                    }}
                                    className="uppercase tracking-wide"
                                  >
                                    Amount {sortKey === "amount" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                                  </button>
                                </th>
                                <th className="py-2.5 pl-3 text-right font-semibold">
                                  <span className="sr-only">Actions</span>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {pageDayGroups
                                ? pageDayGroups.map((g) => (
                                    <Fragment key={g.date}>
                                      <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/60">
                                        <td colSpan={6} className="py-2">
                                          <div className="flex flex-wrap items-baseline gap-x-3">
                                            <span className="text-sm font-bold">
                                              {formatDayHeader(g.date)}
                                            </span>
                                            <span className="text-xs text-zinc-500">
                                              {g.entries.length}{" "}
                                              {g.entries.length === 1 ? "entry" : "entries"}
                                            </span>
                                            {g.spent > 0 && (
                                              <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                                                −{formatBDT(Math.round(g.spent))} spent
                                              </span>
                                            )}
                                            {g.income > 0 && (
                                              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                                +{formatBDT(Math.round(g.income))}
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                      {g.entries.map((t) => (
                                        <TxRow
                                          key={t.id}
                                          t={t}
                                          selected={selected.has(t.id)}
                                          onToggleSelect={toggleSelect}
                                          onEdit={openEdit}
                                          onDelete={setDeletingTx}
                                        />
                                      ))}
                                    </Fragment>
                                  ))
                                : pageEntries.map((t) => (
                                    <TxRow
                                      key={t.id}
                                      t={t}
                                      selected={selected.has(t.id)}
                                      onToggleSelect={toggleSelect}
                                      onEdit={openEdit}
                                      onDelete={setDeletingTx}
                                    />
                                  ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile cards: everything fits the screen width, so
                            the amount is visible without swiping sideways. */}
                        {pageDayGroups ? (
                          <div className="mt-2 space-y-3 sm:hidden">
                            {pageDayGroups.map((g) => (
                              <section
                                key={g.date}
                                className="rounded-2xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/20"
                              >
                                <div className="flex flex-wrap items-baseline gap-x-3 border-b border-zinc-200/70 pb-2 dark:border-zinc-800">
                                  <span className="text-sm font-bold">
                                    {formatDayHeader(g.date)}
                                  </span>
                                  <span className="text-xs text-zinc-500">
                                    {g.entries.length}{" "}
                                    {g.entries.length === 1 ? "entry" : "entries"}
                                  </span>
                                  {g.spent > 0 && (
                                    <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                                      −{formatBDT(Math.round(g.spent))} spent
                                    </span>
                                  )}
                                  {g.income > 0 && (
                                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                      +{formatBDT(Math.round(g.income))}
                                    </span>
                                  )}
                                </div>
                                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                                  {g.entries.map((t) => (
                                    <TxCard
                                      key={t.id}
                                      t={t}
                                      grouped
                                      selected={selected.has(t.id)}
                                      onToggleSelect={toggleSelect}
                                      onEdit={openEdit}
                                      onDelete={setDeletingTx}
                                    />
                                  ))}
                                </ul>
                              </section>
                            ))}
                          </div>
                        ) : (
                          <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800/70 sm:hidden">
                            {pageEntries.map((t) => (
                              <TxCard
                                key={t.id}
                                t={t}
                                grouped={false}
                                selected={selected.has(t.id)}
                                onToggleSelect={toggleSelect}
                                onEdit={openEdit}
                                onDelete={setDeletingTx}
                              />
                            ))}
                          </ul>
                        )}
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
                          <span>
                            Showing{" "}
                            {filteredTable.length === 0
                              ? 0
                              : (safePage - 1) * pageSize + 1}
                            –{Math.min(safePage * pageSize, filteredTable.length)} of{" "}
                            {filteredTable.length}
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="flex items-center gap-1.5">
                              Rows
                              <select
                                value={pageSize}
                                onChange={(e) => {
                                  setPageSize(Number(e.target.value));
                                  setPage(1);
                                }}
                                aria-label="Rows per page"
                                className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-medium text-zinc-700 outline-none transition focus:border-accent dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                              >
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                              </select>
                            </label>
                            <button
                              type="button"
                              disabled={safePage <= 1}
                              onClick={() => setPage((p) => Math.max(1, p - 1))}
                              className="rounded-full border border-zinc-200 px-3 py-1.5 font-medium transition hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
                            >
                              ‹ Prev
                            </button>
                            <span className="tabular-nums">
                              Page {safePage} of {totalPages}
                            </span>
                            <button
                              type="button"
                              disabled={safePage >= totalPages}
                              onClick={() =>
                                setPage((p) => Math.min(totalPages, p + 1))
                              }
                              className="rounded-full border border-zinc-200 px-3 py-1.5 font-medium transition hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
                            >
                              Next ›
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </Card>
                )}
              </>
            ) : activeTab === "reports" ? (
              <>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
                    Reports
                  </h1>
                  <SyncPill loading={loading} hasData={transactions.length > 0} lastSyncedAt={lastSyncedAt} />
                </div>
                {initialLoading ? (
                  <div className="mt-4 flex h-96 flex-col items-center justify-center gap-3 rounded-3xl bg-zinc-200/70 text-sm font-medium text-zinc-500 dark:bg-zinc-800/70 dark:text-zinc-400">
                    <Spinner className="h-6 w-6 text-accent" />
                    Loading your data…
                  </div>
                ) : (
                  <ReportsView transactions={transactions} managedCategories={managedCategories} />
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
                    Manage
                  </h1>
                  <SyncPill loading={loading} hasData={transactions.length > 0} lastSyncedAt={lastSyncedAt} />
                </div>
                {initialLoading ? (
                  <div className="mt-4 flex h-96 flex-col items-center justify-center gap-3 rounded-3xl bg-zinc-200/70 text-sm font-medium text-zinc-500 dark:bg-zinc-800/70 dark:text-zinc-400">
                    <Spinner className="h-6 w-6 text-accent" />
                    Loading your data…
                  </div>
                ) : (
                  <ManageView
                    categories={managedCategories}
                    accounts={accounts}
                    recurringPatterns={markedPatterns}
                    transactions={transactions}
                    sheetTitle={sheet.title}
                    section={manageSection}
                    onSectionChange={setManageSection}
                    onCategoriesChanged={setManagedCategories}
                    onAccountsChanged={setAccounts}
                    onRecurringChanged={setMarkedPatterns}
                    onTransactionsChanged={() => void loadTransactions()}
                  />
                )}
              </>
            )}
          </>
        )}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6">
        <p className="text-center text-xs text-zinc-400">
          <a href="/privacy" className="font-medium hover:underline">
            Privacy policy
          </a>
        </p>
      </footer>

      {/* Floating add button on small screens */}
      {sheet && (
        <button
          type="button"
          onClick={() => {
            setEditingTx(null);
            setModalOpen(true);
          }}
          aria-label="Add entry"
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl font-bold text-white shadow-xl transition hover:bg-accent-strong hover:shadow-card-hover sm:hidden"
        >
          +
        </button>
      )}

      <AddTransactionModal
        open={modalOpen}
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        accounts={accountNames}
        transactions={transactions}
        editing={editingTx}
        markedPatterns={markedPatterns ?? []}
        onRecurringChanged={setMarkedPatterns}
        onClose={() => {
          setModalOpen(false);
          setEditingTx(null);
        }}
        onSaved={() => {
          setToast(editingTx ? "✅ Entry updated." : "✅ Entry saved to your sheet.");
          void loadTransactions();
        }}
        onManageAccounts={goToAccounts}
      />

      <OverviewCustomiseModal
        open={customiseOpen}
        layout={overviewLayout}
        onChange={saveOverviewLayout}
        onReset={() => saveOverviewLayout(DEFAULT_OVERVIEW_LAYOUT)}
        onClose={() => setCustomiseOpen(false)}
      />

      <DeleteConfirmDialog
        transaction={deletingTx}
        onClose={() => setDeletingTx(null)}
        onDeleted={() => {
          setToast("🗑️ Entry moved to Trash.");
          void loadTransactions();
        }}
      />

      {bulkDeleting && (
        <BulkDeleteDialog
          entries={bulkDeleting}
          busy={bulkBusy}
          onCancel={() => {
            if (!bulkBusy) setBulkDeleting(null);
          }}
          onConfirm={() => void bulkDelete(bulkDeleting)}
        />
      )}

      <HelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        onNavigate={handleHelpNavigate}
      />

      {/* Add another sheet: the same picker, as a modal over the dashboard. */}
      {showAddSheet && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add another sheet"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setShowAddSheet(false)}
        >
          <div
            className="w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowAddSheet(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-bold text-zinc-600 shadow-xl transition hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                ✕
              </button>
            </div>
            <SheetPicker onConnected={handleConnected} />
          </div>
        </div>
      )}
    </div>
  );
}
