import {
  DEFAULT_ACCOUNT_NAME,
  DEFAULT_CATEGORIES,
  MONTHS,
  TRANSFER_CATEGORY,
  isTransfer,
  patternKey,
  type Account,
  type Budget,
  type ManagedCategory,
  type MarkedPattern,
  type Note,
  type SheetInfo,
  type Transaction,
  type TrashEntry,
  type TxType,
} from "./types";

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

/** Extract a spreadsheet ID from a full Sheets URL or a bare ID. */
export function parseSheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

async function sheetsFetch(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  // Google's per-user read quota is 60/minute, and a burst of parallel
  // reads can trip it even when the average rate is fine. A 429 means the
  // request was REJECTED, not executed, so retrying is safe for reads and
  // writes alike. Two retries with backoff, honouring Retry-After.
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${SHEETS_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (res.status !== 429 || attempt === 2) return res;
    const retryAfter = Number(res.headers.get("Retry-After"));
    const delay =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 5000)
        : 1000 * (attempt + 1);
    await new Promise((r) => setTimeout(r, delay));
  }
  // Unreachable — the loop always returns — but TypeScript needs it.
  throw new Error("Sheets request failed.");
}

/** A Sheets API failure that carries its HTTP status, so API routes can
    tell a transient rate limit from a permanent access problem. */
export class SheetsError extends Error {
  status: number;
  constructor(status: number) {
    super(friendlyError(status));
    this.name = "SheetsError";
    this.status = status;
  }
}

function throwSheetsError(status: number): never {
  throw new SheetsError(status);
}

/** HTTP status for an API route to return for a Sheets failure: 429 for a
    rate limit, 503 for a Google-side 5xx (both transient — the client
    shows "try again" instead of dropping the connection), 502 for
    everything else. */
export function sheetsErrorStatus(err: unknown): number {
  if (err instanceof SheetsError) {
    if (err.status === 429) return 429;
    if (err.status >= 500 && err.status < 600) return 503;
  }
  return 502;
}

function friendlyError(status: number): string {
  if (status === 401 || status === 403)
    return "Google refused access to this sheet. Make sure you are signed in with an account that can open it, then try again.";
  if (status === 404)
    return "No spreadsheet was found at that link or ID. Check it and try again.";
  if (status === 429)
    return "Google is rate-limiting requests right now — the app asked for data too quickly. Wait a minute and try again.";
  if (status >= 500)
    return "Google Sheets is having a temporary problem. Please try again in a moment.";
  return `Google Sheets returned an error (HTTP ${status}). Please try again.`;
}

/** Header row of a Cash 2026 sheet — same columns, same order, every tab. */
export const CASH_SHEET_HEADERS = [
  "ID",
  "Date",
  "Type",
  "Category",
  "Description",
  "Amount",
  "Currency",
  "Linked account",
  "Link ID",
  "Notes",
];

/**
 * Create a brand-new spreadsheet in the signed-in user's Google Drive, set
 * up in the Cash 2026 format: 12 monthly tabs, each with the header row in
 * row 1 and the header frozen.
 *
 * Uses spreadsheets.create, which works with the spreadsheets scope the app
 * already requests — no Drive scope, no new permission, no re-consent.
 *
 * The header row is load-bearing, not cosmetic: the app appends new entries
 * after the last row, so without headers the first entry would land in row 1
 * and be invisible to the reader (which reads from A2). If the header write
 * fails, this throws and the caller must NOT connect the sheet — the user
 * can delete the half-made spreadsheet from Drive and retry.
 */
export async function createCashSheet(
  accessToken: string,
  title: string
): Promise<SheetInfo> {
  const name = title.trim().slice(0, 100) || `Cash ${new Date().getFullYear()}`;
  const create = await sheetsFetch(accessToken, "", {
    method: "POST",
    body: JSON.stringify({
      properties: { title: name },
      sheets: MONTHS.map((month) => ({
        properties: {
          title: month,
          gridProperties: { frozenRowCount: 1 },
        },
      })),
    }),
  });
  if (!create.ok) throwSheetsError(create.status);
  const created = await create.json();
  const spreadsheetId = created?.spreadsheetId as string | undefined;
  if (!spreadsheetId) throw new Error("Google did not return a sheet ID.");

  // Defensive: if the API added any sheet outside the 12 months (e.g. a
  // default "Sheet1"), remove it so the new sheet is exactly the format.
  const createdTitles: { sheetId?: number; title?: string }[] = (
    created?.sheets ?? []
  ).map((s: { properties?: { sheetId?: number; title?: string } }) => ({
    sheetId: s?.properties?.sheetId,
    title: s?.properties?.title,
  }));
  const extras = createdTitles.filter(
    (s) =>
      typeof s.sheetId === "number" &&
      !(MONTHS as readonly string[]).includes(s.title ?? "")
  );
  if (extras.length > 0) {
    await sheetsFetch(accessToken, `/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: extras.map((s) => ({ deleteSheet: { sheetId: s.sheetId } })),
      }),
    });
    // Non-fatal if this fails — an extra empty tab is harmless.
  }

  const headers = await sheetsFetch(
    accessToken,
    `/${spreadsheetId}/values:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "RAW",
        data: MONTHS.map((month) => ({
          range: `${month}!A1:J1`,
          values: [CASH_SHEET_HEADERS],
        })),
      }),
    }
  );
  if (!headers.ok) {
    throw new Error(
      `The sheet "${name}" was created in your Google Drive, but its monthly tabs could not be set up. Please delete it from Drive and try again.`
    );
  }
  return { id: spreadsheetId, title: name, tabs: [...MONTHS] };
}

/** Validate a sheet and return its title and tab names. */
export async function getSheetInfo(
  accessToken: string,
  spreadsheetId: string
): Promise<SheetInfo> {
  const res = await sheetsFetch(
    accessToken,
    `/${spreadsheetId}?fields=properties.title,sheets.properties.title`
  );
  if (!res.ok) throwSheetsError(res.status);
  const data = await res.json();
  return {
    id: spreadsheetId,
    title: data?.properties?.title ?? "Untitled spreadsheet",
    tabs: (data?.sheets ?? [])
      .map((s: { properties?: { title?: string } }) => s?.properties?.title)
      .filter((t: unknown): t is string => typeof t === "string"),
  };
}

interface SheetValuesResponse {
  values?: string[][];
}

/** Parse one monthly tab's rows into transactions (shared by the batch
    read and the per-tab fallback). */
