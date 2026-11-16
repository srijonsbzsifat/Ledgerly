"use client";

import { useMemo, useState } from "react";
import { computePace, suggestMonthlyTarget } from "@/lib/pace";
import {
  MONTHS,
  effectiveTarget,
  formatBDT,
  formatDateShort,
  type Budget,
  type MarkedPattern,
  type Transaction,
} from "@/lib/types";

/**
 * Cumulative pace chart: solid = actual cumulative spend, dotted = the
 * expected pace — fixed costs landing on their actual/expected days, the
 * everyday budget spread evenly. Hand-rolled SVG (small, styled for the
 * green hero) instead of Recharts.
 */
function PaceChart({
  cumulative,
  idealByDay,
  daysShown,
  dim,
}: {
  cumulative: number[];
  idealByDay: number[] | null;
  daysShown: number; // days with actual data (today for the live month, dim for a closed month)
  dim: number;
}) {
  const W = 320;
  const H = 100;
  const PAD = 6;
  const maxActual = cumulative.length > 0 ? cumulative[cumulative.length - 1] : 0;
  const maxIdeal = idealByDay && idealByDay.length > 0 ? idealByDay[dim - 1] : 0;
  const yMax = Math.max(maxIdeal, maxActual, 1);
  const x = (day: number) => (day / dim) * W;
  const y = (v: number) => H - PAD - (v / yMax) * (H - PAD * 2);

  const actualPoints = [
    `0,${y(0).toFixed(1)}`,
    ...cumulative
      .slice(0, daysShown)
      .map((v, i) => `${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`),
  ].join(" ");
  const idealPoints = idealByDay
    ? [
        `0,${y(0).toFixed(1)}`,
        ...idealByDay.map((v, i) => `${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`),
      ].join(" ")
    : null;
  const endX = daysShown > 0 ? x(daysShown) : 0;
  const endY = daysShown > 0 ? y(cumulative[daysShown - 1]) : y(0);

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-24 w-full"
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        {/* Faint baseline */}
        <line
          x1={0}
          y1={y(0)}
          x2={W}
          y2={y(0)}
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        {idealPoints && (
          <polyline
            points={idealPoints}
            fill="none"
            stroke="rgba(255,255,255,0.6)"
            strokeWidth={1.5}
            strokeDasharray="3 4"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {daysShown > 0 && (
          <>
            <polyline
              points={actualPoints}
              fill="none"
              stroke="#ffffff"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={endX} cy={endY} r={4} fill="#fcd34d" />
          </>
        )}
      </svg>
      <div className="mt-1.5 flex justify-between text-[11px] text-white/70">
        <span>1</span>
        <span>{Math.ceil(dim / 4)}</span>
        <span>{Math.ceil(dim / 2)}</span>
        <span>{Math.ceil((dim * 3) / 4)}</span>
        <span>{dim}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/85">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded bg-white" />
          Spent so far
        </span>
        {idealByDay && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded bg-white/60 [background-image:linear-gradient(to_right,white_50%,transparent_50%)] [background-size:6px_2px]" />
            Expected pace
          </span>
        )}
      </div>
    </div>
  );
}

