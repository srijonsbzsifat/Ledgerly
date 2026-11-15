import { MONTHS, type SheetInfo, type Transaction, type TxType } from "./types";

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
  return fetch(`${SHEETS_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function friendlyError(status: number): string {
  if (status === 401 || status === 403)
    return "Google refused access to this sheet. Make sure you are signed in with an account that can open it, then try again.";
  if (status === 404)
    return "No spreadsheet was found at that link or ID. Check it and try again.";
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
  const name = title.trim().slice(0, 100) || "Cash 2026";
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
  if (!create.ok) throw new Error(friendlyError(create.status));
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
  if (!res.ok) throw new Error(friendlyError(res.status));
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

/** Read every monthly tab (January–December). Missing tabs are skipped. */
export async function getAllTransactions(
  accessToken: string,
  spreadsheetId: string
): Promise<Transaction[]> {
  const results = await Promise.all(
    MONTHS.map(async (month) => {
      const res = await sheetsFetch(
        accessToken,
        `/${spreadsheetId}/values/${encodeURIComponent(month)}!A2:J`
      );
      if (!res.ok) return [] as Transaction[]; // missing/empty tab: tolerate
      const data = (await res.json()) as SheetValuesResponse;
      const rows = data.values ?? [];
      const out: Transaction[] = [];
      rows.forEach((row, idx) => {
        const [id, date, type, category, description, amount, currency] = row;
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
          tab: month,
          row: idx + 2, // A2 is sheet row 2
        });
      });
      return out;
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
      "",
      "",
      "",
    ],
  ];
  const res = await sheetsFetch(
    accessToken,
    `/${spreadsheetId}/values/${encodeURIComponent(tab)}!A:J:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values }) }
  );
  if (!res.ok) throw new Error(friendlyError(res.status));
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
 * was already deleted) in the meantime. The row is cleared, not removed —
 * blank rows are skipped when loading, and clearing never shifts the rows
 * below it. This cannot be undone from the app; the sheet's own version
 * history is the only way back.
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
  if (!read.ok) throw new Error(friendlyError(read.status));
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

  const clear = await sheetsFetch(
    accessToken,
    "/" + spreadsheetId + "/values/" + encodeURIComponent(tab) + "!A" + input.row + ":J" + input.row + ":clear",
    { method: "POST", body: JSON.stringify({}) }
  );
  if (!clear.ok) throw new Error(friendlyError(clear.status));
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
  if (!read.ok) throw new Error(friendlyError(read.status));
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
  // Columns H-J are not shown in the app; keep whatever is already there.
  const keep = [current[7] ?? "", current[8] ?? "", current[9] ?? ""];

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
        keep[0],
        keep[1],
        keep[2],
      ],
    ];
    const put = await sheetsFetch(
      accessToken,
      "/" + spreadsheetId + "/values/" + encodeURIComponent(tab) + "!A" + input.row + ":J" + input.row + "?valueInputOption=USER_ENTERED",
      { method: "PUT", body: JSON.stringify({ values }) }
    );
    if (!put.ok) throw new Error(friendlyError(put.status));
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
  if (!clear.ok) throw new Error(friendlyError(clear.status));
  return appendTransaction(
    accessToken,
    spreadsheetId,
    {
      date: input.date,
      type: input.type,
      category: input.category,
      description: input.description,
      amount: input.amount,
    },
    isSyntheticId(input.id) ? undefined : input.id
  );
}
