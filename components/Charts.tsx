"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ACCENTS,
  EXPENSE_COLOR,
  EXPENSE_COLOR_LIGHT,
  PIE_COLORS,
  formatBDT,
  type AccentName,
} from "@/lib/types";
import { useTheme } from "./ThemeProvider";

export interface MonthlyPoint {
  month: string;
  income: number;
  expense: number;
}

export interface CategoryPoint {
  name: string;
  value: number;
}

function compact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `৳${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `৳${(n / 1_000).toFixed(1)}k`;
  return `৳${n}`;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color?: string; payload?: { fill?: string } }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      {label && <p className="mb-1 font-semibold">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 py-0.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: p.color ?? p.payload?.fill ?? "#888" }}
          />
          <span className="text-zinc-500 dark:text-zinc-400">{p.name}:</span>
          <span className="font-semibold">{formatBDT(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export function MonthlyBarChart({ data }: { data: MonthlyPoint[] }) {
  const { mode, accent } = useTheme();
  const a: AccentName = accent;
  const income = ACCENTS[a].chart;
  const incomeLight = ACCENTS[a].chartLight;
  const grid = mode === "dark" ? "#3f3f46" : "#e4e4e7";
  const tick = mode === "dark" ? "#a1a1aa" : "#71717a";

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
          <defs>
            <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={income} stopOpacity={1} />
              <stop offset="100%" stopColor={incomeLight} stopOpacity={0.85} />
            </linearGradient>
            <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={EXPENSE_COLOR} stopOpacity={1} />
              <stop offset="100%" stopColor={EXPENSE_COLOR_LIGHT} stopOpacity={0.85} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={grid} />
          <XAxis
            dataKey="month"
            tick={{ fill: tick, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            dy={6}
          />
          <YAxis
            tick={{ fill: tick, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={compact}
            width={64}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: mode === "dark" ? "#27272a" : "#f4f4f5" }} />
          <Bar dataKey="income" name="Income" fill="url(#incomeGrad)" radius={[6, 6, 0, 0]} maxBarSize={28} />
          <Bar dataKey="expense" name="Expenses" fill="url(#expenseGrad)" radius={[6, 6, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex items-center justify-center gap-6 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: income }} /> Income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: EXPENSE_COLOR }} /> Expenses
        </span>
      </div>
    </div>
  );
}

export interface SingleBarPoint {
  label: string;
  value: number;
}

/**
 * One-series bar chart (daily trend, month-to-month). When highlightIndex
 * is set, that bar gets the full accent colour and the rest are muted.
 */
export function SingleBarChart({
  data,
  highlightIndex,
  maxBarSize = 28,
  heightClass = "h-64",
}: {
  data: SingleBarPoint[];
  highlightIndex?: number;
  maxBarSize?: number;
  heightClass?: string;
}) {
  const { mode, accent } = useTheme();
  const a: AccentName = accent;
  const bar = ACCENTS[a].chart;
  const barLight = ACCENTS[a].chartLight;
  const muted = mode === "dark" ? "#3f3f46" : "#d4d4d8";
  const grid = mode === "dark" ? "#3f3f46" : "#e4e4e7";
  const tick = mode === "dark" ? "#a1a1aa" : "#71717a";

  return (
    <div className={`${heightClass} w-full`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
          <defs>
            <linearGradient id="singleGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={bar} stopOpacity={1} />
              <stop offset="100%" stopColor={barLight} stopOpacity={0.85} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={grid} />
          <XAxis
            dataKey="label"
            tick={{ fill: tick, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            dy={6}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: tick, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={compact}
            width={64}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ fill: mode === "dark" ? "#27272a" : "#f4f4f5" }}
          />
          <Bar dataKey="value" name="Spent" radius={[6, 6, 0, 0]} maxBarSize={maxBarSize}>
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={
                  highlightIndex === undefined || i === highlightIndex
                    ? "url(#singleGrad)"
                    : muted
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryDonut({ data }: { data: CategoryPoint[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
      <div className="h-52 w-52 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<ChartTooltip />} />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={62}
              outerRadius={92}
              paddingAngle={2}
              cornerRadius={5}
              strokeWidth={0}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-2">
        {data.slice(0, 8).map((d, i) => (
          <li key={d.name} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
            />
            <span className="min-w-0 flex-1 truncate">{d.name}</span>
            <span className="shrink-0 font-semibold">{formatBDT(d.value)}</span>
            <span className="w-11 shrink-0 text-right text-xs text-zinc-500">
              {total > 0 ? `${Math.round((d.value / total) * 100)}%` : "—"}
            </span>
          </li>
        ))}
        {data.length > 8 && (
          <li className="text-xs text-zinc-500">
            + {data.length - 8} more categor{data.length - 8 === 1 ? "y" : "ies"}
          </li>
        )}
      </ul>
    </div>
  );
}
