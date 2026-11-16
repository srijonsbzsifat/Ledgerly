import { NextResponse, type NextRequest } from "next/server";
import {
  sheetsErrorStatus,
  addCategory,
  deleteCategory,
  getCategories,
  renameCategory,
  reorderCategories,
} from "@/lib/sheets";
import type { TxType } from "@/lib/types";
import { clearSheetCookie, getSheetContext } from "@/lib/server-auth";

function contextError(ctx: { error: string; status: number; clearCookie?: boolean }) {
  const res = NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (ctx.clearCookie) clearSheetCookie(res);
  return res;
}

/** GET /api/categories — the managed list (created + seeded on first use). */
export async function GET(req: NextRequest) {
  const ctx = await getSheetContext(req);
  if (!ctx.ok) return contextError(ctx);
  try {
    const categories = await getCategories(ctx.accessToken, ctx.spreadsheetId);
    return NextResponse.json(
      { categories },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load categories." },
      { status: sheetsErrorStatus(err) }
    );
  }
}

/**
 * POST /api/categories — one of:
 * { action: "add", name, type } | { action: "rename", name, type, newName, renameEntries? }
 * { action: "delete", name, type } | { action: "reorder", ordered: [{ name, type }] }
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
    if (b.action === "add" && typeof b.name === "string" && (b.type === "Debit" || b.type === "Credit")) {
      const categories = await addCategory(ctx.accessToken, ctx.spreadsheetId, b.name, b.type as TxType);
      return NextResponse.json({ categories }, { status: 201 });
    }
    if (
      b.action === "rename" &&
      typeof b.name === "string" &&
      (b.type === "Debit" || b.type === "Credit") &&
      typeof b.newName === "string"
    ) {
      const { categories, renamed } = await renameCategory(
        ctx.accessToken,
        ctx.spreadsheetId,
        b.name,
        b.type as TxType,
        b.newName,
        b.renameEntries === true
      );
      return NextResponse.json({ categories, renamed });
    }
    if (b.action === "delete" && typeof b.name === "string" && (b.type === "Debit" || b.type === "Credit")) {
      const categories = await deleteCategory(ctx.accessToken, ctx.spreadsheetId, b.name, b.type as TxType);
      return NextResponse.json({ categories });
    }
    if (b.action === "reorder" && Array.isArray(b.ordered)) {
      const ordered = (b.ordered as Array<Record<string, unknown>>)
        .filter(
          (c) =>
            typeof c.name === "string" && (c.type === "Debit" || c.type === "Credit")
        )
        .map((c) => ({ name: c.name as string, type: c.type as TxType }));
      const categories = await reorderCategories(ctx.accessToken, ctx.spreadsheetId, ordered);
      return NextResponse.json({ categories });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the change." },
      { status: sheetsErrorStatus(err) }
    );
  }
}
