"use client";

import {
  OVERVIEW_SECTION_LABELS,
  type OverviewLayoutItem,
} from "@/lib/types";

/**
 * Customise the Overview (R11): hide sections and reorder them. The layout
 * is stored in localStorage on this device — it travels with the browser,
 * not the sheet, so each device keeps its own arrangement.
 */
export function OverviewCustomiseModal({
  open,
  layout,
  onChange,
  onReset,
  onClose,
}: {
  open: boolean;
  layout: OverviewLayoutItem[];
  onChange: (layout: OverviewLayoutItem[]) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  function move(index: number, dir: -1 | 1) {
    const next = [...layout];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function toggle(index: number) {
    const next = layout.map((item, i) =>
      i === index ? { ...item, visible: !item.visible } : item
    );
    onChange(next);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Customise Overview"
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl dark:bg-zinc-900 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-start justify-between">
          <h2 className="text-lg font-bold tracking-tight">Customise Overview</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full px-2 py-1 text-lg leading-none text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            ×
          </button>
        </div>
        <p className="text-sm text-zinc-500">
          Show, hide, and reorder the sections on your Overview. Hidden
          sections keep their data — they just don&rsquo;t show.
        </p>
        <ul className="mt-4 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 dark:divide-zinc-800/70 dark:border-zinc-800">
          {layout.map((item, i) => (
            <li key={item.id} className="flex items-center gap-1 px-4 py-3">
              <span
                className={`min-w-0 flex-1 truncate text-sm font-medium ${
                  item.visible ? "" : "text-zinc-400 line-through"
                }`}
              >
                {OVERVIEW_SECTION_LABELS[item.id]}
              </span>
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-label={
                  item.visible
                    ? `Hide ${OVERVIEW_SECTION_LABELS[item.id]}`
                    : `Show ${OVERVIEW_SECTION_LABELS[item.id]}`
                }
                title={item.visible ? "Hide" : "Show"}
                className="rounded-full px-2 py-1 text-base transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {item.visible ? "👁️" : "🚫"}
              </button>
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={`Move ${OVERVIEW_SECTION_LABELS[item.id]} up`}
                className="rounded-full px-2 py-1 text-sm text-zinc-500 transition hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === layout.length - 1}
                aria-label={`Move ${OVERVIEW_SECTION_LABELS[item.id]} down`}
                className="rounded-full px-2 py-1 text-sm text-zinc-500 transition hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
              >
                ↓
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between">
          <button
            type="button"
            onClick={onReset}
            className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Reset to default
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