function parseMonthRows(month: string, rows: string[][]): Transaction[] {
  const out: Transaction[] = [];
  rows.forEach((row, idx) => {
    const [id, date, type, category, description, amount, currency, linkedAccount, linkId] = row;
    if (!date || !type || amount === undefined) return;
    const parsed = Number(String(amount).replace(/,/g, ""));
    if (!Number.isFinite(parsed)) return;
    if (type !== "Debit" && type !== "Credit") return;
    out.push({
      id: id || `${date}-${out.length}`,
      date,
      type: type as TxType,
      category: category || "Other",
      description: description || "",
      amount: parsed,
      currency: currency || "BDT",
      linkedAccount: linkedAccount || "",
      linkId: linkId || "",
      tab: month,
      row: idx + 2, // A2 is sheet row 2
    });
  });
  return out;
}

/** Read every monthly tab (January–December). Missing tabs are skipped. */
export async function getAllTransactions(
  accessToken: string,
  spreadsheetId: string
): Promise<Transaction[]> {
  // One batched read for all 12 tabs instead of 12 parallel reads: the
  // per-user read quota is 60/minute, and 12 reads per dashboard load was
  // exhausting it within a couple of reloads.
  const params = MONTHS.map(
    (m) => `ranges=${encodeURIComponent(`${m}!A2:J`)}`
  ).join("&");
  const res = await sheetsFetch(
    accessToken,
    `/${spreadsheetId}/values:batchGet?${params}`
  );
  if (!res.ok) {
    if (res.status === 400) {
      // A missing monthly tab breaks the whole batch — fall back to
      // per-tab reads, tolerating missing tabs.
      return getAllTransactionsPerTab(accessToken, spreadsheetId);
    }
    throwSheetsError(res.status);
  }
  const data = (await res.json()) as {
    valueRanges?: { range?: string; values?: string[][] }[];
  };
  const all: Transaction[] = [];
  for (const vr of data.valueRanges ?? []) {
    // The tab name comes from the returned range ("November!A2:J93"), not
    // from position — batchGet may omit empty ranges.
    const tab = (vr.range ?? "").split("!")[0].replace(/^'|'$/g, "");
    if (!(MONTHS as readonly string[]).includes(tab)) continue;
    all.push(...parseMonthRows(tab, vr.values ?? []));
  }
  all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return all;
}

/** Per-tab fallback for sheets missing a monthly tab. Tolerates missing
    tabs; a rate limit or Google-side error still throws. */
async function getAllTransactionsPerTab(
  accessToken: string,
  spreadsheetId: string
): Promise<Transaction[]> {
  const results = await Promise.all(
    MONTHS.map(async (month) => {
      const res = await sheetsFetch(
        accessToken,
        `/${spreadsheetId}/values/${encodeURIComponent(month)}!A2:J`
      );
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) throwSheetsError(res.status);
        return [] as Transaction[]; // missing/empty tab: tolerate
      }
      const data = (await res.json()) as SheetValuesResponse;
      return parseMonthRows(month, data.values ?? []);
    })
  );
  const all = results.flat();
  all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return all;
}

export interface NewTransactionInput {
  date: string; // YYYY-MM-DD
  type: TxType;
  category: string;
  description: string;
  amount: number;
  /** Column H. Blank means the default account. */
  linkedAccount?: string;
  /** Column I. Set on both halves of a transfer, linking them. */
  linkId?: string;
}

