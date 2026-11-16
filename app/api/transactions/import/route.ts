import { NextResponse, type NextRequest } from "next/server";
import { importTransactions, type ImportRow, sheetsErrorStatus } from "@/lib/sheets";
import { clearSheetCookie, getSheetContext } from "@/lib/server-auth";

function contextError(ctx: { error: string; status: number; clearCookie?: boolean }) {
  const res = NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (ctx.clearCookie) clearSheetCookie(res);
  return res;
}

/** POST /api/transactions/import — append validated rows, grouped by month. */
export async function POST(req: NextRequest) {
  const ctx = await getSheetContext(req);
  if (!ctx.ok) return contextError(ctx);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const entries = (body as { entries?: unknown }).entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "No entries to import." }, { status: 400 });
  }
  try {
    const result = await importTransactions(
      ctx.accessToken,
      ctx.spreadsheetId,
      entries as ImportRow[]
    );
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not import." },
      { status: sheetsErrorStatus(err) }
    );
  }
}
