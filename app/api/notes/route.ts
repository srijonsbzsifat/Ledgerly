import { NextResponse, type NextRequest } from "next/server";
import { addNote, deleteNote, getNotes, updateNote, sheetsErrorStatus } from "@/lib/sheets";
import { clearSheetCookie, getSheetContext } from "@/lib/server-auth";

function contextError(ctx: { error: string; status: number; clearCookie?: boolean }) {
  const res = NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (ctx.clearCookie) clearSheetCookie(res);
  return res;
}

/** GET /api/notes — notes from the sheet's Notes tab. */
export async function GET(req: NextRequest) {
  const ctx = await getSheetContext(req);
  if (!ctx.ok) return contextError(ctx);
  try {
    const notes = await getNotes(ctx.accessToken, ctx.spreadsheetId);
    return NextResponse.json(
      { notes },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load notes." },
      { status: sheetsErrorStatus(err) }
    );
  }
}

/**
 * POST /api/notes — one of:
 * { action: "add", title, body } | { action: "update", id, row, title, body }
 * { action: "delete", id, row }
 */
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
  try {
    if (b.action === "add" && typeof b.title === "string") {
      const note = await addNote(
        ctx.accessToken,
        ctx.spreadsheetId,
        b.title,
        typeof b.body === "string" ? b.body : ""
      );
      return NextResponse.json({ note }, { status: 201 });
    }
    if (
      b.action === "update" &&
      typeof b.id === "string" &&
      typeof b.row === "number" &&
      typeof b.title === "string"
    ) {
      const note = await updateNote(
        ctx.accessToken,
        ctx.spreadsheetId,
        b.id,
        b.row,
        b.title,
        typeof b.body === "string" ? b.body : ""
      );
      return NextResponse.json({ note });
    }
    if (b.action === "delete" && typeof b.id === "string" && typeof b.row === "number") {
      await deleteNote(ctx.accessToken, ctx.spreadsheetId, b.id, b.row);
      return NextResponse.json({ deleted: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the note." },
      { status: sheetsErrorStatus(err) }
    );
  }
}