/** Append one row to the tab for the month of the transaction date. */
export async function appendTransaction(
  accessToken: string,
  spreadsheetId: string,
  input: NewTransactionInput,
  existingId?: string
): Promise<Transaction> {
  const month = Number(input.date.slice(5, 7));
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Date must be in YYYY-MM-DD format.");
  }
  const tab = MONTHS[month - 1];
  const generatedId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const id = existingId ?? generatedId;
  const values = [
    [
      id,
      input.date,
      input.type,
      input.category,
      input.description,
      input.amount,
      "BDT",
      input.linkedAccount ?? "",
      input.linkId ?? "",
      "",
    ],
  ];
  const res = await sheetsFetch(
    accessToken,
    `/${spreadsheetId}/values/${encodeURIComponent(tab)}!A:J:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values }) }
  );
  if (!res.ok) throwSheetsError(res.status);
  return {
    id,
    date: input.date,
    type: input.type,
    category: input.category,
    description: input.description,
    amount: input.amount,
    currency: "BDT",
  };
}

export interface UpdateTransactionInput extends NewTransactionInput {
  /** The entry's id as stored in column A (may be a synthetic id for old rows without one). */
  id: string;
  /** Month tab the entry currently lives on. */
  tab: string;
  /** 1-based sheet row the entry currently lives on. */
  row: number;
  /** The entry's values as loaded, used to confirm the row hasn't changed since. */
  originalDate: string;
  originalType: TxType;
  originalAmount: number;
}

export interface DeleteTransactionInput {
  /** The entry's id as stored in column A (may be a synthetic id for old rows without one). */
  id: string;
  /** Month tab the entry currently lives on. */
  tab: string;
  /** 1-based sheet row the entry currently lives on. */
  row: number;
  /** The entry's values as loaded, used to confirm the row hasn't changed since. */
  originalDate: string;
  originalType: TxType;
  originalAmount: number;
}

/**
 * Delete one entry. The row is re-read first and checked against the values
 * the dashboard loaded, so a delete never removes a row that changed (or
 * was already deleted) in the meantime. The row is moved to the Trash tab
 * (kept 30 days) instead of just vanishing, then cleared — clearing never
 * shifts the rows below it. If the entry is one half of a transfer, the
 * other half is deleted too, so no orphaned half is left behind.
 */
export async function deleteTransaction(
  accessToken: string,
  spreadsheetId: string,
  input: DeleteTransactionInput
): Promise<void> {
  const tab = input.tab;
  if (!(MONTHS as readonly string[]).includes(tab)) {
    throw new Error("Unknown sheet tab.");
  }
  if (!Number.isInteger(input.row) || input.row < 2) {
    throw new Error("Unknown sheet row.");
  }

  // Re-read the row and confirm it is still the entry the user loaded.
  const read = await sheetsFetch(
    accessToken,
    "/" + spreadsheetId + "/values/" + encodeURIComponent(tab) + "!A" + input.row + ":J" + input.row
  );
  if (!read.ok) throwSheetsError(read.status);
  const data = (await read.json()) as SheetValuesResponse;
  const current = data.values?.[0] ?? [];
  const currentAmount = Number(String(current[5] ?? "").replace(/,/g, ""));
  if (
    current[1] !== input.originalDate ||
    current[2] !== input.originalType ||
    currentAmount !== input.originalAmount
  ) {
    throw new Error(
      "That entry changed in the sheet since it was loaded. Refresh the dashboard and try again."
    );
  }

  const linkId = (current[8] ?? "").trim();
  await trashAndClearRow(accessToken, spreadsheetId, tab, input.row);
  if (linkId) {
    const all = await getAllTransactions(accessToken, spreadsheetId);
    const pair = all.find(
      (t) => t.linkId === linkId && !(t.tab === tab && t.row === input.row)
    );
    if (pair?.tab && pair?.row) {
      await trashAndClearRow(accessToken, spreadsheetId, pair.tab, pair.row);
    }
  }
}
function isSyntheticId(id: string): boolean {
  // getAllTransactions builds ids like "2026-11-14-3" for rows with no id in column A.
  return /^\d{4}-\d{2}-\d{2}-\d+$/.test(id);
}

/**
 * Update one entry in place. The row is re-read first and checked against the
 * values the dashboard loaded, so an edit never overwrites a row that changed
 * (or was deleted) in the meantime. Columns H-J (linked account, link ID,
 * notes) are preserved untouched. If the new date falls in a different month,
 * the old row is cleared and the entry is appended to that month's tab.
 */
export async function updateTransaction(
  accessToken: string,
  spreadsheetId: string,
  input: UpdateTransactionInput
): Promise<Transaction> {
  const tab = input.tab;
  if (!(MONTHS as readonly string[]).includes(tab)) {
    throw new Error("Unknown sheet tab.");
  }
  if (!Number.isInteger(input.row) || input.row < 2) {
    throw new Error("Unknown sheet row.");
  }
  const newMonth = Number(input.date.slice(5, 7));
  if (!Number.isInteger(newMonth) || newMonth < 1 || newMonth > 12) {
    throw new Error("Date must be in YYYY-MM-DD format.");
  }
  const newTab = MONTHS[newMonth - 1];

  // Re-read the row and confirm it is still the entry the user loaded.
  const read = await sheetsFetch(
    accessToken,
    "/" + spreadsheetId + "/values/" + encodeURIComponent(tab) + "!A" + input.row + ":J" + input.row
  );
  if (!read.ok) throwSheetsError(read.status);
  const data = (await read.json()) as SheetValuesResponse;
  const current = data.values?.[0] ?? [];
  const currentAmount = Number(String(current[5] ?? "").replace(/,/g, ""));
  if (
    current[1] !== input.originalDate ||
    current[2] !== input.originalType ||
    currentAmount !== input.originalAmount
  ) {
    throw new Error(
      "That entry changed in the sheet since it was loaded. Refresh the dashboard and try again."
    );
  }
  // Columns I-J (link ID, notes) are not shown in the app; keep whatever is
  // already there. Column H (linked account) is set from the form when the
  // caller sends one, otherwise kept as well.
  const keepLinkId = current[8] ?? "";
  const keepNotes = current[9] ?? "";
  const linkedAccount =
    input.linkedAccount !== undefined ? input.linkedAccount : (current[7] ?? "");

  if (newTab === tab) {
    const values = [
      [
        input.id,
        input.date,
        input.type,
        input.category,
        input.description,
        input.amount,
        "BDT",
        linkedAccount,
        keepLinkId,
        keepNotes,
      ],
    ];
    const put = await sheetsFetch(
      accessToken,
      "/" + spreadsheetId + "/values/" + encodeURIComponent(tab) + "!A" + input.row + ":J" + input.row + "?valueInputOption=USER_ENTERED",
      { method: "PUT", body: JSON.stringify({ values }) }
    );
    if (!put.ok) throwSheetsError(put.status);
    return {
      id: input.id,
      date: input.date,
      type: input.type,
      category: input.category,
      description: input.description,
      amount: input.amount,
      currency: "BDT",
      tab,
      row: input.row,
    };
  }

  // New month: clear the old row, then append to the new tab. A synthetic id
  // is replaced with a real UUID on the move, so the entry becomes editable
  // by id afterwards.
  const clear = await sheetsFetch(
    accessToken,
    "/" + spreadsheetId + "/values/" + encodeURIComponent(tab) + "!A" + input.row + ":J" + input.row + ":clear",
    { method: "POST", body: JSON.stringify({}) }
  );
  if (!clear.ok) throwSheetsError(clear.status);
  return appendTransaction(
    accessToken,
    spreadsheetId,
    {
      date: input.date,
      type: input.type,
      category: input.category,
      description: input.description,
      amount: input.amount,
      linkedAccount,
      linkId: keepLinkId || undefined,
    },
    isSyntheticId(input.id) ? undefined : input.id
  );
}

// ---------------------------------------------------------------------------
// Managed lists: Categories, Accounts, Trash, Notes. Each lives as an extra
// tab in the user's own sheet, so it syncs across devices and is shared with
// partners on a shared sheet — no database, no new Google scope.
// ---------------------------------------------------------------------------

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function columnLetter(n: number): string {
  return String.fromCharCode(64 + n); // 1 -> A, 11 -> K
}

/**
 * Read one tab. Returns null when the tab doesn't exist (400 — the range
 * can't be parsed), throws SheetsError on a rate limit or Google-side
 * error so a failed read is never mistaken for an empty tab, and [] for
 * any other failure.
 */
async function readTabValuesStrict(
  accessToken: string,
  spreadsheetId: string,
  tab: string,
  range: string
): Promise<string[][] | null> {
  const res = await sheetsFetch(
    accessToken,
    `/${spreadsheetId}/values/${encodeURIComponent(tab)}!${range}`
  );
  if (res.ok) {
    const data = (await res.json()) as SheetValuesResponse;
    return data.values ?? [];
  }
  if (res.status === 400) return null;
  if (res.status === 429 || res.status >= 500) throwSheetsError(res.status);
  return [];
}

/** Read one tab, treating a missing tab as empty. */
async function readTabValues(
  accessToken: string,
  spreadsheetId: string,
  tab: string,
  range: string
): Promise<string[][]> {
  return (
    (await readTabValuesStrict(accessToken, spreadsheetId, tab, range)) ?? []
  );
}

/**
 * Read a managed tab, creating it (with headers) if it doesn't exist yet.
 * One API call in the common case — the old ensureTab-first pattern spent
 * a spreadsheets.get on every single load, even though a tab is created
 * once per sheet, ever.
 */
async function readTabOrEnsure(
  accessToken: string,
  spreadsheetId: string,
  tab: string,
  range: string,
  headers: string[]
): Promise<string[][]> {
  const first = await readTabValuesStrict(
    accessToken,
    spreadsheetId,
    tab,
    range
  );
  if (first !== null) return first;
  await ensureTab(accessToken, spreadsheetId, tab, headers);
  return readTabValues(accessToken, spreadsheetId, tab, range);
}

/** Create a tab with a frozen header row when it doesn't exist yet. */
async function ensureTab(
  accessToken: string,
  spreadsheetId: string,
  title: string,
  headers: string[]
): Promise<void> {
  const info = await getSheetInfo(accessToken, spreadsheetId);
  if (info.tabs.includes(title)) return;
  const add = await sheetsFetch(accessToken, `/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          addSheet: {
            properties: {
              title,
              gridProperties: { frozenRowCount: 1 },
            },
          },
        },
      ],
    }),
  });
  if (!add.ok) throwSheetsError(add.status);
  const write = await sheetsFetch(
    accessToken,
    `/${spreadsheetId}/values/${encodeURIComponent(title)}!A1:${columnLetter(headers.length)}1?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ values: [headers] }) }
  );
  if (!write.ok) throwSheetsError(write.status);
}

/** Write many single-cell/small-range updates in one call, chunked at 100. */
async function batchUpdateCells(
  accessToken: string,
  spreadsheetId: string,
  updates: { range: string; values: string[][] }[]
): Promise<void> {
  for (let i = 0; i < updates.length; i += 100) {
    const chunk = updates.slice(i, i + 100);
    const res = await sheetsFetch(
      accessToken,
      `/${spreadsheetId}/values:batchUpdate`,
      {
        method: "POST",
        body: JSON.stringify({ valueInputOption: "RAW", data: chunk }),
      }
    );
    if (!res.ok) throwSheetsError(res.status);
  }
}

async function batchClearRanges(
  accessToken: string,
  spreadsheetId: string,
  ranges: string[]
): Promise<void> {
  if (ranges.length === 0) return;
  const res = await sheetsFetch(
    accessToken,
    `/${spreadsheetId}/values:batchClear`,
    { method: "POST", body: JSON.stringify({ ranges }) }
  );
  if (!res.ok) throwSheetsError(res.status);
}

async function clearRange(
  accessToken: string,
  spreadsheetId: string,
  tab: string,
  range: string
): Promise<void> {
  const res = await sheetsFetch(
    accessToken,
    `/${spreadsheetId}/values/${encodeURIComponent(tab)}!${range}:clear`,
    { method: "POST", body: JSON.stringify({}) }
  );
  if (!res.ok) throwSheetsError(res.status);
}

// --- Trash ---------------------------------------------------------------

export const TRASH_TAB = "Trash";
const TRASH_HEADERS = [...CASH_SHEET_HEADERS, "Deleted at"];
const TRASH_KEEP_DAYS = 30;

/** Copy a monthly-tab row into Trash (with today's date), then clear it. */
async function trashAndClearRow(
  accessToken: string,
  spreadsheetId: string,
  tab: string,
  row: number
): Promise<void> {
  const read = await sheetsFetch(
    accessToken,
    "/" + spreadsheetId + "/values/" + encodeURIComponent(tab) + "!A" + row + ":J" + row
  );
  if (!read.ok) throwSheetsError(read.status);
  const data = (await read.json()) as SheetValuesResponse;
  const current = data.values?.[0] ?? [];
  if (!current[1]) return; // already empty — nothing to trash
  await ensureTab(accessToken, spreadsheetId, TRASH_TAB, TRASH_HEADERS);
  const padded = Array.from({ length: 10 }, (_, i) => current[i] ?? "");
  const deletedAt = new Date().toISOString().slice(0, 10);
  const append = await sheetsFetch(
    accessToken,
    `/${spreadsheetId}/values/${encodeURIComponent(TRASH_TAB)}!A:K:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [[...padded, deletedAt]] }) }
  );
  if (!append.ok) throwSheetsError(append.status);
  await clearRange(accessToken, spreadsheetId, tab, `A${row}:J${row}`);
}

