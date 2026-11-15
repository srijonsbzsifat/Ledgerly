import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Read the Google access token from the (server-side, encrypted) NextAuth JWT.
 * Tokens are never sent to the browser; API routes use this helper instead.
 */
export async function getAccessToken(req: NextRequest): Promise<string | null> {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token || token.error) return null;
  return typeof token.accessToken === "string" ? token.accessToken : null;
}

export const SHEET_COOKIE = "cash-sheet-id";

/** Cookie options for the connected-sheet cookie, shared by /api/sheet and /api/sheet/create. */
export const SHEET_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365, // 1 year
  secure: process.env.NODE_ENV === "production",
};

/**
 * The sheet cookie is OWNER-SCOPED: its value is `<google-user-id>:<sheet-id>`.
 *
 * The first version of this app stored the bare sheet id, so the connection
 * was per-device, not per-user: after user A signed out, user B signing in
 * on the same device inherited A's sheet. Scoping the cookie to the Google
 * user id (`sub` in the NextAuth JWT) closes that leak server-side — every
 * API route verifies the cookie's owner against the signed-in user before
 * touching the sheet.
 *
 * A cookie value with no owner part is a legacy cookie from before this
 * scoping; it is never trusted and is cleared on sight.
 */
export function parseSheetCookie(
  value: string | undefined
): { owner: string; spreadsheetId: string } | null {
  if (!value) return null;
  const sep = value.indexOf(":");
  if (sep <= 0 || sep === value.length - 1) return null;
  return { owner: value.slice(0, sep), spreadsheetId: value.slice(sep + 1) };
}

export function encodeSheetCookie(owner: string, spreadsheetId: string) {
  return `${owner}:${spreadsheetId}`;
}

/** The signed-in user (Google user id + access token), or an auth error. */
export async function getSessionUser(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token || token.error) {
    return { ok: false, error: "Not signed in.", status: 401 } as const;
  }
  const accessToken =
    typeof token.accessToken === "string" ? token.accessToken : null;
  const userId = typeof token.sub === "string" ? token.sub : null;
  if (!accessToken || !userId) {
    return { ok: false, error: "Not signed in.", status: 401 } as const;
  }
  return { ok: true, accessToken, userId } as const;
}

/**
 * The sheet the CURRENT user has connected, verified against the session.
 * Returns the access token + sheet id, or an error. `clearCookie` is true
 * whenever the stored cookie must not survive (missing owner, legacy value,
 * or owned by a different user) — callers clear it on the response.
 */
export async function getSheetContext(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user.ok) return user;
  const parsed = parseSheetCookie(req.cookies.get(SHEET_COOKIE)?.value);
  if (!parsed || parsed.owner !== user.userId) {
    return {
      ok: false,
      error: "No sheet connected.",
      status: 400,
      clearCookie: true,
    } as const;
  }
  return {
    ok: true,
    accessToken: user.accessToken,
    userId: user.userId,
    spreadsheetId: parsed.spreadsheetId,
  } as const;
}

/** Expire the sheet cookie on a response. */
export function clearSheetCookie(res: NextResponse) {
  res.cookies.set(SHEET_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production",
  });
}
