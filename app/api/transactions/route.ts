import { NextResponse, type NextRequest } from "next/server";
import {
  appendTransaction,
  deleteTransaction,
  getAllTransactions,
  updateTransaction,
  type DeleteTransactionInput,
  type NewTransactionInput,
  type UpdateTransactionInput,
} from "@/lib/sheets";
import { clearSheetCookie, getSheetContext } from "@/lib/server-auth";

/** Error response for a sheet-context failure; clears a stale cookie. */
function contextError(ctx: { error: string; status: number; clearCookie?: boolean }) {
  const res = NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (ctx.clearCookie) clearSheetCookie(res);
  return res;
}

/** GET /api/transactions — all rows from every monthly tab, newest first. */
export async function GET(req: NextRequest) {
  const ctx = await getSheetContext(req);
  if (!ctx.ok) return contextError(ctx);
  try {
    const transactions = await getAllTransactions(
      ctx.accessToken,
      ctx.spreadsheetId
    );
    // Never cache: the sheet changes outside this app (chat additions,
    // other devices), and a cached response would hide new entries.
    return NextResponse.json(
      { transactions },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not load transactions.",
      },
      { status: 502 }
    );
  }
}

/** POST /api/transactions — append one row to the correct monthly tab. */
export async function POST(req: NextRequest) {
  const ctx = await getSheetContext(req);
  if (!ctx.ok) return contextError(ctx);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const b = body as Partial<NewTransactionInput>;
  if (
    typeof b.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(b.date) ||
    (b.type !== "Debit" && b.type !== "Credit") ||
    typeof b.category !== "string" ||
    !b.category.trim() ||
    typeof b.amount !== "number" ||
    !Number.isFinite(b.amount) ||
    b.amount <= 0
  ) {
    return NextResponse.json(
      { error: "Check the form: a valid date, type, category and an amount above 0 are required." },
      { status: 400 }
    );
  }
  try {
    const transaction = await appendTransaction(ctx.accessToken, ctx.spreadsheetId, {
      date: b.date,
      type: b.type,
      category: b.category.trim(),
      description: typeof b.description === "string" ? b.description.trim() : "",
      amount: b.amount,
    });
    return NextResponse.json({ transaction }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not save the entry.",
      },
      { status: 502 }
    );
  }
}

/** DELETE /api/transactions — clear one row. The client confirms first; the
 *  server re-checks the row still matches what was loaded before clearing it. */
export async function DELETE(req: NextRequest) {
  const ctx = await getSheetContext(req);
  if (!ctx.ok) return contextError(ctx);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const b = body as Partial<DeleteTransactionInput>;
  if (
    typeof b.id !== "string" ||
    !b.id ||
    typeof b.tab !== "string" ||
    !b.tab ||
    typeof b.row !== "number" ||
    !Number.isInteger(b.row) ||
    b.row < 2 ||
    typeof b.originalDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(b.originalDate) ||
    (b.originalType !== "Debit" && b.originalType !== "Credit") ||
    typeof b.originalAmount !== "number" ||
    !Number.isFinite(b.originalAmount)
  ) {
    return NextResponse.json(
      { error: "That entry could not be identified. Refresh the dashboard and try again." },
      { status: 400 }
    );
  }
  try {
    await deleteTransaction(ctx.accessToken, ctx.spreadsheetId, {
      id: b.id,
      tab: b.tab,
      row: b.row,
      originalDate: b.originalDate,
      originalType: b.originalType,
      originalAmount: b.originalAmount,
    });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not delete the entry.",
      },
      { status: 502 }
    );
  }
}

/** PUT /api/transactions — update one row in place (or move it to another month's tab). */
export async function PUT(req: NextRequest) {
  const ctx = await getSheetContext(req);
  if (!ctx.ok) return contextError(ctx);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const b = body as Partial<UpdateTransactionInput>;
  if (
    typeof b.id !== "string" ||
    !b.id ||
    typeof b.tab !== "string" ||
    !b.tab ||
    typeof b.row !== "number" ||
    !Number.isInteger(b.row) ||
    b.row < 2 ||
    typeof b.originalDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(b.originalDate) ||
    (b.originalType !== "Debit" && b.originalType !== "Credit") ||
    typeof b.originalAmount !== "number" ||
    !Number.isFinite(b.originalAmount) ||
    typeof b.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(b.date) ||
    (b.type !== "Debit" && b.type !== "Credit") ||
    typeof b.category !== "string" ||
    !b.category.trim() ||
    typeof b.amount !== "number" ||
    !Number.isFinite(b.amount) ||
    b.amount <= 0
  ) {
    return NextResponse.json(
      { error: "Check the form: a valid date, type, category and an amount above 0 are required." },
      { status: 400 }
    );
  }
  try {
    const transaction = await updateTransaction(ctx.accessToken, ctx.spreadsheetId, {
      id: b.id,
      tab: b.tab,
      row: b.row,
      originalDate: b.originalDate,
      originalType: b.originalType,
      originalAmount: b.originalAmount,
      date: b.date,
      type: b.type,
      category: b.category.trim(),
      description: typeof b.description === "string" ? b.description.trim() : "",
      amount: b.amount,
    });
    return NextResponse.json({ transaction });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not save the change.",
      },
      { status: 502 }
    );
  }
}