/** List trashed entries, expiring anything older than 30 days on the way. */
export async function getTrashEntries(
  accessToken: string,
  spreadsheetId: string
): Promise<TrashEntry[]> {
  const rows = await readTabOrEnsure(accessToken, spreadsheetId, TRASH_TAB, "A2:K", TRASH_HEADERS);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - TRASH_KEEP_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const expired: string[] = [];
  const out: TrashEntry[] = [];
  rows.forEach((r, idx) => {
    const [id, date, type, category, description, amount, currency, linkedAccount, linkId, , deletedAt] = r;
    if (!date || !type || amount === undefined) return;
    const row = idx + 2;
    if ((deletedAt ?? "") < cutoffStr) {
      expired.push(`${TRASH_TAB}!A${row}:K${row}`);
      return;
    }
    const parsed = Number(String(amount).replace(/,/g, ""));
    if (!Number.isFinite(parsed)) return;
    if (type !== "Debit" && type !== "Credit") return;
    out.push({
      id: id || `trash-${row}`,
      date,
      type: type as TxType,
      category: category || "Other",
      description: description || "",
      amount: parsed,
      currency: currency || "BDT",
      linkedAccount: linkedAccount || "",
      linkId: linkId || "",
      deletedAt: deletedAt || "",
      trashRow: row,
    });
  });
  if (expired.length > 0) {
    // Best-effort expiry: a failure here must not block listing the trash.
    try {
      await batchClearRanges(accessToken, spreadsheetId, expired);
    } catch {
      // Ignore — the entries will be skipped again on the next read.
    }
  }
  out.sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
  return out;
}

/** Move a trashed entry back to its monthly tab, then clear its trash row. */
export async function restoreTrashEntry(
  accessToken: string,
  spreadsheetId: string,
  trashRow: number
): Promise<Transaction> {
  const rows = await readTabValues(
    accessToken,
    spreadsheetId,
    TRASH_TAB,
    `A${trashRow}:K${trashRow}`
  );
  const r = rows[0] ?? [];
  const [id, date, type, category, description, amount, , linkedAccount, linkId] = r;
  if (!date || !type || amount === undefined) {
    throw new Error("That deleted entry is no longer in the trash.");
  }
  const parsed = Number(String(amount).replace(/,/g, ""));
  if (!Number.isFinite(parsed) || (type !== "Debit" && type !== "Credit")) {
    throw new Error("That deleted entry is no longer in the trash.");
  }
  const restored = await appendTransaction(
    accessToken,
    spreadsheetId,
    {
      date,
      type: type as TxType,
      category: category || "Other",
      description: description || "",
      amount: parsed,
      linkedAccount: linkedAccount || undefined,
      linkId: linkId || undefined,
    },
    id || undefined
  );
  await clearRange(accessToken, spreadsheetId, TRASH_TAB, `A${trashRow}:K${trashRow}`);
  return restored;
}

/** Permanently delete a trashed entry. */
export async function deleteTrashEntry(
  accessToken: string,
  spreadsheetId: string,
  trashRow: number
): Promise<void> {
  await clearRange(accessToken, spreadsheetId, TRASH_TAB, `A${trashRow}:K${trashRow}`);
}

// --- Categories ------------------------------------------------------------

