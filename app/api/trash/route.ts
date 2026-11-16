import { NextResponse, type NextRequest } from "next/server";
import {
  sheetsErrorStatus,
  deleteTrashEntry,
  getTrashEntries,
  restoreTrashEntry,
} from "@/lib/sheets";
import { clearSheetCookie, getSheetContext } from "@/lib/server-auth";

function contextError(ctx: { error: string; status: number; clearCookie?: boolean }) {
  const res = NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (ctx.clearCookie) clearSheetCookie(res);
  return res;
}

/** GET /api/trash — deleted entries (entries older than 30 days expire on read). */
export async function GET(req: NextRequest) {
  const ctx = await getSheetContext(req);
  if (!ctx.ok) return contextError(ctx);
  try {
    const entries = await getTrashEntries(ctx.accessToken, ctx.spreadsheetId);
    return NextResponse.json(
      { entries },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load the trash." },
      { status: sheetsErrorStatus(err) }
    );
  }
}

/** POST /api/trash — { action: "restore" | "delete", row } */
export async function POST(req: NextRequest) {
  const ctx = await getSheetContext(req);
  if (!ctx.ok) return contextError(ctx);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  if (typeof b.row !== "number" || !Number.isInteger(b.row) || b.row < 2) {
    return NextResponse.json({ error: "That entry could not be identified." }, { status: 400 });
  }
  try {
    if (b.action === "restore") {
      const transaction = await restoreTrashEntry(ctx.accessToken, ctx.spreadsheetId, b.row);
      return NextResponse.json({ transaction });
    }
    if (b.action === "delete") {
      await deleteTrashEntry(ctx.accessToken, ctx.spreadsheetId, b.row);
      return NextResponse.json({ deleted: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update the trash." },
      { status: sheetsErrorStatus(err) }
    );
  }
}
