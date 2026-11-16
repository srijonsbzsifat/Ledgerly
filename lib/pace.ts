import {
  isTransfer,
  parseISODate,
  patternKey,
  type MarkedPattern,
  type Transaction,
} from "./types";

/**
 * Smart pace math (Phase 1 fix, 2026-11-16).
 *
 * The naive version projected with a straight line — spent so far × days in
 * month ÷ days elapsed — which treats a ৳60,000 home loan paid on day 1 as
 * if it recurs every day. November's projection came out ৳2,00,835 ("over
 * income") when the real month-end figure is ~৳1,23,000.
 *
 * The fix splits each month's spending three ways:
 * - Fixed: the same entry (category + description) that recurs month after
 *   month at a similar amount, at most twice a month. Detected from the
 *   sheet's own history — no tagging needed. (Home loan, dialysis, tuition.)
 * - One-off: a single entry far above the month's typical daily spend
 *   (≥ max(৳5,000, 5× the median daily spend)) that doesn't recur.
 *   (Land investment, a big one-time purchase.)
 * - Everyday: everything else — the only part that gets extrapolated.
 *
 * Projection = spent so far (all of it) + everyday daily rate × days left
 * + fixed costs still to come. Safe-to-spend reserves for fixed costs that
 * are expected later in the month (a pattern seen in ≥2 earlier months,
 * whose usual day hasn't passed yet). The pace chart's ideal line is
 * stepped: fixed costs land on their actual/expected days, and only the
 * everyday budget is spread evenly.
 *
 * Phase 3 (R12): the reservation also covers fixed costs whose usual day
 * has passed without landing — a fixed cost that hasn't landed is still
 * owed, just late. `expectedPayments` returns the same fixed set as a
 * visible list (paid / upcoming / overdue / missed) for the Overview.
 *
 * The user can also mark patterns in Manage > Recurring (stored in the
 * sheet's Recurring tab, passed in as `marked`). An active mark makes a
 * pattern fixed immediately — no history needed — and reservable from day
 * one. A paused or dismissed mark removes the pattern from fixed costs
 * entirely, even if the history says it recurs.
 *
 * Phase 2 (R5): when the user sets a monthly target (stored in the sheet's
 * Budgets tab, passed in as `target`), the target becomes the baseline —
 * safe-to-spend, the projection verdict, and the ideal line all measure
 * against it instead of income. Without a target, income (or the 3-month
 * average income) is the baseline as before.
 *
 * A misclassification between fixed and one-off is harmless — both are
 * excluded from the everyday rate. It only affects the upcoming reservation.
 */

export interface FixedPattern {
  key: string;
  label: string;
  medianAmount: number;
  medianDay: number;
  /** Months in the detection window where this pattern appears. */
  monthsSeen: number;
  /** True when the user marked this pattern — their word beats history. */
  marked?: boolean;
}

export interface UpcomingFixed {
  label: string;
  amount: number;
  day: number; // expected day of the month
}