export const CATEGORIES_TAB = "Categories";
const CATEGORIES_HEADERS = ["Name", "Type", "Order"];

interface CategoryRow extends ManagedCategory {
  row: number;
}

function parseCategoryRows(rows: string[][]): CategoryRow[] {
  return rows
    .map((r, i) => ({
      name: (r[0] ?? "").trim(),
      type: r[1] as TxType,
      order: Number(r[2] ?? 0) || 0,
      row: i + 2,
    }))
    .filter(
      (c) => c.name && (c.type === "Debit" || c.type === "Credit")
    )
    .sort((a, b) =>
      a.type === b.type ? a.order - b.order : a.type === "Debit" ? -1 : 1
    );
}

function toManaged(rows: CategoryRow[]): ManagedCategory[] {
  return rows.map(({ name, type, order }) => ({ name, type, order }));
}

async function writeCategories(
  accessToken: string,
  spreadsheetId: string,
  list: ManagedCategory[]
): Promise<void> {
  await clearRange(accessToken, spreadsheetId, CATEGORIES_TAB, "A2:C");
  if (list.length === 0) return;
  const values = list.map((c) => [c.name, c.type, c.order]);
  const res = await sheetsFetch(
    accessToken,
    `/${spreadsheetId}/values/${encodeURIComponent(CATEGORIES_TAB)}!A2:C?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ values }) }
  );
  if (!res.ok) throwSheetsError(res.status);
}

/**
 * Read the managed category list. On first use the tab is created and
 * seeded from the categories already in the sheet's entries (so nothing
 * real is ever lost to "Uncategorised"), topped up with the defaults.
 */
export async function getCategories(
  accessToken: string,
  spreadsheetId: string
): Promise<ManagedCategory[]> {
  const rows = parseCategoryRows(
    await readTabOrEnsure(accessToken, spreadsheetId, CATEGORIES_TAB, "A2:C", CATEGORIES_HEADERS)
  );
  if (rows.length > 0) return toManaged(rows);

  const txs = await getAllTransactions(accessToken, spreadsheetId);
  const names: Record<TxType, Set<string>> = { Debit: new Set(), Credit: new Set() };
  for (const t of txs) {
    if (isTransfer(t) || t.category === TRANSFER_CATEGORY) continue;
    names[t.type].add(t.category);
  }
  const seeded: ManagedCategory[] = [];
  (["Debit", "Credit"] as const).forEach((type) => {
    const ordered = [...names[type]].sort((a, b) => a.localeCompare(b));
    for (const d of DEFAULT_CATEGORIES) {
      if (d.type === type && !names[type].has(d.name)) ordered.push(d.name);
    }
    ordered.forEach((name, i) => seeded.push({ name, type, order: i }));
  });
  await writeCategories(accessToken, spreadsheetId, seeded);
  return seeded;
}

export async function addCategory(
  accessToken: string,
  spreadsheetId: string,
  name: string,
  type: TxType
): Promise<ManagedCategory[]> {
  const clean = name.trim().slice(0, 50);
  if (!clean) throw new Error("Category name is empty.");
  if (clean.toLowerCase() === TRANSFER_CATEGORY.toLowerCase()) {
    throw new Error(`"${TRANSFER_CATEGORY}" is reserved for transfers.`);
  }
  const rows = parseCategoryRows(
    await readTabValues(accessToken, spreadsheetId, CATEGORIES_TAB, "A2:C")
  );
  if (
    rows.some((c) => c.name.toLowerCase() === clean.toLowerCase() && c.type === type)
  ) {
    throw new Error("That category already exists.");
  }
  const maxOrder = rows
    .filter((c) => c.type === type)
    .reduce((m, c) => Math.max(m, c.order), -1);
  const res = await sheetsFetch(
    accessToken,
    `/${spreadsheetId}/values/${encodeURIComponent(CATEGORIES_TAB)}!A:C:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [[clean, type, maxOrder + 1]] }) }
  );
  if (!res.ok) throwSheetsError(res.status);
  return getCategories(accessToken, spreadsheetId);
}

export async function renameCategory(
  accessToken: string,
  spreadsheetId: string,
  name: string,
  type: TxType,
  newName: string,
  renameEntries: boolean
): Promise<{ categories: ManagedCategory[]; renamed: number }> {
  const clean = newName.trim().slice(0, 50);
  if (!clean) throw new Error("Category name is empty.");
  if (clean.toLowerCase() === TRANSFER_CATEGORY.toLowerCase()) {
    throw new Error(`"${TRANSFER_CATEGORY}" is reserved for transfers.`);
  }
  const rows = parseCategoryRows(
    await readTabValues(accessToken, spreadsheetId, CATEGORIES_TAB, "A2:C")
  );
  const target = rows.find(
    (c) => c.name.toLowerCase() === name.toLowerCase() && c.type === type
  );
  if (!target) throw new Error("That category is not in the list.");
  if (
    rows.some(
      (c) =>
        c.row !== target.row &&
        c.name.toLowerCase() === clean.toLowerCase() &&
        c.type === type
    )
  ) {
    throw new Error("A category with that name already exists.");
  }
  await batchUpdateCells(accessToken, spreadsheetId, [
    { range: `${CATEGORIES_TAB}!A${target.row}`, values: [[clean]] },
  ]);
  let renamed = 0;
  if (renameEntries) {
    const txs = await getAllTransactions(accessToken, spreadsheetId);
    const matches = txs.filter(
      (t) => !isTransfer(t) && t.category === target.name && t.type === type && t.tab && t.row
    );
    await batchUpdateCells(
      accessToken,
      spreadsheetId,
      matches.map((t) => ({
        range: `${t.tab}!D${t.row}`,
        values: [[clean]],
      }))
    );
    renamed = matches.length;
  }
  return { categories: await getCategories(accessToken, spreadsheetId), renamed };
}

export async function deleteCategory(
  accessToken: string,
  spreadsheetId: string,
  name: string,
  type: TxType
): Promise<ManagedCategory[]> {
  const rows = parseCategoryRows(
    await readTabValues(accessToken, spreadsheetId, CATEGORIES_TAB, "A2:C")
  );
  const target = rows.find(
    (c) => c.name.toLowerCase() === name.toLowerCase() && c.type === type
  );
  if (!target) throw new Error("That category is not in the list.");
  const txs = await getAllTransactions(accessToken, spreadsheetId);
  const count = txs.filter(
    (t) => !isTransfer(t) && t.category === target.name && t.type === type
  ).length;
  if (count > 0) {
    throw new Error(
      `That category still has ${count} entr${count === 1 ? "y" : "ies"}. Rename them to another category first, or delete them.`
    );
  }
  await clearRange(accessToken, spreadsheetId, CATEGORIES_TAB, `A${target.row}:C${target.row}`);
  return getCategories(accessToken, spreadsheetId);
}

