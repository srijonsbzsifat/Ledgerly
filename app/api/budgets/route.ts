import { NextResponse, type NextRequest } from "next/server";
import {
  sheetsErrorStatus,
  deleteBudget,
  getBudgets,
  setBudget,
} from "@/lib/sheets";
import { clearSheetCookie, getSheetContext } from "@/lib/server-auth";

function contextError(ctx: { error: string; status: number; clearCookie?: boolean }) {
  const res = NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (ctx.clearCookie) clearSheetCookie(res);
  return res;
}

/** GET /api/budgets — the monthly targets (tab created empty on first use). */
export async function GET(req: NextRequest) {
  const ctx = await getSheetContext(req);
  if (!ctx.ok) return contextError(ctx);
  try {
    const budgets = await getBudgets(ctx.accessToken, ctx.spreadsheetId);
    return NextResponse.json(
      { budgets },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load budgets." },
      { status: sheetsErrorStatus(err) }
    );
  }
}

/**
 * POST /api/budgets — one of:
 * { action: "set", month: "YYYY-MM", target } | { action: "delete", month: "YYYY-MM" }
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
      b.action === "set" &&
      typeof b.month === "string" &&
      typeof b.target === "number"
    ) {
      const budgets = await setBudget(
        ctx.accessToken,
        ctx.spreadsheetId,
        b.month,
        b.target
      );
      return NextResponse.json({ budgets }, { status: 201 });
    }
    if (b.action === "delete" && typeof b.month === "string") {
      const budgets = await deleteBudget(ctx.accessToken, ctx.spreadsheetId, b.month);
      return NextResponse.json({ budgets });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the change." },
      { status: sheetsErrorStatus(err) }
    );
  }
}
