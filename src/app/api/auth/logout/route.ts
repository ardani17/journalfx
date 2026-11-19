import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { getAppOrigin } from "@/lib/app-origin";
import { authHeaders, GOOGLE_FLOW_COOKIE, googleFlowCookieOptions } from "@/server/google-oauth";

export async function POST(req: Request) {
  const origin = getAppOrigin();
  if (!origin || req.headers.get("origin") !== origin.origin) {
    return NextResponse.json({ ok: false, error: "Permintaan keluar ditolak." }, { status: 403, headers: authHeaders });
  }
  const res = NextResponse.json({ ok: true, data: { loggedOut: true } }, { headers: authHeaders });
  if (origin.protocol === "https:") res.headers.set("Clear-Site-Data", '"cache"');
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, secure: origin.protocol === "https:", maxAge: 0 });
  res.cookies.set(GOOGLE_FLOW_COOKIE, "", { ...googleFlowCookieOptions(), maxAge: 0 });
  return res;
}