async function postBudgets(
  body: Record<string, unknown>
): Promise<{ budgets: Budget[] }> {
  const res = await fetch("/api/budgets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "Could not save the target.");
  return data;
}

/**
 * The pace card (Phase 1: R1–R4, with the smart pace math from lib/pace;
 * Phase 2: R5 monthly target, R9 month-in-review). It follows the month
 * picker — it shows the SELECTED month, not the real current month — and
 * shows pace, not totals: safe-to-spend per day, projected month-end
 * spend, and a cumulative pace line. The scope cards above it own the
 * totals, so this card never repeats them.
 *
 * A monthly target (R5) becomes the baseline when one is set: safe-to-
 * spend, the projection verdict, and the ideal line all measure against
 * it. Targets carry forward month to month until changed. Past months
 * get a closed month-in-review card (R9); future months get a one-line
 * notice. The Dashboard only renders this card when a single month of a
 * single year is selected.
 */
export function PaceCard({
  transactions,
  year,
  month,
  marked,
  budgets,
  onBudgetsChanged,
}: {
  transactions: Transaction[];
  year: number; // e.g. 2026
  month: number; // 1-12
  /** Patterns the user marked in Manage > Recurring. */
  marked: MarkedPattern[];
  /** Monthly targets from the sheet's Budgets tab. */
  budgets: Budget[];
  onBudgetsChanged: (budgets: Budget[]) => void;
}) {
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const target = effectiveTarget(budgets, year, month);
  // The row the target comes from — for the "carried from …" note, and
  // for Remove (only the month's own row can be removed from here).
  const targetSource = useMemo(() => {
    const before = budgets
      .filter((b) => b.month <= monthKey)
      .sort((a, b) => a.month.localeCompare(b.month));
    return before.length > 0 ? before[before.length - 1] : null;
  }, [budgets, monthKey]);
  const ownRow = budgets.some((b) => b.month === monthKey);
  const carried = target !== null && targetSource !== null && targetSource.month !== monthKey;

  const pace = useMemo(
    () => computePace(transactions, year, month, new Date(), marked, target),
    [transactions, year, month, marked, target]
  );

  const suggestion = useMemo(
    () => suggestMonthlyTarget(transactions, year, month),
    [transactions, year, month]
  );

  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState("");
  const [targetBusy, setTargetBusy] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);

  const monthName = `${MONTHS[month - 1]} ${year}`;
  const monthShort = MONTHS[month - 1].slice(0, 3);
  const prevMonthName =
    month === 1
      ? `${MONTHS[11]} ${year - 1}`
      : `${MONTHS[month - 2]} ${year}`;
  const sourceMonthName = targetSource
    ? `${MONTHS[Number(targetSource.month.slice(5, 7)) - 1]} ${targetSource.month.slice(0, 4)}`
    : "";

  function openTargetEditor() {
    setTargetInput(target !== null ? String(target) : suggestion !== null ? String(suggestion) : "");
    setTargetError(null);
    setEditingTarget(true);
  }

  async function saveTarget() {
    const value = Number(targetInput);
    if (!Number.isFinite(value) || value <= 0) {
      setTargetError("Enter a target above 0.");
      return;
    }
    setTargetBusy(true);
    setTargetError(null);
    try {
      const data = await postBudgets({ action: "set", month: monthKey, target: value });
      onBudgetsChanged(data.budgets);
      setEditingTarget(false);
    } catch (err) {
      setTargetError(err instanceof Error ? err.message : "Could not save the target.");
    } finally {
      setTargetBusy(false);
    }
  }

  async function removeTarget() {
    setTargetBusy(true);
    setTargetError(null);
    try {
      const data = await postBudgets({ action: "delete", month: monthKey });
      onBudgetsChanged(data.budgets);
      setEditingTarget(false);
    } catch (err) {
      setTargetError(err instanceof Error ? err.message : "Could not remove the target.");
    } finally {
      setTargetBusy(false);
    }
  }

  // ---- Future month: one-line notice -------------------------------------
  if (pace.isFuture) {
    return (
      <section className="mt-4 rounded-3xl border border-zinc-200 bg-white px-6 py-4 text-sm text-zinc-600 shadow-card dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
          {monthName} hasn&rsquo;t started yet.
        </span>{" "}
        {pace.entryCount > 0
          ? `${pace.entryCount} ${pace.entryCount === 1 ? "entry" : "entries"} already logged.`
          : "Nothing logged for it yet."}
      </section>
    );
  }

  // ---- Shared pieces -------------------------------------------------------
  // The breakdown line — what makes the smart numbers legible. Only the
  // parts that are non-zero, so a month with no one-offs doesn't show "৳0".
  const breakdownParts: string[] = [];
  if (pace.fixedSpent > 0)
    breakdownParts.push(`Fixed ${formatBDT(Math.round(pace.fixedSpent))}`);
  if (pace.oneOffSpent > 0)
    breakdownParts.push(`One-offs ${formatBDT(Math.round(pace.oneOffSpent))}`);
  if (pace.everydaySpent > 0)
    breakdownParts.push(
      `Everyday ${formatBDT(Math.round(pace.everydaySpent))}`
    );

  // State pill for the live month: ratio of the daily allowance to the even
  // EVERYDAY pace (BudgetBaby thresholds: ≥80% comfortable, 50–80%
  // moderate). The everyday budget already excludes fixed costs, so the
  // day-1 home loan no longer drags the verdict down.
  const evenEverydayPace =
    pace.everydayBudget !== null && pace.everydayBudget > 0
      ? pace.everydayBudget / pace.dim
      : null;
  const ratio =
    pace.safePerDay !== null && evenEverydayPace
      ? pace.safePerDay / evenEverydayPace
      : null;
  const pill =
    pace.safePerDay === null
      ? null
      : pace.safePerDay <= 0
        ? { text: "Over budget", cls: "bg-rose-500 text-white" }
        : ratio !== null && ratio >= 0.8
          ? { text: "On track", cls: "bg-white text-emerald-800" }
          : ratio !== null && ratio >= 0.5
            ? { text: "Watch it", cls: "bg-amber-300 text-amber-950" }
            : ratio !== null
              ? { text: "Over pace", cls: "bg-rose-400 text-white" }
              : { text: "On track", cls: "bg-white text-emerald-800" };

  // Target progress (R5): spent vs target, green/amber/red by the usual
  // budget thresholds (75% / 100%).
  const targetRatio = target !== null && target > 0 ? pace.spent / target : null;
  const targetBarCls =
    targetRatio === null
      ? "bg-white"
      : targetRatio >= 1
        ? "bg-rose-300"
        : targetRatio >= 0.75
          ? "bg-amber-300"
          : "bg-white";

  // The target row + editor (live month only — a closed month shows its
  // target outcome in the review lines instead).
  const targetBlock = pace.isCurrent ? (
    <div className="mt-5 border-t border-white/20 pt-4">
      {editingTarget ? (
        <div>
          <p className="text-sm font-semibold">Monthly target for {monthName}</p>
          {suggestion !== null && (
            <p className="mt-1 text-xs text-white/70">
              Suggested {formatBDT(suggestion)} — your median monthly spend.
              {target === null && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => setTargetInput(String(suggestion))}
                    className="font-semibold text-white underline"
                  >
                    Use it
                  </button>
                </>
              )}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min={1}
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              placeholder="e.g. 150000"
              autoFocus
              aria-label="Monthly target"
              className="w-40 rounded-xl border border-white/40 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 outline-none focus:ring-2 focus:ring-white/60"
            />
            <button
              type="button"
              disabled={targetBusy || !Number(targetInput) || Number(targetInput) <= 0}
              onClick={() => void saveTarget()}
              className="rounded-full bg-white px-4 py-2 text-xs font-bold text-emerald-800 transition hover:bg-white/90 disabled:opacity-50"
            >
              {targetBusy ? "Saving…" : "Save target"}
            </button>
            <button
              type="button"
              disabled={targetBusy}
              onClick={() => setEditingTarget(false)}
              className="rounded-full border border-white/40 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
            >
              Cancel
            </button>
            {ownRow && (
              <button
                type="button"
                disabled={targetBusy}
                onClick={() => void removeTarget()}
                className="rounded-full px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-white/10 disabled:opacity-50"
              >
                Remove target
              </button>
            )}
          </div>
          {carried && (
            <p className="mt-2 text-xs text-white/70">
              This target was set for {sourceMonthName} and carries forward —
              saving here sets {monthName}&rsquo;s own target.
            </p>
          )}
          {targetError && (
            <p role="alert" className="mt-2 text-xs font-semibold text-amber-200">
              {targetError}
            </p>
          )}
        </div>
      ) : target !== null ? (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <span className="text-white/70">Target · </span>
              <span className="font-semibold">{formatBDT(target)}</span>
              {carried && (
                <span className="text-white/70"> (from {sourceMonthName})</span>
              )}
            </p>
            <button
              type="button"
              onClick={openTargetEditor}
              className="rounded-full border border-white/40 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/10"
            >
              Edit
            </button>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/25">
            <div
              className={`h-2 rounded-full transition-all ${targetBarCls}`}
              style={{ width: `${Math.min(100, (targetRatio ?? 0) * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-white/70">
            {formatBDT(Math.round(pace.spent))} spent ·{" "}
            {Math.round((targetRatio ?? 0) * 100)}% of target
            {target !== null && pace.spent <= target && (
              <> · {formatBDT(Math.round(target - pace.spent))} left</>
            )}
          </p>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={openTargetEditor}
            className="rounded-full border border-white/40 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Set a monthly target
          </button>
          {suggestion !== null && (
            <p className="mt-2 text-xs text-white/70">
              Suggested {formatBDT(suggestion)} — your median monthly spend.
            </p>
          )}
        </div>
      )}
    </div>
  ) : null;

  return (
    <section className="relative mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-accent-strong via-accent to-accent-strong p-6 text-white shadow-card sm:p-8">
      <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-20 right-24 h-48 w-48 rounded-full bg-black/10 blur-2xl" />
      <div className="relative grid gap-6 lg:grid-cols-2">
        <div>
          {pace.isCurrent ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-white/80">
                  Pace in {monthName}
                </p>
                {pill && (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${pill.cls}`}
                  >
                    {pill.text}
                  </span>
                )}
              </div>
              {pace.safePerDay !== null && pace.baseline ? (
                <>
                  <p className="mt-3 text-sm text-white/80">
                    Safe to spend per day
                  </p>
                  <p className="mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">
                    {formatBDT(Math.round(Math.max(0, pace.safePerDay)))}
                  </p>
                  <div className="mt-4 space-y-1.5 text-sm">
                    <p>
                      <span className="font-semibold">
                        {pace.left! >= 0
                          ? `${formatBDT(Math.round(pace.left!))} left`
                          : `${formatBDT(Math.round(Math.abs(pace.left!)))} over`}
                      </span>
                      <span className="text-white/70">
                        {" "}
                        of {formatBDT(Math.round(pace.baseline.value))}{" "}
                        {pace.baseline.label}
                        {pace.upcomingFixedTotal > 0 && (
                          <>
                            {" · "}
                            {formatBDT(Math.round(pace.upcomingFixedTotal))}{" "}
                            reserved
                          </>
                        )}
                        {" · "}
                        {pace.daysRemaining} day
                        {pace.daysRemaining === 1 ? "" : "s"} left
                      </span>
                    </p>
                    {pace.showProjection && pace.projection !== null && (
                      <p>
                        <span className="text-white/70">
                          On pace to spend{" "}
                        </span>
                        <span className="font-semibold">
                          {formatBDT(Math.round(pace.projection))}
                        </span>
                        <span className="text-white/70"> by month-end · </span>
                        <span
                          className={
                            pace.projection > pace.baseline.value
                              ? "font-semibold text-amber-200"
                              : "font-semibold"
                          }
                        >
                          {formatBDT(
                            Math.round(
                              Math.abs(pace.projection - pace.baseline.value)
                            )
                          )}{" "}
                          {pace.projection > pace.baseline.value
                            ? "over"
                            : "under"}{" "}
                          {pace.baseline.label}
                        </span>
                      </p>
                    )}
                    {breakdownParts.length > 0 && (
                      <p className="text-white/70">{breakdownParts.join(" · ")}</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="mt-4 space-y-1.5 text-sm">
                  <p>
                    Log income for {monthName} to see your daily pace.
                  </p>
                  <p>
                    <span className="text-white/70">Daily average so far · </span>
                    <span className="font-semibold">
                      {formatBDT(Math.round(pace.dailyAvg))}
                    </span>
                    <span className="text-white/70">
                      {" "}
                      over {pace.daysElapsed} day
                      {pace.daysElapsed === 1 ? "" : "s"}
                    </span>
                  </p>
                </div>
              )}
              {targetBlock}
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-white/80">
                {monthName} · Closed
              </p>
              <p className="mt-3 text-sm text-white/80">
                Daily average · over {pace.dim} days
              </p>
              <p className="mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">
                {formatBDT(Math.round(pace.dailyAvg))}
              </p>
              <div className="mt-4 space-y-1.5 text-sm">
                {pace.income > 0 && (
                  <p>
                    <span className="text-white/70">Finished </span>
                    <span className="font-semibold">
                      {formatBDT(
                        Math.round(Math.abs(pace.income - pace.spent))
                      )}{" "}
                      {pace.spent <= pace.income ? "under" : "over"} income
                    </span>
                  </p>
                )}
                {target !== null && (
                  <p>
                    <span className="text-white/70">Against your target of </span>
                    <span className="font-semibold">
                      {formatBDT(target)} ·{" "}
                      {formatBDT(Math.round(Math.abs(target - pace.spent)))}{" "}
                      {pace.spent <= target ? "under" : "over"}
                    </span>
                  </p>
                )}
                {pace.biggestAmount > 0 && (
                  <p>
                    <span className="text-white/70">Biggest day: </span>
                    <span className="font-semibold">
                      {pace.biggestDay} {monthShort} ·{" "}
                      {formatBDT(Math.round(pace.biggestAmount))}
                    </span>
                  </p>
                )}
                {pace.topCategory && pace.spent > 0 && (
                  <p>
                    <span className="text-white/70">Top category: </span>
                    <span className="font-semibold">
                      {pace.topCategory.name} ·{" "}
                      {formatBDT(Math.round(pace.topCategory.amount))} (
                      {Math.round(
                        (pace.topCategory.amount / pace.spent) * 100
                      )}
                      %)
                    </span>
                  </p>
                )}
                {pace.biggestEntry && (
                  <p>
                    <span className="text-white/70">Biggest entry: </span>
                    <span className="font-semibold">
                      {pace.biggestEntry.label} ·{" "}
                      {formatBDT(Math.round(pace.biggestEntry.amount))} ·{" "}
                      {formatDateShort(pace.biggestEntry.date)}
                    </span>
                  </p>
                )}
                <p>
                  <span className="font-semibold">
                    {pace.entryCount} {pace.entryCount === 1 ? "entry" : "entries"}
                  </span>
                  {pace.prevMonthSpend !== null && (
                    <>
                      <span className="text-white/70"> · </span>
                      <span className="font-semibold">
                        {formatBDT(
                          Math.round(Math.abs(pace.spent - pace.prevMonthSpend))
                        )}{" "}
                        {pace.spent >= pace.prevMonthSpend ? "more" : "less"}
                      </span>
                      <span className="text-white/70">
                        {" "}
                        than {prevMonthName}
                      </span>
                    </>
                  )}
                </p>
                {pace.avgPriorSpend !== null && (
                  <p>
                    <span className="font-semibold">
                      {formatBDT(
                        Math.round(Math.abs(pace.spent - pace.avgPriorSpend))
                      )}{" "}
                      {pace.spent >= pace.avgPriorSpend ? "more" : "less"}
                    </span>
                    <span className="text-white/70">
                      {" "}
                      than your 3-month average
                    </span>
                  </p>
                )}
                {breakdownParts.length > 0 && (
                  <p className="text-white/70">{breakdownParts.join(" · ")}</p>
                )}
              </div>
            </>
          )}
        </div>
        <div>
          <PaceChart
            cumulative={pace.cumulative}
            idealByDay={pace.idealByDay}
            daysShown={pace.daysElapsed}
            dim={pace.dim}
          />
        </div>
      </div>
    </section>
  );
}