export interface PaceData {
  dim: number;
  daysElapsed: number;
  daysRemaining: number;
  isCurrent: boolean;
  isPast: boolean;
  isFuture: boolean;
  spent: number;
  income: number;
  entryCount: number;
  fixedSpent: number;
  oneOffSpent: number;
  everydaySpent: number;
  upcomingFixed: UpcomingFixed[];
  upcomingFixedTotal: number;
  baseline: { value: number; label: string } | null;
  /** Baseline minus the fixed costs expected this month (paid + upcoming). */
  everydayBudget: number | null;
  /** Baseline minus spent so far minus upcoming fixed costs. */
  left: number | null;
  safePerDay: number | null;
  everydayRate: number;
  projection: number | null;
  showProjection: boolean;
  /** Actual cumulative spend by day (length dim). */
  cumulative: number[];
  /** Ideal cumulative by day (length dim), stepped for fixed costs; null
      when there is no baseline to pace against. */
  idealByDay: number[] | null;
  biggestDay: number;
  biggestAmount: number;
  avgPriorSpend: number | null;
  dailyAvg: number;
  /** The previous month's total spend (null when there is none). */
  prevMonthSpend: number | null;
  /** The month's top spending category (R9 month-in-review). */
  topCategory: { name: string; amount: number } | null;
  /** The month's single biggest entry (R9 month-in-review). */
  biggestEntry: { label: string; amount: number; date: string } | null;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function monthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function entryLabel(t: Transaction): string {
  return t.description || t.category;
}

/** A fixed cost recurs at a similar amount: max/min spread at most 30%. */
const AMOUNT_SPREAD_MAX = 1.3;
/** A fixed cost appears at most twice in any month it appears in. */
const FIXED_MAX_PER_MONTH = 2;
/** A one-off is at least this much, or this many times the median day. */
const ONE_OFF_MIN = 5000;
const ONE_OFF_MEDIAN_MULTIPLE = 5;

/**
 * Detect fixed (recurring) spending patterns around a month: the same
 * entry (category + description) appearing in at least one of the 3 months
 * either side, at most twice per month wherever it appears, with all
 * amounts within a 30% spread. The window is ±3 months so a past month's
 * breakdown can use hindsight (a cost that recurred next month was fixed
 * this month too). Patterns are returned whether or not they appear in the
 * selected month itself — the ones that don't are the reservation
 * candidates. Exported for the Manage > Recurring section, which shows
 * what the app figured out on its own.
 */
export function detectFixedPatterns(
  transactions: Transaction[],
  year: number,
  month: number // 1-12
): FixedPattern[] {
  const selIdx = monthIndex(year, month);
  const windowIdx = new Set<number>();
  for (let k = 1; k <= 3; k++) {
    windowIdx.add(selIdx - k);
    windowIdx.add(selIdx + k);
  }
  // key -> monthIdx -> { count, amounts, days } (window months only)
  const windowGroups = new Map<
    string,
    Map<number, { count: number; amounts: number[]; days: number[] }>
  >();
  // key -> entries in the selected month (for the spread check)
  const monthEntries = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const p = parseISODate(t.date);
    if (!p || isTransfer(t) || t.type !== "Debit") continue;
    const idx = monthIndex(p.year, p.month);
    const key = patternKey(t.category, t.description);
    if (idx === selIdx) {
      const arr = monthEntries.get(key) ?? [];
      arr.push(t);
      monthEntries.set(key, arr);
    } else if (windowIdx.has(idx)) {
      let byMonth = windowGroups.get(key);
      if (!byMonth) {
        byMonth = new Map();
        windowGroups.set(key, byMonth);
      }
      let slot = byMonth.get(idx);
      if (!slot) {
        slot = { count: 0, amounts: [], days: [] };
        byMonth.set(idx, slot);
      }
      slot.count += 1;
      slot.amounts.push(t.amount);
      slot.days.push(p.day);
    }
  }

  const patterns: FixedPattern[] = [];
  for (const [key, byMonth] of windowGroups) {
    const inMonth = monthEntries.get(key) ?? [];
    if (inMonth.length > FIXED_MAX_PER_MONTH) continue;
    let monthsSeen = 0;
    const amounts: number[] = inMonth.map((t) => t.amount);
    const days: number[] = inMonth.map(
      (t) => parseISODate(t.date)?.day ?? 1
    );
    let label = "";
    let ok = true;
    for (const [, slot] of byMonth) {
      if (slot.count > FIXED_MAX_PER_MONTH) {
        ok = false;
        break;
      }
      monthsSeen += 1;
      amounts.push(...slot.amounts);
      days.push(...slot.days);
    }
    if (!ok || monthsSeen < 1) continue;
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    if (min <= 0 || max / min > AMOUNT_SPREAD_MAX) continue;
    // Label from the selected month's entry when there is one, else from
    // the key itself ("Category / Description" -> the description part).
    label =
      inMonth.length > 0
        ? entryLabel(inMonth[0])
        : key.includes(" / ")
          ? key.slice(key.indexOf(" / ") + 3)
          : key;
    patterns.push({
      key,
      label,
      medianAmount: median(amounts),
      medianDay: Math.round(median(days)),
      monthsSeen,
    });
  }
  return patterns.sort((a, b) => b.medianAmount - a.medianAmount);
}

/**
 * The fixed patterns for a month: detected from history, then the user's
 * marks overlaid (an active mark makes a pattern fixed immediately with
 * the user's amount/day; a paused or dismissed mark removes it entirely).
 * Shared by computePace and expectedPayments so the pace math and the
 * "expected still to come" list (R12) always agree.
 */
export function buildFixedPatterns(
  transactions: Transaction[],
  year: number,
  month: number, // 1-12
  marked: MarkedPattern[] = []
): Map<string, FixedPattern> {
  const fixedPatterns = new Map<string, FixedPattern>(
    detectFixedPatterns(transactions, year, month).map((p) => [p.key, p])
  );
  for (const m of marked) {
    const key = patternKey(m.category, m.description);
    if (m.status === "paused" || m.status === "dismissed") {
      // A pause or a dismissal overrides detection: never fixed, never reserved.
      fixedPatterns.delete(key);
      continue;
    }
    const existing = fixedPatterns.get(key);
    fixedPatterns.set(key, {
      key,
      label: m.description || m.category,
      medianAmount: m.amount,
      medianDay: m.day,
      monthsSeen: existing?.monthsSeen ?? 0,
      marked: true,
    });
  }
  return fixedPatterns;
}

