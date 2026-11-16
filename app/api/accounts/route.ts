import { NextResponse, type NextRequest } from "next/server";
import {
  sheetsErrorStatus,
  addAccount,
  deleteAccount,
  getAccounts,
  renameAccount,
} from "@/lib/sheets";
import { clearSheetCookie, getSheetContext } from "@/lib/server-auth";

function contextError(ctx: { error: string; status: number; clearCookie?: boolean }) {
  const res = NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (ctx.clearCookie) clearSheetCookie(res);
  return res;
}

/** GET /api/accounts — the managed list (a Cash account is seeded on first use). */
export async function GET(req: NextRequest) {
  const ctx = await getSheetContext(req);
  if (!ctx.ok) return contextError(ctx);
  try {
    const accounts = await getAccounts(ctx.accessToken, ctx.spreadsheetId);
    return NextResponse.json(
      { accounts },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load accounts." },
      { status: sheetsErrorStatus(err) }
    );
  }
}

/**
 * POST /api/accounts — one of:
 * { action: "add", name, type? } | { action: "rename", name, newName }
 * { action: "delete", name }
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
    if (b.action === "add" && typeof b.name === "string") {
      const accounts = await addAccount(
        ctx.accessToken,
        ctx.spreadsheetId,
        b.name,
        typeof b.type === "string" ? b.type : "Cash"
      );
      return NextResponse.json({ accounts }, { status: 201 });
    }
    if (b.action === "rename" && typeof b.name === "string" && typeof b.newName === "string") {
      const { accounts, renamed } = await renameAccount(
        ctx.accessToken,
        ctx.spreadsheetId,
        b.name,
        b.newName
      );
      return NextResponse.json({ accounts, renamed });
    }
    if (b.action === "delete" && typeof b.name === "string") {
      const accounts = await deleteAccount(ctx.accessToken, ctx.spreadsheetId, b.name);
      return NextResponse.json({ accounts });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the change." },
      { status: sheetsErrorStatus(err) }
    );
  }
}
