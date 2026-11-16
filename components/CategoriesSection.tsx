"use client";

import { useMemo, useState } from "react";
import {
  TRANSFER_CATEGORY,
  isTransfer,
  type ManagedCategory,
  type Transaction,
  type TxType,
} from "@/lib/types";

interface Props {
  categories: ManagedCategory[];
  transactions: Transaction[];
  onCategoriesChanged: (cats: ManagedCategory[]) => void;
  onTransactionsChanged: () => void;
}

async function postCategories(
  body: Record<string, unknown>
): Promise<{ categories: ManagedCategory[]; renamed?: number }> {
  const res = await fetch("/api/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "Could not save the change.");
  return data;
}

/**
 * One type's column: its categories in order, with entry counts, reorder,
 * rename and delete, plus an add box at the bottom.
 */
function CategoryColumn({
  type,
  list,
  counts,
  busy,
  onMove,
  onRename,
  onDelete,
  onAdd,
}: {
  type: TxType;
  list: ManagedCategory[];
  counts: Map<string, number>;
  busy: boolean;
  onMove: (name: string, dir: -1 | 1) => void;
  onRename: (name: string, newName: string, renameEntries: boolean) => void;
  onDelete: (name: string) => void;
  onAdd: (name: string) => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [renameEntries, setRenameEntries] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [newCat, setNewCat] = useState("");

  const inputCls =
    "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-950";

  return (
    <div>
      <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-500">
        {type === "Debit" ? "For money out" : "For money in"}
      </h3>
      <ul className="mt-3 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 dark:divide-zinc-800/70 dark:border-zinc-800">
        {list.map((c, i) => {
          const count = counts.get(c.name) ?? 0;
          const isRenaming = renaming === c.name;
          const isConfirming = confirmDelete === c.name;
          return (
            <li key={c.name} className="px-3 py-2.5">
              {isRenaming ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                    maxLength={50}
                    className={inputCls}
                  />
                  {count > 0 && (
                    <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                      <input
                        type="checkbox"
                        checked={renameEntries}
                        onChange={(e) => setRenameEntries(e.target.checked)}
                        className="accent-emerald-600"
                      />
                      Also rename the {count} existing entr{count === 1 ? "y" : "ies"}
                    </label>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy || !newName.trim()}
                      onClick={() => {
                        onRename(c.name, newName, renameEntries);
                        setRenaming(null);
                      }}
                      className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenaming(null)}
                      className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium dark:border-zinc-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-zinc-500">
                      {count} entr{count === 1 ? "y" : "ies"}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Move ${c.name} up`}
                    title="Move up"
                    disabled={busy || i === 0}
                    onClick={() => onMove(c.name, -1)}
                    className="rounded-full px-2 py-1 text-sm text-zinc-500 transition hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${c.name} down`}
                    title="Move down"
                    disabled={busy || i === list.length - 1}
                    onClick={() => onMove(c.name, 1)}
                    className="rounded-full px-2 py-1 text-sm text-zinc-500 transition hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Rename ${c.name}`}
                    title="Rename"
                    disabled={busy}
                    onClick={() => {
                      setRenaming(c.name);
                      setNewName(c.name);
                      setRenameEntries(true);
                    }}
                    className="rounded-full px-2 py-1 text-sm text-zinc-500 transition hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    aria-label={
                      count > 0
                        ? `${c.name} still has entries and can't be deleted`
                        : isConfirming
                          ? `Confirm deleting ${c.name}`
                          : `Delete ${c.name}`
                    }
                    title={
                      count > 0
                        ? `Has ${count} entries — rename or delete them first`
                        : "Delete"
                    }
                    disabled={busy || count > 0}
                    onClick={() => {
                      if (isConfirming) {
                        setConfirmDelete(null);
                        onDelete(c.name);
                      } else {
                        setConfirmDelete(c.name);
                      }
                    }}
                    className={`rounded-full px-2 py-1 text-xs font-semibold transition disabled:opacity-40 ${
                      isConfirming
                        ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                        : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {isConfirming ? "Delete?" : "🗑️"}
                  </button>
                </div>
              )}
            </li>
          );
        })}
        {list.length === 0 && (
          <li className="px-3 py-4 text-center text-sm text-zinc-500">
            No categories yet.
          </li>
        )}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newCat.trim()) return;
          onAdd(newCat);
          setNewCat("");
        }}
      >
        <input
          type="text"
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
          placeholder="New category"
          maxLength={50}
          autoComplete="off"
          className={inputCls}
        />
        <button
          type="submit"
          disabled={busy || !newCat.trim()}
          className="shrink-0 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </div>
  );
}

/**
 * Managed categories: every entry belongs to one category, and this is
 * where the list is kept. Entries whose category isn't in the list show as
 * Uncategorised in reports — the bottom section lists them with one-tap
 * adds so the list heals itself.
 */
export function CategoriesSection({
  categories,
  transactions,
  onCategoriesChanged,
  onTransactionsChanged,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const t of transactions) {
      if (isTransfer(t)) continue;
      const byType = map.get(t.type) ?? new Map<string, number>();
      byType.set(t.category, (byType.get(t.category) ?? 0) + 1);
      map.set(t.type, byType);
    }
    return map;
  }, [transactions]);

  const unknown = useMemo(() => {
    const found = new Map<string, { name: string; type: TxType; count: number }>();
    for (const t of transactions) {
      if (isTransfer(t) || t.category === TRANSFER_CATEGORY) continue;
      if (categories.some((c) => c.name === t.category && c.type === t.type)) continue;
      const key = `${t.type} ${t.category}`;
      const entry = found.get(key) ?? { name: t.category, type: t.type, count: 0 };
      entry.count += 1;
      found.set(key, entry);
    }
    return [...found.values()].sort((a, b) => b.count - a.count);
  }, [transactions, categories]);

  const byType = (type: TxType) =>
    categories
      .filter((c) => c.type === type)
      .sort((a, b) => a.order - b.order);

  async function run(fn: () => Promise<{ categories: ManagedCategory[]; renamed?: number }>, reloadTx: boolean) {
    setBusy(true);
    setError(null);
    try {
      const data = await fn();
      onCategoriesChanged(data.categories);
      if (reloadTx) onTransactionsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function move(type: TxType, name: string, dir: -1 | 1) {
    const sub = byType(type);
    const idx = sub.findIndex((c) => c.name === name);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= sub.length) return;
    const next = [...sub];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    const ordered = [
      ...(type === "Debit" ? next : byType("Debit")),
      ...(type === "Credit" ? next : byType("Credit")),
    ];
    void run(
      () =>
        postCategories({
          action: "reorder",
          ordered: ordered.map((c) => ({ name: c.name, type: c.type })),
        }),
      false
    );
  }

  return (
    <div>
      <p className="text-sm text-zinc-500">
        Every entry belongs to one category. Reorder them to change how
        pickers list them.
      </p>
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      )}
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        {(["Debit", "Credit"] as const).map((type) => (
          <CategoryColumn
            key={type}
            type={type}
            list={byType(type)}
            counts={counts.get(type) ?? new Map()}
            busy={busy}
            onMove={(name, dir) => move(type, name, dir)}
            onRename={(name, newName, renameEntries) =>
              void run(
                () =>
                  postCategories({ action: "rename", name, type, newName, renameEntries }),
                renameEntries
              )
            }
            onDelete={(name) =>
              void run(() => postCategories({ action: "delete", name, type }), false)
            }
            onAdd={(name) =>
              void run(() => postCategories({ action: "add", name, type }), false)
            }
          />
        ))}
      </div>

      {unknown.length > 0 && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <h3 className="text-sm font-bold">Categories not in the list</h3>
          <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
            These appear on entries (typed in the sheet or from an import) but
            aren&apos;t in the list, so they show as Uncategorised in reports.
            Add them to make them first-class categories.
          </p>
          <ul className="mt-3 space-y-2">
            {unknown.map((u) => (
              <li key={`${u.type} ${u.name}`} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <span className="font-medium">{u.name}</span>
                  <span className="text-zinc-500">
                    {" "}· {u.type === "Debit" ? "money out" : "money in"} · {u.count} entr
                    {u.count === 1 ? "y" : "ies"}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => postCategories({ action: "add", name: u.name, type: u.type }),
                      false
                    )
                  }
                  className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