/** Rewrite the whole list in the order the client sends (orders reassigned per type). */
export async function reorderCategories(
  accessToken: string,
  spreadsheetId: string,
  ordered: { name: string; type: TxType }[]
): Promise<ManagedCategory[]> {
  const counters: Record<TxType, number> = { Debit: 0, Credit: 0 };
  const list: ManagedCategory[] = ordered
    .filter((c) => c.name.trim() && (c.type === "Debit" || c.type === "Credit"))
    .map((c) => ({
      name: c.name.trim().slice(0, 50),
      type: c.type,
      order: counters[c.type]++,
    }));
  await writeCategories(accessToken, spreadsheetId, list);
  return getCategories(accessToken, spreadsheetId);
}

// --- Accounts --------------------------------------------------------------

export const ACCOUNTS_TAB = "Accounts";
const ACCOUNTS_HEADERS = ["Name", "Type"];

interface AccountRow extends Account {
  row: number;
}

function parseAccountRows(rows: string[][]): AccountRow[] {
  return rows
    .map((r, i) => ({
      name: (r[0] ?? "").trim(),
      type: (r[1] ?? "").trim() || "Cash",
      row: i + 2,
    }))
    .filter((a) => a.name);
}

function toAccounts(rows: AccountRow[]): Account[] {
  return rows.map(({ name, type }) => ({ name, type }));
}

/** Read the managed account list; a first use seeds a single Cash account. */
export async function getAccounts(
  accessToken: string,
  spreadsheetId: string
): Promise<Account[]> {
  const rows = parseAccountRows(
    await readTabOrEnsure(accessToken, spreadsheetId, ACCOUNTS_TAB, "A2:B", ACCOUNTS_HEADERS)
  );
  if (rows.length > 0) return toAccounts(rows);
  const res = await sheetsFetch(
    accessToken,
    `/${spreadsheetId}/values/${encodeURIComponent(ACCOUNTS_TAB)}!A2:B?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ values: [[DEFAULT_ACCOUNT_NAME, "Cash"]] }) }
  );
  if (!res.ok) throwSheetsError(res.status);
  return [{ name: DEFAULT_ACCOUNT_NAME, type: "Cash" }];
}

export async function addAccount(
  accessToken: string,
  spreadsheetId: string,
  name: string,
  type: string
): Promise<Account[]> {
  const clean = name.trim().slice(0, 50);
  if (!clean) throw new Error("Account name is empty.");
  const rows = parseAccountRows(
    await readTabValues(accessToken, spreadsheetId, ACCOUNTS_TAB, "A2:B")
  );
  if (rows.some((a) => a.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error("An account with that name already exists.");
  }
  const res = await sheetsFetch(
    accessToken,
    `/${spreadsheetId}/values/${encodeURIComponent(ACCOUNTS_TAB)}!A:B:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      body: JSON.stringify({ values: [[clean, (type || "Cash").slice(0, 20)]] }),
    }
  );
  if (!res.ok) throwSheetsError(res.status);
  return getAccounts(accessToken, spreadsheetId);
}

export async function renameAccount(
  accessToken: string,
  spreadsheetId: string,
  name: string,
  newName: string
): Promise<{ accounts: Account[]; renamed: number }> {
  const clean = newName.trim().slice(0, 50);
  if (!clean) throw new Error("Account name is empty.");
  const rows = parseAccountRows(
    await readTabValues(accessToken, spreadsheetId, ACCOUNTS_TAB, "A2:B")
  );
  const target = rows.find((a) => a.name.toLowerCase() === name.toLowerCase());
  if (!target) throw new Error("That account is not in the list.");
  if (
    rows.some((a) => a.row !== target.row && a.name.toLowerCase() === clean.toLowerCase())
  ) {
    throw new Error("An account with that name already exists.");
  }
  await batchUpdateCells(accessToken, spreadsheetId, [
    { range: `${ACCOUNTS_TAB}!A${target.row}`, values: [[clean]] },
  ]);
  // Entries pointing at the old name move with it, so nothing is orphaned.
  // (Blank-account entries belong to the FIRST account, so renaming the
  // first account needs no entry rewrite — they follow it automatically.)
  const txs = await getAllTransactions(accessToken, spreadsheetId);
  const matches = txs.filter(
    (t) => (t.linkedAccount ?? "").trim() === target.name && t.tab && t.row
  );
  await batchUpdateCells(
    accessToken,
    spreadsheetId,
    matches.map((t) => ({ range: `${t.tab}!H${t.row}`, values: [[clean]] }))
  );
  return { accounts: await getAccounts(accessToken, spreadsheetId), renamed: matches.length };
}

export async function deleteAccount(
  accessToken: string,
  spreadsheetId: string,
  name: string
): Promise<Account[]> {
  const rows = parseAccountRows(
    await readTabValues(accessToken, spreadsheetId, ACCOUNTS_TAB, "A2:B")
  );
  const target = rows.find((a) => a.name.toLowerCase() === name.toLowerCase());
  if (!target) throw new Error("That account is not in the list.");
  if (rows.length === 1) {
    throw new Error("The last account can't be removed.");
  }
  const txs = await getAllTransactions(accessToken, spreadsheetId);
  const isDefault = rows[0]?.row === target.row;
  const count = txs.filter((t) => {
    const acc = (t.linkedAccount ?? "").trim();
    if (acc) return acc === target.name;
    return isDefault; // blank entries belong to the first account
  }).length;
  if (count > 0) {
    throw new Error(
      `That account still has ${count} entr${count === 1 ? "y" : "ies"}. Move them to another account first, or delete them.`
    );
  }
  await clearRange(accessToken, spreadsheetId, ACCOUNTS_TAB, `A${target.row}:B${target.row}`);
  return getAccounts(accessToken, spreadsheetId);
}

// --- Recurring -------------------------------------------------------------

export const RECURRING_TAB = "Recurring";
const RECURRING_HEADERS = ["Category", "Description", "Amount", "Day", "Status"];

interface RecurringRow extends MarkedPattern {
  row: number;
}

function parseRecurringRows(rows: string[][]): RecurringRow[] {
  return rows
    .map((r, i) => ({
      category: (r[0] ?? "").trim(),
      description: (r[1] ?? "").trim(),
      amount: Number(r[2] ?? 0) || 0,
      day: Math.min(31, Math.max(1, Number(r[3] ?? 1) || 1)),
      status: (r[4] ?? "").trim().toLowerCase() === "paused"
        ? "paused"
        : (r[4] ?? "").trim().toLowerCase() === "dismissed"
          ? "dismissed"
          : "active",
      row: i + 2,
    }))
    .filter((p) => p.category && p.amount > 0) as RecurringRow[];
}