/** One recurring payment expected in a month (R12). */
export interface ExpectedPayment {
  key: string;
  label: string;
  /** Expected amount (median or the user's marked amount). */
  amount: number;
  /** Expected day of the month. */
  day: number;
  /** paid: it landed; upcoming: day still ahead; overdue: day passed in
      the current month and it hasn't landed; missed: a past month it
      never landed in. */
  status: "paid" | "upcoming" | "overdue" | "missed";
  /** Actual amount + date when paid (may differ from expected). */
  paidAmount?: number;
  paidDate?: string;
  marked?: boolean;
}

/**
 * The recurring payments expected in a month (R12): what has landed and
 * what is still to come. Same quality bar as Manage > Recurring — a
 * marked pattern, one that landed this month, or one with ≥2 months of
 * history — so one-off coincidences never appear as expectations.
 */
export function expectedPayments(
  transactions: Transaction[],
  year: number,
  month: number, // 1-12
  today: Date = new Date(),
  marked: MarkedPattern[] = []
): ExpectedPayment[] {
  const fixedPatterns = buildFixedPatterns(transactions, year, month, marked);
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;
  const todayDay = today.getDate();
  const isCurrent = year === todayYear && month === todayMonth;
  const isPast = year < todayYear || (year === todayYear && month < todayMonth);

  // What landed this month, by pattern key (sum + latest date), and the
  // earliest month each key appears in — so a pattern that started later
  // never shows as "missed" in an earlier month.
  const landed = new Map<string, { amount: number; date: string }>();
  const firstSeen = new Map<string, number>();
  const selIdx = monthIndex(year, month);
  for (const t of transactions) {
    const p = parseISODate(t.date);
    if (!p || isTransfer(t) || t.type !== "Debit") continue;
    const key = patternKey(t.category, t.description);
    const idx = monthIndex(p.year, p.month);
    if (!firstSeen.has(key) || idx < (firstSeen.get(key) ?? Infinity)) {
      firstSeen.set(key, idx);
    }
    if (idx !== selIdx) continue;
    const prev = landed.get(key);
    landed.set(key, {
      amount: (prev?.amount ?? 0) + t.amount,
      date: !prev || t.date > prev.date ? t.date : prev.date,
    });
  }

  const out: ExpectedPayment[] = [];
  for (const pattern of fixedPatterns.values()) {
    const paid = landed.get(pattern.key);
    if (!pattern.marked && !paid && pattern.monthsSeen < 2) continue;
    const first = firstSeen.get(pattern.key);
    if (first !== undefined && selIdx < first) continue;
    const base = {
      key: pattern.key,
      label: pattern.label,
      amount: pattern.medianAmount,
      day: pattern.medianDay,
      marked: pattern.marked,
    };
    if (paid) {
      out.push({
        ...base,
        status: "paid",
        paidAmount: paid.amount,
        paidDate: paid.date,
      });
    } else if (isCurrent && pattern.medianDay >= todayDay) {
      // Due today or later this month — due today is not overdue yet.
      out.push({ ...base, status: "upcoming" });
    } else if (isCurrent) {
      out.push({ ...base, status: "overdue" });
    } else if (isPast) {
      out.push({ ...base, status: "missed" });
    } else {
      out.push({ ...base, status: "upcoming" });
    }
  }
  out.sort((a, b) => a.day - b.day);
  return out;
}

