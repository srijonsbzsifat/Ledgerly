"use client";

import { useMemo, useState } from "react";
import {
  MONTHS,
  MONTH_SHORT,
  displayCategory,
  formatBDT,
  isTransfer,
  parseISODate,
  totalsOf,
  type ManagedCategory,
  type Transaction,
} from "@/lib/types";
import {
  CategoryDonut,
  MonthlyBarChart,
  SingleBarChart,
  type CategoryPoint,
  type MonthlyPoint,
} from "./Charts";
import { CategoryBars } from "./CategoryBars";
import { Card } from "./ui";

function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000);
}

function ChartTableToggle({
  view,
  onChange,
}: {
  view: "chart" | "table";
  onChange: (v: "chart" | "table") => void;
}) {
  return (
    <div className="flex rounded-full bg-zinc-100 p-0.5 text-xs font-semibold dark:bg-zinc-800">
      {(["chart", "table"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={view === v}
          className={`rounded-full px-3 py-1.5 capitalize transition ${
            view === v
              ? "bg-white shadow-card dark:bg-zinc-900"
              : "text-zinc-500"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function SectionHead({
  title,
  subtitle,
  view,
  onView,
}: {
  title: string;
  subtitle?: string;
  view?: "chart" | "table";
  onView?: (v: "chart" | "table") => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="text-base font-bold tracking-tight">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
      </div>
      {view && onView && <ChartTableToggle view={view} onChange={onView} />}
    </div>
  );
}

/**
 * Reports tab: the selected month or year, told as a story — hero totals,
 * daily trend, 12-month income vs spending, share of spending, where it
 * went, month to month, and a year summary. Everything is computed from
 * the transactions already loaded; no extra data fetches.
 */
export function ReportsView({
  transactions,
  managedCategories,
}: {
  transactions: Transaction[];
  managedCategories: ManagedCategory[] | null;
}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-11
  const today = now.getDate();

  const [period, setPeriod] = useState<"month" | "year">("month");
  const [reportMonth, setReportMonth] = useState(currentMonth);
  const [reportYear, setReportYear] = useState(currentYear);
  const [trendView, setTrendView] = useState<"chart" | "table">("chart");
  const [incomeView, setIncomeView] = useState<"chart" | "table">("chart");
  const [shareView, setShareView] = useState<"chart" | "table">("chart");
  const [monthView, setMonthView] = useState<"chart" | "table">("chart");

  const years = useMemo(() => {
    const set = new Set<number>([currentYear]);
    for (const t of transactions) {
      const p = parseISODate(t.date);
      if (p) set.add(p.year);
    }
    return [...set].sort((a, b) => a - b);
  }, [transactions, currentYear]);

  const isCurrentMonth = reportYear === currentYear && reportMonth === currentMonth;
  const isCurrentYear = reportYear === currentYear;
  const dim = daysInMonth(reportYear, reportMonth + 1);
  const daysElapsed =
    period === "month"
      ? isCurrentMonth
        ? today
        : dim
      : isCurrentYear
        ? dayOfYear(now)
        : 365;

  const periodLabel =
    period === "month"
      ? `${MONTHS[reportMonth]} ${reportYear}`
      : `${reportYear}`;

  const periodTx = useMemo(
    () =>
      transactions.filter((t) => {
        const p = parseISODate(t.date);
        if (!p || p.year !== reportYear) return false;
        return period === "year" || p.month - 1 === reportMonth;
      }),
    [transactions, reportYear, reportMonth, period]
  );

  const totals = useMemo(() => totalsOf(periodTx), [periodTx]);
  const expenseCount = useMemo(
    () => periodTx.filter((t) => t.type === "Debit").length,
    [periodTx]
  );

  // Previous month, same number of days (or the full month for past months).
  const prevTotals = useMemo(() => {
    const prevMonth = reportMonth === 0 ? 11 : reportMonth - 1;
    const prevYear = reportMonth === 0 ? reportYear - 1 : reportYear;
    let spent = 0;
    for (const t of transactions) {
      const p = parseISODate(t.date);
      if (!p || p.year !== prevYear || p.month - 1 !== prevMonth) continue;
      if (t.type === "Debit" && !isTransfer(t) && p.day <= daysElapsed) spent += t.amount;
    }
    return { spent, month: prevMonth, year: prevYear };
  }, [transactions, reportMonth, reportYear, daysElapsed]);

  const trendData = useMemo(() => {
    if (period === "year") {
      const byMonth = Array.from({ length: 12 }, () => 0);
      for (const t of periodTx) {
        if (t.type !== "Debit" || isTransfer(t)) continue;
        const p = parseISODate(t.date);
        if (p) byMonth[p.month - 1] += t.amount;
      }
      return byMonth.map((value, i) => ({ label: MONTH_SHORT[i], value }));
    }
    const byDay = Array.from({ length: dim }, () => 0);
    for (const t of periodTx) {
      if (t.type !== "Debit" || isTransfer(t)) continue;
      const p = parseISODate(t.date);
      if (p) byDay[p.day - 1] += t.amount;
    }
    return byDay.map((value, i) => ({ label: String(i + 1), value }));
  }, [periodTx, period, dim]);

  const yearlySeries: MonthlyPoint[] = useMemo(() => {
    const byMonth = MONTHS.map(() => ({ income: 0, expense: 0 }));
    for (const t of transactions) {
      const p = parseISODate(t.date);
      if (!p || p.year !== reportYear) continue;
      if (isTransfer(t)) continue;
      if (t.type === "Credit") byMonth[p.month - 1].income += t.amount;
      else byMonth[p.month - 1].expense += t.amount;
    }
    return byMonth.map((m, i) => ({ month: MONTH_SHORT[i], ...m }));
  }, [transactions, reportYear]);

  const expenseCategories: CategoryPoint[] = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of periodTx) {
      if (t.type !== "Debit" || isTransfer(t)) continue;
      const name = displayCategory(t.category, t.type, managedCategories);
      map.set(name, (map.get(name) ?? 0) + t.amount);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [periodTx, managedCategories]);

  const shareData: CategoryPoint[] = useMemo(() => {
    if (expenseCategories.length <= 5) return expenseCategories;
    const top = expenseCategories.slice(0, 5);
    const rest = expenseCategories
      .slice(5)
      .reduce((s, d) => s + d.value, 0);
    return [
      ...top,
      { name: `Other (${expenseCategories.length - 5} more)`, value: rest },
    ];
  }, [expenseCategories]);

  const monthToMonth = useMemo(
    () =>
      yearlySeries.map((m) => ({
        label: m.month,
        value: m.expense,
      })),
    [yearlySeries]
  );

  // Year summary: whole months are months with data that have fully elapsed.
  const yearSummary = useMemo(() => {
    const whole: { month: number; spent: number }[] = [];
    const byMonth = new Map<number, number>();
    for (const t of transactions) {
      const p = parseISODate(t.date);
      if (!p || p.year !== reportYear || t.type !== "Debit" || isTransfer(t)) continue;
      byMonth.set(p.month - 1, (byMonth.get(p.month - 1) ?? 0) + t.amount);
    }
    for (const [m, spent] of byMonth) {
      if (isCurrentYear && m === currentMonth) continue; // still in progress
      whole.push({ month: m, spent });
    }
    whole.sort((a, b) => b.spent - a.spent);
    const yearSpent = [...byMonth.values()].reduce((s, v) => s + v, 0);
    const yearTx = transactions.filter((t) => {
      const p = parseISODate(t.date);
      return p?.year === reportYear && !isTransfer(t);
    });
    const yearCats = new Map<string, number>();
    for (const t of yearTx) {
      if (t.type !== "Debit") continue;
      const name = displayCategory(t.category, t.type, managedCategories);
      yearCats.set(name, (yearCats.get(name) ?? 0) + t.amount);
    }
    const biggest = [...yearCats.entries()].sort((a, b) => b[1] - a[1])[0];
    const prevYearSpent = transactions
      .filter((t) => parseISODate(t.date)?.year === reportYear - 1 && t.type === "Debit" && !isTransfer(t))
      .reduce((s, t) => s + t.amount, 0);
    return {
      yearSpent,
      yearCount: yearTx.filter((t) => t.type === "Debit").length,
      wholeCount: whole.length,
      avg: whole.length > 0 ? whole.reduce((s, w) => s + w.spent, 0) / whole.length : 0,
      highest: whole[0] ?? null,
      lowest: whole.length >= 2 ? whole[whole.length - 1] : null,
      biggest: biggest ? { name: biggest[0], value: biggest[1] } : null,
      prevYearSpent,
    };
  }, [transactions, reportYear, isCurrentYear, currentMonth, managedCategories]);

  function stepMonth(delta: number) {
    let m = reportMonth + delta;
    let y = reportYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setReportMonth(m);
    setReportYear(y);
  }

  function stepYear(delta: number) {
    setReportYear((y) => {
      const next = y + delta;
      if (next > currentYear) return y;
      if (next < years[0]) return y;
      return next;
    });
  }

  const dailyAvg = daysElapsed > 0 ? totals.expense / daysElapsed : 0;
  const diff = totals.expense - prevTotals.spent;
  const selectCls =
    "rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-medium outline-none transition focus:border-accent dark:border-zinc-700 dark:bg-zinc-950";

  if (transactions.length === 0) {
    return (
      <Card className="mt-4 text-center">
        <p className="text-4xl">📊</p>
        <h2 className="mt-3 text-lg font-bold">No reports yet</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">
          Add some entries and your reports will appear here.
        </p>
      </Card>
    );
  }

  return (
    <div>
      {/* Period selector */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-full bg-zinc-200/70 p-1 text-sm font-semibold dark:bg-zinc-800">
          {(["month", "year"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              className={`rounded-full px-4 py-1.5 capitalize transition ${
                period === p
                  ? "bg-accent text-white shadow-card"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous period"
            onClick={() => (period === "month" ? stepMonth(-1) : stepYear(-1))}
            className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm font-bold transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            ‹
          </button>
          {period === "month" ? (
            <>
              <select
                value={reportMonth}
                onChange={(e) => setReportMonth(Number(e.target.value))}
                aria-label="Month"
                className={selectCls}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={reportYear}
                onChange={(e) => setReportYear(Number(e.target.value))}
                aria-label="Year"
                className={selectCls}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <select
              value={reportYear}
              onChange={(e) => setReportYear(Number(e.target.value))}
              aria-label="Year"
              className={selectCls}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            aria-label="Next period"
            onClick={() => (period === "month" ? stepMonth(1) : stepYear(1))}
            className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm font-bold transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            ›
          </button>
        </div>
      </div>

      {/* Hero */}
      <section className="relative mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-accent-strong via-accent to-accent-strong p-6 text-white shadow-card sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 right-24 h-48 w-48 rounded-full bg-black/10 blur-2xl" />
        <div className="relative">
          <p className="text-sm font-medium text-white/80">Spent in {periodLabel}</p>
          <p className="mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">
            {formatBDT(totals.expense)}
          </p>
          <div className="mt-5 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-white/70">Income</p>
              <p className="font-semibold">{formatBDT(totals.income)}</p>
            </div>
            <div>
              <p className="text-white/70">Net cash flow</p>
              <p className="font-semibold">
                {totals.balance >= 0 ? "+" : "−"}
                {formatBDT(Math.abs(totals.balance))}
                <span className="font-normal text-white/85">
                  {" "}
                  ({formatBDT(Math.abs(totals.balance))}{" "}
                  {totals.balance >= 0 ? "more in than out" : "more out than in"})
                </span>
              </p>
            </div>
            <div>
              <p className="text-white/70">Expenses</p>
              <p className="font-semibold">{expenseCount}</p>
            </div>
            <div>
              <p className="text-white/70">Daily average</p>
              <p className="font-semibold">
                {formatBDT(dailyAvg)}{" "}
                <span className="font-normal text-white/85">
                  over {daysElapsed} day{daysElapsed === 1 ? "" : "s"}
                </span>
              </p>
            </div>
            {period === "month" && (
              <div>
                <p className="text-white/70">
                  {MONTHS[prevTotals.month]} {prevTotals.year}
                  {isCurrentMonth ? ", same days" : ""}
                </p>
                <p className="font-semibold">
                  {formatBDT(prevTotals.spent)}{" "}
                  <span className="font-normal text-white/85">
                    ({formatBDT(Math.abs(diff))} {diff <= 0 ? "less" : "more"} now)
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Spending trend */}
      <Card className="mt-4">
        <SectionHead
          title={period === "month" ? "Spending trend" : "Spending by month"}
          subtitle={period === "month" ? "Daily totals" : "Monthly totals"}
          view={trendView}
          onView={setTrendView}
        />
        <div className="mt-4">
          {trendView === "chart" ? (
            <SingleBarChart data={trendData} maxBarSize={period === "month" ? 14 : 28} />
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800/70">
              {[...trendData]
                .filter((d) => d.value > 0)
                .reverse()
                .map((d) => (
                  <li key={d.label} className="flex items-center justify-between py-2">
                    <span className="text-zinc-600 dark:text-zinc-400">
                      {period === "month"
                        ? `${MONTHS[reportMonth].slice(0, 3)} ${d.label}`
                        : d.label}
                    </span>
                    <span className="font-semibold tabular-nums">{formatBDT(d.value)}</span>
                  </li>
                ))}
              {trendData.every((d) => d.value === 0) && (
                <li className="py-6 text-center text-zinc-500">Nothing spent in this period.</li>
              )}
            </ul>
          )}
        </div>
      </Card>

      {/* Income and spending, 12 months */}
      <Card className="mt-4">
        <SectionHead
          title="Income and spending"
          subtitle={`Each month of ${reportYear}, and the difference`}
          view={incomeView}
          onView={setIncomeView}
        />
        <div className="mt-4">
          {incomeView === "chart" ? (
            <MonthlyBarChart data={yearlySeries} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                    <th className="py-2 pr-3 font-semibold">Month</th>
                    <th className="py-2 pr-3 text-right font-semibold">Income</th>
                    <th className="py-2 pr-3 text-right font-semibold">Spent</th>
                    <th className="py-2 text-right font-semibold">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {yearlySeries.map((m) => (
                    <tr key={m.month} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/70">
                      <td className="py-2 pr-3 font-medium">{m.month}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatBDT(m.income)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-rose-600 dark:text-rose-400">
                        {formatBDT(m.expense)}
                      </td>
                      <td className="py-2 text-right font-semibold tabular-nums">
                        {formatBDT(m.income - m.expense)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* Share of spending + Where it went */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHead
            title="Share of spending"
            subtitle={`The five biggest categories, ${periodLabel}`}
            view={shareView}
            onView={setShareView}
          />
          <div className="mt-4">
            {expenseCategories.length === 0 ? (
              <p className="py-16 text-center text-sm text-zinc-500">
                No spending in this period.
              </p>
            ) : shareView === "chart" ? (
              <CategoryDonut data={shareData} />
            ) : (
              <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800/70">
                {expenseCategories.map((d) => (
                  <li key={d.name} className="flex items-center justify-between py-2">
                    <span>{d.name}</span>
                    <span className="tabular-nums">
                      <span className="font-semibold">{formatBDT(d.value)}</span>
                      <span className="ml-2 text-xs text-zinc-500">
                        {totals.expense > 0
                          ? `${Math.round((d.value / totals.expense) * 100)}%`
                          : "—"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
        <Card>
          <SectionHead
            title="Where it went"
            subtitle={`By category, ${periodLabel}`}
          />
          <div className="mt-4">
            <CategoryBars data={expenseCategories} />
          </div>
        </Card>
      </div>

      {/* Month to month */}
      <Card className="mt-4">
        <SectionHead
          title="Month to month"
          subtitle={`Total spent each month of ${reportYear}`}
          view={monthView}
          onView={setMonthView}
        />
        <div className="mt-4">
          {monthView === "chart" ? (
            <SingleBarChart
              data={monthToMonth}
              highlightIndex={period === "month" ? reportMonth : undefined}
            />
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800/70">
              {monthToMonth.map((d, i) => (
                <li
                  key={d.label}
                  className={`flex items-center justify-between py-2 ${
                    period === "month" && i === reportMonth ? "font-semibold" : ""
                  }`}
                >
                  <span className="text-zinc-600 dark:text-zinc-400">{MONTHS[i]}</span>
                  <span className="tabular-nums">{formatBDT(d.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* Year summary */}
      <Card className="mt-4">
        <SectionHead title={`${reportYear} summary`} subtitle={`1 Jan to ${isCurrentYear ? `${today} ${MONTHS[currentMonth].slice(0, 3)}` : `31 Dec`}`} />
        <div className="mt-4 grid gap-x-8 gap-y-5 text-sm sm:grid-cols-3">
          <div>
            <p className="text-zinc-500">Spent so far in {reportYear}</p>
            <p className="mt-0.5 text-xl font-extrabold tracking-tight">
              {formatBDT(yearSummary.yearSpent)}
            </p>
            <p className="text-xs text-zinc-500">
              {yearSummary.yearCount} expense{yearSummary.yearCount === 1 ? "" : "s"}
            </p>
          </div>
          <div>
            <p className="text-zinc-500">Average per month</p>
            <p className="mt-0.5 text-xl font-extrabold tracking-tight">
              {yearSummary.wholeCount > 0 ? formatBDT(yearSummary.avg) : "—"}
            </p>
            <p className="text-xs text-zinc-500">
              {yearSummary.wholeCount} whole month{yearSummary.wholeCount === 1 ? "" : "s"}
            </p>
          </div>
          <div>
            <p className="text-zinc-500">Highest month</p>
            <p className="mt-0.5 text-xl font-extrabold tracking-tight">
              {yearSummary.highest ? MONTHS[yearSummary.highest.month] : "—"}
            </p>
            <p className="text-xs text-zinc-500">
              {yearSummary.highest ? formatBDT(yearSummary.highest.spent) : ""}
            </p>
          </div>
          <div>
            <p className="text-zinc-500">Lowest month</p>
            <p className="mt-0.5 text-xl font-extrabold tracking-tight">
              {yearSummary.lowest ? MONTHS[yearSummary.lowest.month] : "—"}
            </p>
            <p className="text-xs text-zinc-500">
              {yearSummary.lowest ? formatBDT(yearSummary.lowest.spent) : ""}
            </p>
          </div>
          <div>
            <p className="text-zinc-500">Biggest category</p>
            <p className="mt-0.5 text-xl font-extrabold tracking-tight">
              {yearSummary.biggest ? yearSummary.biggest.name : "—"}
            </p>
            <p className="text-xs text-zinc-500">
              {yearSummary.biggest
                ? `${formatBDT(yearSummary.biggest.value)}${
                    yearSummary.yearSpent > 0
                      ? `, ${Math.round((yearSummary.biggest.value / yearSummary.yearSpent) * 100)}% of the year`
                      : ""
                  }`
                : ""}
            </p>
          </div>
          <div>
            <p className="text-zinc-500">Compared with {reportYear - 1}</p>
            <p className="mt-0.5 text-xl font-extrabold tracking-tight">
              {yearSummary.prevYearSpent > 0
                ? formatBDT(yearSummary.prevYearSpent)
                : "—"}
            </p>
            <p className="text-xs text-zinc-500">
              {yearSummary.prevYearSpent > 0
                ? `spent in ${reportYear - 1}`
                : `Nothing recorded before ${reportYear}`}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
