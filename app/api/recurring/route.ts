import { NextResponse, type NextRequest } from "next/server";
import {
  sheetsErrorStatus,
  deleteRecurringPattern,
  getRecurringPatterns,
  upsertRecurringPattern,
} from "@/lib/sheets";
import { clearSheetCookie, getSheetContext } from "@/lib/server-auth";

function contextError(ctx: { error: string; status: number; clearCookie?: boolean }) {
  const res = NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (ctx.clearCookie) clearSheetCookie(res);
  return res;
}

/** GET /api/recurring — the user's marked recurring patterns (tab created empty on first use). */
export async function GET(req: NextRequest) {
  const ctx = await getSheetContext(req);
  if (!ctx.ok) return contextError(ctx);
  try {
    const patterns = await getRecurringPatterns(ctx.accessToken, ctx.spreadsheetId);
    return NextResponse.json(
      { patterns },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load recurring patterns." },
      { status: sheetsErrorStatus(err) }
    );
  }
}

/**
 * POST /api/recurring — one of:
 * { action: "upsert", category, description, amount, day, status? } (mark or update)
 * { action: "delete", category, description } (unmark)
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
    if (
      b.action === "upsert" &&
      typeof b.category === "string" &&
      typeof b.description === "string" &&
      typeof b.amount === "number" &&
      typeof b.day === "number"
    ) {
      const patterns = await upsertRecurringPattern(
        ctx.accessToken,
        ctx.spreadsheetId,
        {
          category: b.category,
          description: b.description,
          amount: b.amount,
          day: b.day,
          status: typeof b.status === "string" ? b.status : undefined,
        }
      );
      return NextResponse.json({ patterns }, { status: 201 });
    }
    if (
      b.action === "delete" &&
      typeof b.category === "string" &&
      typeof b.description === "string"
    ) {
      const patterns = await deleteRecurringPattern(
        ctx.accessToken,
        ctx.spreadsheetId,
        b.category,
        b.description
      );
      return NextResponse.json({ patterns });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the change." },
      { status: sheetsErrorStatus(err) }
    );
  }
}