export function computePace(
  transactions: Transaction[],
  year: number,
  month: number, // 1-12
  today: Date = new Date(),
  /** Patterns the user marked in Manage > Recurring (their word beats history). */
  marked: MarkedPattern[] = [],
  /** The month's spending target (R5), when one is set — it becomes the baseline. */
  target: number | null = null
): PaceData {
  const dim = daysInMonth(year, month);
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;
  const todayDay = today.getDate();

  const isCurrent = year === todayYear && month === todayMonth;
  const isPast = year < todayYear || (year === todayYear && month < todayMonth);
  const isFuture = !isCurrent && !isPast;

  const daysElapsed = isCurrent ? todayDay : isPast ? dim : 0;
  const daysRemaining = isCurrent ? dim - todayDay + 1 : 0;

  const selIdx = monthIndex(year, month);
  const priorIdx = [selIdx - 1, selIdx - 2, selIdx - 3];

  // ---- One pass over the transactions -----------------------------------
  const dailyTotals = Array.from({ length: dim }, () => 0);
  let spent = 0;
  let income = 0;
  let entryCount = 0;
  const monthDebit: Transaction[] = [];
  const priorSpendByIdx = new Map<number, number>();
  const priorIncomeByIdx = new Map<number, number>();

  for (const t of transactions) {
    const p = parseISODate(t.date);
    if (!p) continue;
    const idx = monthIndex(p.year, p.month);
    if (idx === selIdx) {
      entryCount += 1;
      if (isTransfer(t)) continue;
      if (t.type === "Credit") income += t.amount;
      else {
        spent += t.amount;
        dailyTotals[p.day - 1] += t.amount;
        monthDebit.push(t);
      }
    }
    if (priorIdx.includes(idx) && !isTransfer(t)) {
      if (t.type === "Credit")
        priorIncomeByIdx.set(idx, (priorIncomeByIdx.get(idx) ?? 0) + t.amount);
      else
        priorSpendByIdx.set(idx, (priorSpendByIdx.get(idx) ?? 0) + t.amount);
    }
  }

  // ---- Fixed patterns: detected, then the user's marks overlaid -----------
  const fixedPatterns = buildFixedPatterns(transactions, year, month, marked);
  const monthKeys = new Set<string>();
  for (const t of monthDebit) {
    monthKeys.add(patternKey(t.category, t.description));
  }

  // ---- Classify the selected month's spending ----------------------------
  // Median daily spend over completed days (today excluded — it isn't over).
  const completedDays = isCurrent ? Math.max(todayDay - 1, 0) : dim;
  const medianDaily = median(
    dailyTotals.slice(0, completedDays > 0 ? completedDays : daysElapsed)
  );
  const oneOffThreshold = Math.max(
    ONE_OFF_MIN,
    ONE_OFF_MEDIAN_MULTIPLE * medianDaily
  );

  let fixedSpent = 0;
  let oneOffSpent = 0;
  let everydaySpent = 0;
  const fixedByDay = Array.from({ length: dim }, () => 0);
  for (const t of monthDebit) {
    const day = parseISODate(t.date)?.day ?? 1;
    if (fixedPatterns.has(patternKey(t.category, t.description))) {
      fixedSpent += t.amount;
      fixedByDay[day - 1] += t.amount;
    } else if (t.amount >= oneOffThreshold) {
      oneOffSpent += t.amount;
    } else {
      everydaySpent += t.amount;
    }
  }

  // ---- Upcoming fixed costs (live month only) ----------------------------
  // Reserve for a pattern that hasn't landed yet this month — either the
  // user marked it (their word is enough) or it was seen in ≥2 window
  // months (history proved it recurs). That includes patterns whose usual
  // day has already passed: a fixed cost that hasn't landed is still owed,
  // just late — the Expected list shows it as overdue, and the pace card
  // reserves for it instead of pretending the money is free.
  const upcomingFixed: UpcomingFixed[] = [];
  if (isCurrent) {
    for (const pattern of fixedPatterns.values()) {
      if (!pattern.marked && pattern.monthsSeen < 2) continue;
      if (monthKeys.has(pattern.key)) continue; // already paid
      upcomingFixed.push({
        label: pattern.label,
        amount: pattern.medianAmount,
        day: pattern.medianDay,
      });
    }
    upcomingFixed.sort((a, b) => a.day - b.day);
  }
  const upcomingFixedTotal = upcomingFixed.reduce((s, u) => s + u.amount, 0);

  // ---- Baseline + pace numbers -------------------------------------------
  const priorSpend: number[] = [];
  const priorIncome: number[] = [];
  for (const idx of priorIdx) {
    const s = priorSpendByIdx.get(idx) ?? 0;
    const i = priorIncomeByIdx.get(idx) ?? 0;
    if (s > 0) priorSpend.push(s);
    if (i > 0) priorIncome.push(i);
  }
  const avgPriorSpend =
    priorSpend.length > 0
      ? priorSpend.reduce((a, b) => a + b, 0) / priorSpend.length
      : null;
  const avgPriorIncome =
    priorIncome.length > 0
      ? priorIncome.reduce((a, b) => a + b, 0) / priorIncome.length
      : null;

  const baseline =
    target !== null && target > 0
      ? { value: target, label: "target" }
      : income > 0
        ? { value: income, label: "income" }
        : avgPriorIncome !== null
          ? { value: avgPriorIncome, label: "average income" }
          : null;

  const everydayBudget = baseline
    ? Math.max(baseline.value - fixedSpent - upcomingFixedTotal, 0)
    : null;
  const left = baseline ? baseline.value - spent - upcomingFixedTotal : null;
  const safePerDay =
    baseline && daysRemaining > 0 ? left! / daysRemaining : null;
  const everydayRate = daysElapsed > 0 ? everydaySpent / daysElapsed : 0;

  // Projection: everything already spent, plus the everyday rate for the
  // days left, plus fixed costs still to come. Hidden until 10% of the
  // month has passed and something has been spent.
  const showProjection =
    isCurrent && daysElapsed / dim >= 0.1 && spent > 0;
  const projection = showProjection
    ? spent + everydayRate * daysRemaining + upcomingFixedTotal
    : null;

  // ---- Cumulative lines ----------------------------------------------------
  const cumulative: number[] = [];
  let running = 0;
  for (const v of dailyTotals) {
    running += v;
    cumulative.push(running);
  }
  let idealByDay: number[] | null = null;
  if (baseline && everydayBudget !== null) {
    idealByDay = [];
    let fixedSoFar = 0;
    for (let d = 1; d <= dim; d++) {
      fixedSoFar += fixedByDay[d - 1];
      const upcomingByDay = upcomingFixed
        .filter((u) => u.day <= d)
        .reduce((s, u) => s + u.amount, 0);
      idealByDay.push(
        fixedSoFar + upcomingByDay + (everydayBudget * d) / dim
      );
    }
  }

  let biggestDay = 0;
  let biggestAmount = 0;
  dailyTotals.forEach((v, i) => {
    if (v > biggestAmount) {
      biggestAmount = v;
      biggestDay = i + 1;
    }
  });

  // ---- Month-in-review facts (R9) ----------------------------------------
  // Top spending category and the single biggest entry of the month.
  const spendByCategory = new Map<string, number>();
  let biggestEntry: PaceData["biggestEntry"] = null;
  for (const t of monthDebit) {
    spendByCategory.set(
      t.category,
      (spendByCategory.get(t.category) ?? 0) + t.amount
    );
    if (!biggestEntry || t.amount > biggestEntry.amount) {
      biggestEntry = { label: entryLabel(t), amount: t.amount, date: t.date };
    }
  }
  let topCategory: PaceData["topCategory"] = null;
  for (const [name, amount] of spendByCategory) {
    if (!topCategory || amount > topCategory.amount) {
      topCategory = { name, amount };
    }
  }
  const prevSpend = priorSpendByIdx.get(selIdx - 1) ?? 0;
  const prevMonthSpend = prevSpend > 0 ? prevSpend : null;

  return {
    dim,
    daysElapsed,
    daysRemaining,
    isCurrent,
    isPast,
    isFuture,
    spent,
    income,
    entryCount,
    fixedSpent,
    oneOffSpent,
    everydaySpent,
    upcomingFixed,
    upcomingFixedTotal,
    baseline,
    everydayBudget,
    left,
    safePerDay,
    everydayRate,
    projection,
    showProjection,
    cumulative,
    idealByDay,
    biggestDay,
    biggestAmount,
    avgPriorSpend,
    dailyAvg: daysElapsed > 0 ? spent / daysElapsed : 0,
    prevMonthSpend,
    topCategory,
    biggestEntry,
  };
}

/**
 * Suggest a monthly target from history (R5, propose-and-approve): the
 * median of the completed months' total spending, rounded to the nearest
 * ৳1,000. Only months that have fully ended and fall before the selected
 * month count. Null when no month has completed yet.
 */
export function suggestMonthlyTarget(
  transactions: Transaction[],
  year: number,
  month: number, // 1-12
  today: Date = new Date()
): number | null {
  const selIdx = monthIndex(year, month);
  const todayIdx = monthIndex(today.getFullYear(), today.getMonth() + 1);
  const spendByIdx = new Map<number, number>();
  for (const t of transactions) {
    const p = parseISODate(t.date);
    if (!p || isTransfer(t) || t.type !== "Debit") continue;
    const idx = monthIndex(p.year, p.month);
    if (idx >= selIdx || idx >= todayIdx) continue;
    spendByIdx.set(idx, (spendByIdx.get(idx) ?? 0) + t.amount);
  }
  const months = [...spendByIdx.values()].filter((s) => s > 0);
  if (months.length === 0) return null;
  return Math.round(median(months) / 1000) * 1000;
}
