"use client";

import { useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import {
  MONTHS,
  formatBDT,
  isTransfer,
  parseISODate,
  totalsOf,
  type Transaction,
  type TxType,
} from "@/lib/types";

interface Props {
  transactions: Transaction[];
  sheetTitle: string;
  onTransactionsChanged: () => void;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(filename: string, content: string | Blob, mime: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Minimal CSV parser: quoted fields, escaped quotes, CRLF/LF rows. */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return parseISODate(s) ? s : null;
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s); // day first
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return parseISODate(iso) ? iso : null;
  }
  return null;
}

function parseType(raw: string): TxType | null {
  const s = raw.trim().toLowerCase();
  if (["debit", "expense", "out", "money out", "spent"].includes(s)) return "Debit";
  if (["credit", "income", "in", "money in", "earned"].includes(s)) return "Credit";
  return null;
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[৳$€£,\s]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

type ColKey = "date" | "type" | "category" | "description" | "amount" | "account" | "ignore";

const COL_LABELS: Record<ColKey, string> = {
  date: "Date",
  type: "Type",
  category: "Category",
  description: "Description",
  amount: "Amount",
  account: "Account",
  ignore: "Ignore this column",
};

function guessColumn(header: string): ColKey {
  const h = header.trim().toLowerCase();
  if (["date", "day", "transaction date"].includes(h)) return "date";
  if (["type", "debit/credit", "direction"].includes(h)) return "type";
  if (["category", "cat"].includes(h)) return "category";
  if (["description", "desc", "details", "note", "memo", "particulars"].includes(h)) return "description";
  if (["amount", "value", "sum", "total"].includes(h)) return "amount";
  if (["account", "linked account"].includes(h)) return "account";
  return "ignore";
}

interface ParsedRow {
  date: string | null;
  type: TxType | null;
  category: string;
  description: string;
  amount: number | null;
  account: string;
  valid: boolean;
  reason: string;
}

/**
 * Import and export: take transactions out as a CSV backup, a CSV statement
 * or a PDF statement, or bring them in from a CSV file (a bank statement or
 * a Ledgerly backup) with a preview before anything is added.
 */
export function ImportExportSection({ transactions, sheetTitle, onTransactionsChanged }: Props) {
  const [exportMonth, setExportMonth] = useState("all");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColKey[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const monthsWithData = useMemo(() => {
    const set = new Set<number>();
    for (const t of transactions) {
      const p = parseISODate(t.date);
      if (p) set.add(p.month - 1);
    }
    return [...set].sort((a, b) => a - b);
  }, [transactions]);

  const exportTx = useMemo(() => {
    const list =
      exportMonth === "all"
        ? transactions
        : transactions.filter((t) => (parseISODate(t.date)?.month ?? 0) - 1 === Number(exportMonth));
    return [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [transactions, exportMonth]);

  const exportLabel =
    exportMonth === "all" ? "all months" : MONTHS[Number(exportMonth)];

  function exportBackup() {
    const header = ["ID", "Date", "Type", "Category", "Description", "Amount", "Currency", "Linked account", "Link ID", "Notes"];
    const lines = [header.map(csvCell).join(",")];
    for (const t of exportTx) {
      lines.push(
        [t.id, t.date, t.type, t.category, t.description, t.amount, t.currency, t.linkedAccount ?? "", t.linkId ?? "", ""]
          .map(csvCell)
          .join(",")
      );
    }
    download(`ledgerly-backup-${exportLabel.replace(/ /g, "-").toLowerCase()}.csv`, lines.join("\n"), "text/csv");
  }

  function exportStatement() {
    const header = ["Date", "Type", "Category", "Description", "Amount"];
    const lines = [header.map(csvCell).join(",")];
    for (const t of exportTx) {
      if (isTransfer(t)) continue;
      lines.push([t.date, t.type, t.category, t.description, t.amount].map(csvCell).join(","));
    }
    download(`ledgerly-statement-${exportLabel.replace(/ /g, "-").toLowerCase()}.csv`, lines.join("\n"), "text/csv");
  }

  function exportPDF() {
    const doc = new jsPDF();
    const totals = totalsOf(exportTx);
    const money = (n: number) => `BDT ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
    doc.setFontSize(18);
    doc.text("Ledgerly statement", 14, 18);
    doc.setFontSize(11);
    doc.text(`${sheetTitle} — ${exportLabel}`, 14, 26);
    doc.text(`Income ${money(totals.income)}  ·  Spent ${money(totals.expense)}  ·  Net ${money(totals.balance)}`, 14, 33);
    let y = 44;
    doc.setFontSize(10);
    const rows = exportTx.filter((t) => !isTransfer(t));
    doc.text("Date", 14, y);
    doc.text("Description", 40, y);
    doc.text("Category", 110, y);
    doc.text("Amount", 196, y, { align: "right" });
    y += 3;
    doc.line(14, y, 196, y);
    y += 6;
    for (const t of rows) {
      if (y > 275) {
        doc.addPage();
        y = 18;
      }
      doc.text(t.date, 14, y);
      doc.text((t.description || t.category).slice(0, 42), 40, y);
      doc.text(t.category.slice(0, 20), 110, y);
      doc.text(`${t.type === "Credit" ? "+" : "-"}${money(t.amount)}`, 196, y, { align: "right" });
      y += 6;
    }
    doc.save(`ledgerly-statement-${exportLabel.replace(/ /g, "-").toLowerCase()}.pdf`);
  }

  function onFile(file: File | null) {
    setError(null);
    setImportResult(null);
    if (!file) return;
    setFileName(file.name);
    void file.text().then((text) => {
      const rows = parseCSV(text);
      if (rows.length < 2) {
        setError("That file has no data rows.");
        setHeaders([]);
        setRawRows([]);
        return;
      }
      const [head, ...body] = rows;
      setHeaders(head);
      setMapping(head.map(guessColumn));
      setRawRows(body.slice(0, 500));
      if (body.length > 500) {
        setError("Only the first 500 rows were kept — import in batches of 500.");
      }
    });
  }

  const parsedRows: ParsedRow[] = useMemo(() => {
    if (headers.length === 0) return [];
    return rawRows.map((row) => {
      const get = (key: ColKey): string => {
        const idx = mapping.indexOf(key);
        return idx >= 0 ? (row[idx] ?? "") : "";
      };
      const date = parseDate(get("date"));
      const rawAmount = parseAmount(get("amount"));
      let type = parseType(get("type"));
      let amount = rawAmount === null ? null : Math.abs(rawAmount);
      if (!type && rawAmount !== null && rawAmount !== 0) {
        // No type column (a bank statement): the sign decides.
        type = rawAmount < 0 ? "Debit" : "Credit";
      }
      const category = get("category").trim();
      const reason =
        !date ? "bad date"
        : !type ? "bad type"
        : !category ? "missing category"
        : amount === null || amount <= 0 ? "bad amount"
        : "";
      return {
        date,
        type,
        category,
        description: get("description").trim(),
        amount,
        account: get("account").trim(),
        valid: reason === "",
        reason,
      };
    });
  }, [headers, mapping, rawRows]);

  const validCount = parsedRows.filter((r) => r.valid).length;
  const hasRequiredMapping =
    mapping.includes("date") && mapping.includes("category") && mapping.includes("amount");

  async function doImport() {
    const valid = parsedRows.filter((r) => r.valid);
    if (valid.length === 0) return;
    setImporting(true);
    setError(null);
    setImportResult(null);
    try {
      const res = await fetch("/api/transactions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: valid.map((r) => ({
            date: r.date,
            type: r.type,
            category: r.category,
            description: r.description,
            amount: r.amount,
            linkedAccount: r.account || undefined,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not import.");
      const skipped = parsedRows.length - valid.length + (data.failed?.length ?? 0);
      setImportResult(
        `Imported ${data.imported} entr${data.imported === 1 ? "y" : "ies"}` +
          (skipped > 0 ? `, skipped ${skipped} row${skipped === 1 ? "" : "s"}.` : ".")
      );
      setHeaders([]);
      setRawRows([]);
      setFileName("");
      onTransactionsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setImporting(false);
    }
  }

  const selectCls =
    "rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-accent dark:border-zinc-700 dark:bg-zinc-950";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-500">Export</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Take your transactions out as a file.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={exportMonth}
            onChange={(e) => setExportMonth(e.target.value)}
            aria-label="Export scope"
            className={selectCls}
          >
            <option value="all">All months</option>
            {monthsWithData.map((m) => (
              <option key={m} value={m}>
                {MONTHS[m]}
              </option>
            ))}
          </select>
          <span className="text-xs text-zinc-500">{exportTx.length} entries</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportBackup}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
          >
            ↓ Backup (CSV)
          </button>
          <button
            type="button"
            onClick={exportStatement}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            ↓ Statement (CSV)
          </button>
          <button
            type="button"
            onClick={exportPDF}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            ↓ Statement (PDF)
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          The backup keeps every detail (IDs, accounts, transfer links) so it can
          be imported back later. Statements leave transfers out.
        </p>
      </div>

      <div className="border-t border-zinc-100 pt-6 dark:border-zinc-800">
        <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-500">Import</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Bring in entries from a bank statement or a spreadsheet, or restore a
          Ledgerly backup. You look at every row before anything is added.
          Duplicates are not checked — importing the same file twice adds it twice.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="mt-3 w-full rounded-2xl border-2 border-dashed border-zinc-300 py-6 text-center text-sm font-medium text-zinc-600 transition hover:border-accent hover:text-accent-ink dark:border-zinc-700 dark:text-zinc-400"
        >
          {fileName ? `📄 ${fileName} — pick a different file` : "Choose a CSV file"}
          <span className="block text-xs font-normal text-zinc-400">
            .csv, up to 500 rows at a time
          </span>
        </button>

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </p>
        )}
        {importResult && (
          <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-sm font-medium text-accent-ink">
            ✅ {importResult}
          </p>
        )}

        {headers.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-bold">Columns</h4>
            <p className="mt-0.5 text-xs text-zinc-500">
              Check each column means what it says — the guesses come from the
              header names.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {headers.map((h, i) => (
                <label key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-28 shrink-0 truncate font-medium" title={h}>
                    {h || `(column ${i + 1})`}
                  </span>
                  <select
                    value={mapping[i]}
                    onChange={(e) => {
                      const next = [...mapping];
                      next[i] = e.target.value as ColKey;
                      setMapping(next);
                    }}
                    aria-label={`Column ${h || i + 1} means`}
                    className={`${selectCls} flex-1`}
                  >
                    {(Object.keys(COL_LABELS) as ColKey[]).map((k) => (
                      <option key={k} value={k}>
                        {COL_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {!hasRequiredMapping && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                Map at least a Date, a Category and an Amount column to import.
              </p>
            )}

            <h4 className="mt-4 text-sm font-bold">
              Preview — {validCount} of {parsedRows.length} rows ready
              {parsedRows.length - validCount > 0 &&
                `, ${parsedRows.length - validCount} will be skipped`}
            </h4>
            <div className="mt-2 overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                    <th className="px-3 py-2 font-semibold">Date</th>
                    <th className="px-3 py-2 font-semibold">Type</th>
                    <th className="px-3 py-2 font-semibold">Category</th>
                    <th className="px-3 py-2 font-semibold">Description</th>
                    <th className="px-3 py-2 text-right font-semibold">Amount</th>
                    <th className="px-3 py-2 font-semibold">OK?</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/70">
                      <td className="px-3 py-2 tabular-nums">{r.date ?? "—"}</td>
                      <td className="px-3 py-2">{r.type ?? "—"}</td>
                      <td className="px-3 py-2">{r.category || "—"}</td>
                      <td className="max-w-40 truncate px-3 py-2 text-zinc-600 dark:text-zinc-400">
                        {r.description || "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {r.amount !== null ? formatBDT(r.amount) : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.valid ? "✅" : `❌ ${r.reason}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedRows.length > 10 && (
                <p className="px-3 py-2 text-xs text-zinc-500">
                  Showing the first 10 of {parsedRows.length} rows.
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={importing || validCount === 0 || !hasRequiredMapping}
              onClick={() => void doImport()}
              className="mt-3 w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-accent-strong disabled:opacity-50 sm:w-auto sm:px-6"
            >
              {importing ? "Importing…" : `Import ${validCount} entr${validCount === 1 ? "y" : "ies"}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
