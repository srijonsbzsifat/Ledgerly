"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MONTHS,
  MONTH_SHORT,
  SHEET_ID_STORAGE_KEY,
  formatBDT,
  formatDateShort,
  monthIndexFromDate,
  sheetStorageKeyFor,
  type SheetInfo,
  type Transaction,
  type TxType,
} from "@/lib/types";
import { AddTransactionModal } from "./AddTransactionModal";
import { CategoryDonut, MonthlyBarChart, type CategoryPoint, type MonthlyPoint } from "./Charts";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { DeleteIcon, EditIcon, IconButton } from "./IconButton";
import { LogoLockup } from "./Logo";
import { ProfileMenu } from "./ProfileMenu";
import { SheetPicker } from "./SheetPicker";

type MonthFilter = "all" | number;
type Tab = "overview" | "transactions";

interface Props {
  userName: string;
  userImage: string | null;
}

function totalsOf(txs: Transaction[]) {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (t.type === "Credit") income += t.amount;
    else expense += t.amount;
  }
  return { income, expense, balance: income - expense };
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

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-3xl border border-zinc-200 bg-white p-5 shadow-card transition-shadow hover:shadow-card-hover dark:border-zinc-800 dark:bg-zinc-900 sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

/** Month selector pills, shared by both tabs and kept in sync via props. */
function MonthPills({
  monthFilter,
  onChange,
}: {
  monthFilter: MonthFilter;
  onChange: (m: MonthFilter) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Keep the selected pill visible: on mount (e.g. November on first load)
  // and whenever the selection changes, centre it in the scrollable row.
  // Manual scrollLeft math (not scrollIntoView) so the page itself never jumps.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const active = container.querySelector<HTMLButtonElement>(
      '[aria-pressed="true"]'
    );
    if (!active) return;
    const target =
      active.offsetLeft - container.clientWidth / 2 + active.clientWidth / 2;
    container.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [monthFilter]);

  return (
    <div
      ref={containerRef}
      className="scrollbar-thin -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
    >
      <button
        type="button"
        onClick={() => onChange("all")}
        aria-pressed={monthFilter === "all"}
        className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
          monthFilter === "all"
            ? "bg-zinc-900 text-white shadow-card dark:bg-white dark:text-zinc-900"
            : "border border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900"
        }`}
      >
        All months
      </button>
      {MONTHS.map((m, i) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(i)}
          aria-pressed={monthFilter === i}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
            monthFilter === i
              ? "bg-accent text-white shadow-card"
              : "border border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900"
          }`}
        >
          {MONTH_SHORT[i]}
        </button>
      ))}
    </div>
  );
}