function toMarked(rows: RecurringRow[]): MarkedPattern[] {
  return rows.map(({ category, description, amount, day, status }) => ({
    category,
    description,
    amount,
    day,
    status,
  }));
}

/**
 * Read the user's marked recurring patterns. The tab is created empty on
 * first use — nothing is seeded, the user (or the auto-detection display)
 * adds patterns deliberately.
 */
export async function getRecurringPatterns(
  accessToken: string,
  spreadsheetId: string
): Promise<MarkedPattern[]> {
  const rows = parseRecurringRows(
    await readTabOrEnsure(accessToken, spreadsheetId, RECURRING_TAB, "A2:E", RECURRING_HEADERS)
  );
  return toMarked(rows);
}

function cleanPattern(input: {
  category: string;
  description: string;
  amount: number;
  day: number;
  status?: string;
}): MarkedPattern {
  const category = input.category.trim().slice(0, 50);
  if (!category) throw new Error("A category is required.");
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("The amount must be more than zero.");
  }
  return {
    category,
    description: input.description.trim().slice(0, 100),
    amount,
    day: Math.min(31, Math.max(1, Math.round(Number(input.day) || 1))),
    status:
      input.status === "paused"
        ? "paused"
        : input.status === "dismissed"
          ? "dismissed"
          : "active",
  };
}

/**
 * Mark a pattern as recurring (or update the existing mark for the same
 * category+description — marking twice never duplicates).
 */
export async function upsertRecurringPattern(
  accessToken: string,
  spreadsheetId: string,
  input: {
    category: string;
    description: string;
    amount: number;
    day: number;
    status?: string;
  }
): Promise<MarkedPattern[]> {
  const clean = cleanPattern(input);
  const rows = parseRecurringRows(
    await readTabValues(accessToken, spreadsheetId, RECURRING_TAB, "A2:E")
  );
  const existing = rows.find(
    (p) =>
      patternKey(p.category, p.description) ===
      patternKey(clean.category, clean.description)
  );
  const values = [[clean.category, clean.description, String(clean.amount), String(clean.day), clean.status]];
  if (existing) {
    await batchUpdateCells(accessToken, spreadsheetId, [
      { range: `${RECURRING_TAB}!A${existing.row}:E${existing.row}`, values },
    ]);
  } else {
    const res = await sheetsFetch(
      accessToken,
      `/${spreadsheetId}/values/${encodeURIComponent(RECURRING_TAB)}!A:E:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: "POST", body: JSON.stringify({ values }) }
    );
    if (!res.ok) throwSheetsError(res.status);
  }
  return getRecurringPatterns(accessToken, spreadsheetId);
}

export async function deleteRecurringPattern(
  accessToken: string,
  spreadsheetId: string,
  category: string,
  description: string
): Promise<MarkedPattern[]> {
  const rows = parseRecurringRows(
    await readTabValues(accessToken, spreadsheetId, RECURRING_TAB, "A2:E")
  );
  const target = rows.find(
    (p) =>
      patternKey(p.category, p.description) ===
      patternKey(category.trim(), description.trim())
  );
  if (!target) throw new Error("That pattern is not in the list.");
  await clearRange(accessToken, spreadsheetId, RECURRING_TAB, `A${target.row}:E${target.row}`);
  return getRecurringPatterns(accessToken, spreadsheetId);
}

// --- Budgets ---------------------------------------------------------------

export const BUDGETS_TAB = "Budgets";
const BUDGETS_HEADERS = ["Month", "Target"];

interface BudgetRow extends Budget {
  row: number;
}

function parseBudgetRows(rows: string[][]): BudgetRow[] {
  return rows
    .map((r, i) => ({
      month: (r[0] ?? "").trim(),
      target: Number(r[1] ?? 0) || 0,
      row: i + 2,
    }))
    .filter((b) => /^\d{4}-\d{2}$/.test(b.month) && b.target > 0)
    .sort((a, b) => a.month.localeCompare(b.month)) as BudgetRow[];
}

function toBudgets(rows: BudgetRow[]): Budget[] {
  return rows.map(({ month, target }) => ({ month, target }));
}

/**
 * Read the monthly targets. The tab is created empty on first use —
 * no target means the pace card falls back to income.
 */
export async function getBudgets(
  accessToken: string,
  spreadsheetId: string
): Promise<Budget[]> {
  const rows = parseBudgetRows(
    await readTabOrEnsure(accessToken, spreadsheetId, BUDGETS_TAB, "A2:B", BUDGETS_HEADERS)
  );
  return toBudgets(rows);
}

/** Set (or change) the target for one month — upsert by month. */
export async function setBudget(
  accessToken: string,
  spreadsheetId: string,
  month: string,
  target: number
): Promise<Budget[]> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Invalid month.");
  if (!Number.isFinite(target) || target <= 0) {
    throw new Error("The target must be more than zero.");
  }
  const rows = parseBudgetRows(
    await readTabValues(accessToken, spreadsheetId, BUDGETS_TAB, "A2:B")
  );
  const existing = rows.find((b) => b.month === month);
  const values = [[month, String(Math.round(target))]];
  if (existing) {
    await batchUpdateCells(accessToken, spreadsheetId, [
      { range: `${BUDGETS_TAB}!A${existing.row}:B${existing.row}`, values },
    ]);
  } else {
    const res = await sheetsFetch(
      accessToken,
      `/${spreadsheetId}/values/${encodeURIComponent(BUDGETS_TAB)}!A:B:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: "POST", body: JSON.stringify({ values }) }
    );
    if (!res.ok) throwSheetsError(res.status);
  }
  return getBudgets(accessToken, spreadsheetId);
}

/** Remove the target for one month (the month then falls back to the
    carried-forward target, or to income). */
export async function deleteBudget(
  accessToken: string,
  spreadsheetId: string,
  month: string
): Promise<Budget[]> {
  const rows = parseBudgetRows(
    await readTabValues(accessToken, spreadsheetId, BUDGETS_TAB, "A2:B")
  );
  const target = rows.find((b) => b.month === month);
  if (!target) throw new Error("No target is set for that month.");
  await clearRange(accessToken, spreadsheetId, BUDGETS_TAB, `A${target.row}:B${target.row}`);
  return getBudgets(accessToken, spreadsheetId);
}

// --- Transfers ---------------------------------------------------------------

export interface NewTransferInput {
  fromAccount: string;
  toAccount: string;
  amount: number;
  date: string; // YYYY-MM-DD
  description: string;
}

/**
 * Move money between two accounts: a Debit out of one and a Credit into the
 * other, sharing one Link ID so reports know they are the same move. If the
 * second half fails, the first half is rolled back so no orphaned half is
 * left behind.
 */
