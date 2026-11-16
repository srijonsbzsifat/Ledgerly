"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDateShort, type Note } from "@/lib/types";

/**
 * Notes: kept in the sheet's Notes tab, so they travel with the sheet.
 * A bill to pay, money lent, a shopping list — anything worth keeping.
 */
export function NotesSection() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notes", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not load notes.");
      setNotes(data.notes as Note[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() && !body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editing
            ? { action: "update", id: editing.id, row: editing.row, title, body }
            : { action: "add", title, body }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not save the note.");
      setTitle("");
      setBody("");
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(note: Note) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: note.id, row: note.row }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not delete the note.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-950";

  if (loading) {
    return <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>;
  }

  return (
    <div>
      <p className="text-sm text-zinc-500">
        Kept in the Notes tab of this sheet. Write down anything worth keeping:
        a bill to pay, money you lent, a shopping list.
      </p>
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      )}

      <form onSubmit={save} className="mt-4 space-y-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          maxLength={200}
          className={inputCls}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your note…"
          rows={3}
          maxLength={5000}
          className={`${inputCls} resize-y`}
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy || (!title.trim() && !body.trim())}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
          >
            {busy ? "Saving…" : editing ? "Save changes" : "+ New note"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setTitle("");
                setBody("");
              }}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium dark:border-zinc-700"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {notes.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No notes yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {notes.map((n) => {
            const isConfirming = confirmId === n.id;
            return (
              <li key={n.id} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {n.title && <p className="font-semibold">{n.title}</p>}
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
                      {n.body}
                    </p>
                    {n.created && (
                      <p className="mt-2 text-xs text-zinc-400">{formatDateShort(n.created)}</p>
                    )}
                  </div>
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      aria-label="Edit note"
                      disabled={busy}
                      onClick={() => {
                        setEditing(n);
                        setTitle(n.title);
                        setBody(n.body);
                      }}
                      className="rounded-full px-2 py-1 text-sm text-zinc-500 transition hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      aria-label={isConfirming ? "Confirm deleting note" : "Delete note"}
                      disabled={busy}
                      onClick={() => {
                        if (isConfirming) {
                          setConfirmId(null);
                          void remove(n);
                        } else {
                          setConfirmId(n.id);
                        }
                      }}
                      className={`rounded-full px-2 py-1 text-xs font-semibold transition disabled:opacity-50 ${
                        isConfirming
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                          : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {isConfirming ? "Delete?" : "🗑️"}
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
