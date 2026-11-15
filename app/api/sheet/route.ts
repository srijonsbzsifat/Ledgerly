import { NextResponse, type NextRequest } from "next/server";
import { getSheetInfo, parseSheetId } from "@/lib/sheets";
import {
  SHEET_COOKIE,
  SHEET_COOKIE_OPTS,
  clearSheetCookie,
  encodeSheetCookie,
  getSessionUser,
  getSheetContext,
} from "@/lib/server-auth";

/** GET /api/sheet — info about the sheet the CURRENT user connected. */
export async function GET(req: NextRequest) {
  const ctx = await getSheetContext(req);
  if (!ctx.ok) {
    if (ctx.status === 401) {
      return NextResponse.json({ error: ctx.error }, { status: 401 });
    }
    // No sheet for this user (no cookie, legacy cookie, or another user's
    // cookie) — report disconnected and clear the unusable cookie.
    const res = NextResponse.json(
      { connected: false },
      { headers: { "Cache-Control": "no-store" } }
    );
    if (ctx.clearCookie) clearSheetCookie(res);
    return res;
  }
  try {
    const info = await getSheetInfo(ctx.accessToken, ctx.spreadsheetId);
    return NextResponse.json(
      { connected: true, ...info },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load sheet." },
      { status: 502 }
    );
  }
}

/**
 * POST /api/sheet { input } — validate a pasted sheet URL/ID via the Sheets
 * API and, on success, remember it in an httpOnly cookie SCOPED TO THE
 * SIGNED-IN USER, so another account on the same device never inherits it.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user.ok) {
    return NextResponse.json({ error: user.error }, { status: user.status });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const input = (body as { input?: unknown })?.input;
  if (typeof input !== "string") {
    return NextResponse.json(
      { error: "Paste a Google Sheet link or ID." },
      { status: 400 }
    );
  }
  const spreadsheetId = parseSheetId(input);
  if (!spreadsheetId) {
    return NextResponse.json(
      { error: "That doesn't look like a Google Sheet link or ID." },
      { status: 400 }
    );
  }
  try {
    const info = await getSheetInfo(user.accessToken, spreadsheetId);
    const res = NextResponse.json({ connected: true, ...info });
    res.cookies.set(
      SHEET_COOKIE,
      encodeSheetCookie(user.userId, spreadsheetId),
      SHEET_COOKIE_OPTS
    );
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not open sheet." },
      { status: 502 }
    );
  }
}

/** DELETE /api/sheet — disconnect the current sheet. */
export async function DELETE() {
  const res = NextResponse.json({ connected: false });
  clearSheetCookie(res);
  return res;
}