export async function createTransfer(
  accessToken: string,
  spreadsheetId: string,
  input: NewTransferInput
): Promise<{ out: Transaction; in: Transaction }> {
  if (input.fromAccount.trim() === input.toAccount.trim()) {
    throw new Error("Pick two different accounts.");
  }
  const linkId = newId();
  const out = await appendTransaction(accessToken, spreadsheetId, {
    date: input.date,
    type: "Debit",
    category: TRANSFER_CATEGORY,
    description: input.description,
    amount: input.amount,
    linkedAccount: input.fromAccount,
    linkId,
  });
  try {
    const inn = await appendTransaction(accessToken, spreadsheetId, {
      date: input.date,
      type: "Credit",
      category: TRANSFER_CATEGORY,
      description: input.description,
      amount: input.amount,
      linkedAccount: input.toAccount,
      linkId,
    });
    return { out, in: inn };
  } catch (err) {
    // Roll back the first half (best-effort) so it doesn't linger alone.
    try {
      const all = await getAllTransactions(accessToken, spreadsheetId);
      const leg = all.find((t) => t.id === out.id);
      if (leg?.tab && leg?.row) {
        await clearRange(accessToken, spreadsheetId, leg.tab, `A${leg.row}:J${leg.row}`);
      }
    } catch {
      // The half stays; its Link ID still marks it as a transfer, and the
      // user can delete it from the app (which trashes it).
    }
    throw err;
  }
}

// --- Notes -----------------------------------------------------------------

export const NOTES_TAB = "Notes";
const NOTES_HEADERS = ["ID", "Created", "Title", "Body"];

export async function getNotes(
  accessToken: string,
  spreadsheetId: string
): Promise<Note[]> {
  const rows = await readTabOrEnsure(accessToken, spreadsheetId, NOTES_TAB, "A2:D", NOTES_HEADERS);
  const out: Note[] = [];
  rows.forEach((r, i) => {
    const [id, created, title, body] = r;
    if (!id && !title && !body) return;
    out.push({
      id: id || `note-${i + 2}`,
      created: created || "",
      title: title || "",
      body: body || "",
      row: i + 2,
    });
  });
  out.sort((a, b) => (a.created < b.created ? 1 : -1));
  return out;
}

export async function addNote(
  accessToken: string,
  spreadsheetId: string,
  title: string,
  body: string
): Promise<Note> {
  await ensureTab(accessToken, spreadsheetId, NOTES_TAB, NOTES_HEADERS);
  const note: Note = {
    id: newId(),
    created: new Date().toISOString().slice(0, 10),
    title: title.trim().slice(0, 200),
    body: body.trim().slice(0, 5000),
  };
  const res = await sheetsFetch(
    accessToken,
    `/${spreadsheetId}/values/${encodeURIComponent(NOTES_TAB)}!A:D:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      body: JSON.stringify({ values: [[note.id, note.created, note.title, note.body]] }),
    }
  );
  if (!res.ok) throwSheetsError(res.status);
  return note;
}

export async function updateNote(
  accessToken: string,
  spreadsheetId: string,
  id: string,
  row: number,
  title: string,
  body: string
): Promise<Note> {
  const rows = await readTabValues(accessToken, spreadsheetId, NOTES_TAB, `A${row}:D${row}`);
  const current = rows[0] ?? [];
  if (current[0] !== id) {
    throw new Error("That note changed since it was loaded. Refresh and try again.");
  }
  const note: Note = {
    id,
    created: current[1] ?? "",
    title: title.trim().slice(0, 200),
    body: body.trim().slice(0, 5000),
    row,
  };
  const res = await sheetsFetch(
    accessToken,
    `/${spreadsheetId}/values/${encodeURIComponent(NOTES_TAB)}!A${row}:D${row}?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ values: [[note.id, note.created, note.title, note.body]] }) }
  );
  if (!res.ok) throwSheetsError(res.status);
  return note;
}

export async function deleteNote(
  accessToken: string,
  spreadsheetId: string,
  id: string,
  row: number
): Promise<void> {
  const rows = await readTabValues(accessToken, spreadsheetId, NOTES_TAB, `A${row}:D${row}`);
  const current = rows[0] ?? [];
  if (current[0] !== id) {
    throw new Error("That note changed since it was loaded. Refresh and try again.");
  }
  await clearRange(accessToken, spreadsheetId, NOTES_TAB, `A${row}:D${row}`);
}

// --- Import ------------------------------------------------------------------

export interface ImportRow {
  date: string;
  type: TxType;
  category: string;
  description: string;
  amount: number;
  linkedAccount?: string;
}

const IMPORT_MAX_ROWS = 500;

/**
 * Import validated rows, grouped by month tab so each month costs one
 * append call instead of one per row. Rows are validated up front; the
 * invalid ones are reported back and never written.
 */
export async function importTransactions(
  accessToken: string,
  spreadsheetId: string,
  entries: ImportRow[]
): Promise<{ imported: number; failed: { index: number; reason: string }[] }> {
  if (entries.length > IMPORT_MAX_ROWS) {
    throw new Error(`Import is limited to ${IMPORT_MAX_ROWS} rows at a time.`);
  }
  const failed: { index: number; reason: string }[] = [];
  const byMonth = new Map<string, string[][]>();
  entries.forEach((e, i) => {
    const month = Number(String(e.date ?? "").slice(5, 7));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.date ?? "")) || month < 1 || month > 12) {
      failed.push({ index: i, reason: "bad date" });
      return;
    }
    if (e.type !== "Debit" && e.type !== "Credit") {
      failed.push({ index: i, reason: "bad type" });
      return;
    }
    if (typeof e.category !== "string" || !e.category.trim()) {
      failed.push({ index: i, reason: "missing category" });
      return;
    }
    if (typeof e.amount !== "number" || !Number.isFinite(e.amount) || e.amount <= 0) {
      failed.push({ index: i, reason: "bad amount" });
      return;
    }
    const tab = MONTHS[month - 1];
    const list = byMonth.get(tab) ?? [];
    list.push([
      newId(),
      e.date,
      e.type,
      e.category.trim().slice(0, 50),
      (e.description ?? "").trim().slice(0, 200),
      String(e.amount),
      "BDT",
      (e.linkedAccount ?? "").trim().slice(0, 50),
      "",
      "",
    ]);
    byMonth.set(tab, list);
  });
  let imported = 0;
  for (const [tab, values] of byMonth) {
    const res = await sheetsFetch(
      accessToken,
      `/${spreadsheetId}/values/${encodeURIComponent(tab)}!A:J:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: "POST", body: JSON.stringify({ values }) }
    );
    if (!res.ok) throwSheetsError(res.status);
    imported += values.length;
  }
  return { imported, failed };
}