export function Dashboard({ userName, userImage }: Props) {
  const [sheet, setSheet] = useState<SheetInfo | null>(null);
  const [sheetChecked, setSheetChecked] = useState(false);
  const [authExpired, setAuthExpired] = useState(false);
  const { data: session, status: sessionStatus } = useSession();
  const userEmail = session?.user?.email ?? null;
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [monthFilter, setMonthFilter] = useState<MonthFilter>(() => new Date().getMonth());
  const [typeFilter, setTypeFilter] = useState<"all" | TxType>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [categoryView, setCategoryView] = useState<TxType>("Debit");
  const [visibleCount, setVisibleCount] = useState(50);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);

  // When transactions were last loaded successfully — used to throttle
  // background refreshes so resume/focus events don't refetch in a burst.
  const lastLoadedAt = useRef(0);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not load transactions.");
      setTransactions(data.transactions as Transaction[]);
      lastLoadedAt.current = Date.now();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

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
        if (res.status === 502) {
          // Stored sheet unreachable for this user — drop the stale cookie
          // so every load doesn't retry it, then fall through to the
          // reconnect attempt below.
          await fetch("/api/sheet", { method: "DELETE" });
        }
        if (res.ok && data?.connected) {
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
        if (reconnect.ok && reconnectData?.connected) {
          setSheet(reconnectData as SheetInfo);
        } else {
          // Saved sheet is no longer reachable — forget it, show the picker.
          window.localStorage.removeItem(storageKey);
        }
      } catch {
        // Network error — the picker will show; connecting again retries.
      } finally {
        if (!cancelled) setSheetChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionStatus, userEmail]);

  useEffect(() => {
    if (sheet) void loadTransactions();
  }, [sheet, loadTransactions]);

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

  async function disconnect() {
    await fetch("/api/sheet", { method: "DELETE" });
    window.localStorage.removeItem(SHEET_ID_STORAGE_KEY);
    if (userEmail) window.localStorage.removeItem(sheetStorageKeyFor(userEmail));
    setSheet(null);
    setTransactions([]);
    setMonthFilter(new Date().getMonth());
  }

  /** Sheet just connected: remember it under THIS user's key, then show it. */
  function handleConnected(info: SheetInfo) {
    if (userEmail) {
      window.localStorage.setItem(sheetStorageKeyFor(userEmail), info.id);
    }
    setSheet(info);
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

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) set.add(t.category);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [transactions]);

  const currentMonth = new Date().getMonth();

  const scopedTx = useMemo(
    () =>
      monthFilter === "all"
        ? transactions
        : transactions.filter((t) => monthIndexFromDate(t.date) === monthFilter),
    [transactions, monthFilter]
  );

  const allTotals = useMemo(() => totalsOf(transactions), [transactions]);
  const scopeTotals = useMemo(() => totalsOf(scopedTx), [scopedTx]);

  const thisMonthTx = useMemo(
    () => transactions.filter((t) => monthIndexFromDate(t.date) === currentMonth),
    [transactions, currentMonth]
  );
  const lastMonthTx = useMemo(
    () =>
      transactions.filter(
        (t) => monthIndexFromDate(t.date) === (currentMonth + 11) % 12
      ),
    [transactions, currentMonth]
  );
  const thisMonthTotals = useMemo(() => totalsOf(thisMonthTx), [thisMonthTx]);
  const lastMonthTotals = useMemo(() => totalsOf(lastMonthTx), [lastMonthTx]);

  const prevMonthTotals = useMemo(() => {
    if (monthFilter === "all" || monthFilter === 0) return null;
    return totalsOf(
      transactions.filter((t) => monthIndexFromDate(t.date) === monthFilter - 1)
    );
  }, [transactions, monthFilter]);

  const monthlySeries: MonthlyPoint[] = useMemo(() => {
    const byMonth = MONTHS.map((_, i) => ({ income: 0, expense: 0 }));
    for (const t of transactions) {
      const idx = monthIndexFromDate(t.date);
      if (idx === null) continue;
      if (t.type === "Credit") byMonth[idx].income += t.amount;
      else byMonth[idx].expense += t.amount;
    }
    return byMonth.map((m, i) => ({ month: MONTH_SHORT[i], ...m }));
  }, [transactions]);

  const categoryData: CategoryPoint[] = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of scopedTx) {
      if (t.type !== categoryView) continue;
      map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [scopedTx, categoryView]);

  const filteredTable = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedTx.filter((t) => {
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (
        q &&
        !`${t.description} ${t.category} ${t.date}`.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [scopedTx, typeFilter, categoryFilter, search]);

  const monthLabel =
    monthFilter === "all" ? "All months" : MONTHS[monthFilter];

  // First load: no data yet, so show loading states instead of zeros.
  const initialLoading = loading && transactions.length === 0;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-zinc-50/80 backdrop-blur-md dark:border-zinc-800/70 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <LogoLockup />
          {sheet && (
            <span className="hidden max-w-48 truncate rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent-strong dark:text-accent sm:inline-block">
              📗 {sheet.title}
            </span>
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
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
        {!sheetChecked ? (
          <div className="space-y-4">
            <div className="h-44 animate-pulse rounded-3xl bg-zinc-200/70 dark:bg-zinc-800/70" />
            <div className="grid gap-4 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-3xl bg-zinc-200/70 dark:bg-zinc-800/70" />
              ))}
            </div>
          </div>
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
        ) : !sheet ? (
          <div className="flex min-h-[60vh] items-center justify-center py-10">
            <SheetPicker onConnected={handleConnected} />
          </div>
        ) : (
          <>
            {toast && (
              <div className="mb-4 rounded-2xl bg-accent-soft px-4 py-3 text-sm font-medium text-accent-strong dark:text-accent">
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

            {/* Tab navigation */}
            <div
              role="tablist"
              aria-label="Dashboard views"
              className="mb-6 inline-flex rounded-full bg-zinc-200/70 p-1 dark:bg-zinc-800"
            >
              {(
                [
                  { id: "overview", label: "Overview" },
                  { id: "transactions", label: "Transactions" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                    activeTab === tab.id
                      ? "bg-accent text-white shadow-card"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  {tab.label}
                  {tab.id === "transactions" && transactions.length > 0 && (
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                        activeTab === tab.id
                          ? "bg-white/25 text-white"
                          : "bg-zinc-300/70 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                      }`}
                    >
                      {scopedTx.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {activeTab === "overview" ? (
              <>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
                    Overview
                  </h1>
                  {loading && transactions.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-strong dark:text-accent">
                      <Spinner className="h-3 w-3" />
                      Updating…
                    </span>
                  )}
                </div>

                {/* Hero: total balance */}
                {initialLoading ? (
                  <div className="mt-4 flex h-44 flex-col items-center justify-center gap-3 rounded-3xl bg-zinc-200/70 text-sm font-medium text-zinc-500 dark:bg-zinc-800/70 dark:text-zinc-400 sm:h-52">
                    <Spinner className="h-6 w-6 text-accent" />
                    Loading your data…
                  </div>
                ) : (
                <section className="relative mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-accent-strong via-accent to-accent-strong p-6 text-white shadow-card sm:p-8">
                  <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
                  <div className="pointer-events-none absolute -bottom-20 right-24 h-48 w-48 rounded-full bg-black/10 blur-2xl" />
                  <div className="relative">
                    <p className="text-sm font-medium text-white/80">Total balance</p>
                    <p className="mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">
                      {formatBDT(allTotals.balance)}
                    </p>
                    <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                      <span>
                        <span className="text-white/70">Income · </span>
                        <span className="font-semibold">{formatBDT(allTotals.income)}</span>
                      </span>
                      <span>
                        <span className="text-white/70">Expenses · </span>
                        <span className="font-semibold">{formatBDT(allTotals.expense)}</span>
                      </span>
                      <span>
                        <span className="text-white/70">{MONTHS[currentMonth]} so far · </span>
                        <span className="font-semibold">{formatBDT(thisMonthTotals.balance)}</span>
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/85">
                      <span>This month vs last:</span>
                      <span className="rounded-full bg-white/20 px-2.5 py-1">
                        Income{" "}
                        {lastMonthTotals.income === 0
                          ? "—"
                          : `${thisMonthTotals.income >= lastMonthTotals.income ? "▲" : "▼"} ${Math.abs(((thisMonthTotals.income - lastMonthTotals.income) / lastMonthTotals.income) * 100).toFixed(0)}%`}
                      </span>
                      <span className="rounded-full bg-white/20 px-2.5 py-1">
                        Expenses{" "}
                        {lastMonthTotals.expense === 0
                          ? "—"
                          : `${thisMonthTotals.expense >= lastMonthTotals.expense ? "▲" : "▼"} ${Math.abs(((thisMonthTotals.expense - lastMonthTotals.expense) / lastMonthTotals.expense) * 100).toFixed(0)}%`}
                      </span>
                    </div>
                  </div>
                </section>
                )}

                {/* Month selector */}
                <div className="mt-6">
                  <MonthPills monthFilter={monthFilter} onChange={setMonthFilter} />
                </div>

                {/* Scope summary cards */}
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
            ) : (
              <>
                <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
                  Transactions
                </h1>

                {/* Month selector (synced with Overview) */}
                <div className="mt-4">
                  <MonthPills monthFilter={monthFilter} onChange={setMonthFilter} />
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
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
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
                    </div>

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
                                <th className="py-2.5 pr-3 font-semibold">Date</th>
                                <th className="py-2.5 pr-3 font-semibold">Category</th>
                                <th className="py-2.5 pr-3 font-semibold">Description</th>
                                <th className="py-2.5 text-right font-semibold">Amount</th>
                                <th className="py-2.5 pl-3 text-right font-semibold">
                                  <span className="sr-only">Actions</span>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredTable.slice(0, visibleCount).map((t) => (
                                <tr
                                  key={t.id}
                                  className="border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50 dark:border-zinc-800/70 dark:hover:bg-zinc-800/50"
                                >
                                  <td className="whitespace-nowrap py-2.5 pr-3 tabular-nums text-zinc-600 dark:text-zinc-400">
                                    {formatDateShort(t.date)}
                                  </td>
                                  <td className="py-2.5 pr-3 font-medium">{t.category}</td>
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
                                        <IconButton
                                          label="Edit"
                                          onClick={() => {
                                            setEditingTx(t);
                                            setModalOpen(true);
                                          }}
                                        >
                                          <EditIcon />
                                        </IconButton>
                                        <IconButton
                                          label="Delete"
                                          tone="danger"
                                          onClick={() => setDeletingTx(t)}
                                        >
                                          <DeleteIcon />
                                        </IconButton>
                                      </span>
                                    ) : null}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile cards: everything fits the screen width, so
                            the amount is visible without swiping sideways. */}
                        <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800/70 sm:hidden">
                          {filteredTable.slice(0, visibleCount).map((t) => (
                            <li key={t.id} className="flex items-start justify-between gap-3 py-3">
                              <div className="min-w-0 pt-1">
                                <p className="truncate font-medium">
                                  {t.description || t.category}
                                </p>
                                <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                                  {t.description
                                    ? `${t.category} · ${formatDateShort(t.date)}`
                                    : formatDateShort(t.date)}
                                </p>
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
                                    <IconButton
                                      label="Edit"
                                      onClick={() => {
                                        setEditingTx(t);
                                        setModalOpen(true);
                                      }}
                                    >
                                      <EditIcon />
                                    </IconButton>
                                    <IconButton
                                      label="Delete"
                                      tone="danger"
                                      onClick={() => setDeletingTx(t)}
                                    >
                                      <DeleteIcon />
                                    </IconButton>
                                  </span>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                          <span>
                            Showing {Math.min(visibleCount, filteredTable.length)} of{" "}
                            {filteredTable.length}
                          </span>
                          {filteredTable.length > visibleCount && (
                            <button
                              type="button"
                              onClick={() => setVisibleCount((c) => c + 50)}
                              className="rounded-full border border-zinc-200 px-3 py-1.5 font-medium transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                            >
                              Show more
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </Card>
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
        categories={categories}
        editing={editingTx}
        onClose={() => {
          setModalOpen(false);
          setEditingTx(null);
        }}
        onSaved={() => {
          setToast(editingTx ? "✅ Entry updated." : "✅ Entry saved to your sheet.");
          void loadTransactions();
        }}
      />

      <DeleteConfirmDialog
        transaction={deletingTx}
        onClose={() => setDeletingTx(null)}
        onDeleted={() => {
          setToast("🗑️ Entry deleted.");
          void loadTransactions();
        }}
      />
    </div>
  );
}
