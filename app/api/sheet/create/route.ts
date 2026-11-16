import { NextResponse, type NextRequest } from "next/server";
import { createCashSheet, sheetsErrorStatus } from "@/lib/sheets";
import {
  SHEET_COOKIE,
  SHEET_COOKIE_OPTS,
  encodeSheetCookie,
  getSessionUser,
} from "@/lib/server-auth";

/**
 * POST /api/sheet/create { title? } — create a brand-new spreadsheet in the
 * signed-in user's Google Drive, set up in the Cash 2026 format (12 monthly
 * tabs, header row, frozen header), and connect it — same owner-scoped
 * cookie as connecting an existing sheet, so another account on this device
 * never inherits it.
 *
 * No new Google permission is needed: spreadsheets.create works with the
 * spreadsheets scope the app already requests.
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
  const title = (body as { title?: unknown })?.title;
  if (title !== undefined && typeof title !== "string") {
    return NextResponse.json(
      { error: "Sheet name must be text." },
      { status: 400 }
    );
  }
  try {
    const info = await createCashSheet(user.accessToken, title ?? `Cash ${new Date().getFullYear()}`);
    const res = NextResponse.json({ connected: true, ...info });
    res.cookies.set(
      SHEET_COOKIE,
      encodeSheetCookie(user.userId, info.id),
      SHEET_COOKIE_OPTS
    );
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create sheet." },
      { status: sheetsErrorStatus(err) }
    );
  }
}
