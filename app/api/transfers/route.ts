import { NextResponse, type NextRequest } from "next/server";
import { createTransfer, sheetsErrorStatus } from "@/lib/sheets";
import { clearSheetCookie, getSheetContext } from "@/lib/server-auth";

function contextError(ctx: { error: string; status: number; clearCookie?: boolean }) {
  const res = NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (ctx.clearCookie) clearSheetCookie(res);
  return res;
}

/** POST /api/transfers — move money between two accounts (two linked rows). */
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
  if (
    typeof b.fromAccount !== "string" ||
    !b.fromAccount.trim() ||
    typeof b.toAccount !== "string" ||
    !b.toAccount.trim() ||
    typeof b.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(b.date) ||
    typeof b.amount !== "number" ||
    !Number.isFinite(b.amount) ||
    b.amount <= 0
  ) {
    return NextResponse.json(
      { error: "Pick two accounts, a valid date and an amount above 0." },
      { status: 400 }
    );
  }
  try {
    const { out, in: inn } = await createTransfer(ctx.accessToken, ctx.spreadsheetId, {
      fromAccount: b.fromAccount.trim(),
      toAccount: b.toAccount.trim(),
      amount: b.amount,
      date: b.date,
      description: typeof b.description === "string" ? b.description.trim() : "",
    });
    return NextResponse.json({ out, in: inn }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the transfer." },
      { status: sheetsErrorStatus(err) }
    );
  }
}
