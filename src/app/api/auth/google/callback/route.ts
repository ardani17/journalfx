import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";
import { authHeaders, exchangeGoogleCode, getGoogleConfig, GOOGLE_FLOW_COOKIE, googleFlowCookieOptions, readGoogleFlow } from "@/server/google-oauth";
import { findOrCreateGoogleUser } from "@/server/services/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirect(location: string) {
  const res = new NextResponse(null, { status: 303, headers: { ...authHeaders, location } });
  res.cookies.set(GOOGLE_FLOW_COOKIE, "", { ...googleFlowCookieOptions(), maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  const config = getGoogleConfig();
  if (!config) return redirect("/login?error=unavailable");

  const flow = await readGoogleFlow(config, req.cookies.get(GOOGLE_FLOW_COOKIE)?.value);
  if (!flow) return redirect("/login?error=expired");

  const query = req.nextUrl.searchParams;
  const states = query.getAll("state");
  if (states.length !== 1 || states[0] !== flow.state) return redirect("/login?error=invalid");
  if (query.get("error") === "access_denied") return redirect("/login?error=cancelled");
  if (query.has("error") || query.getAll("code").length !== 1) return redirect("/login?error=invalid");

  try {
    const identity = await exchangeGoogleCode(config, query, flow);
    const user = await findOrCreateGoogleUser(identity);
    const session = await signSession({ sub: user.id, email: user.email, name: user.name });
    const res = redirect("/dashboard");
    res.cookies.set(SESSION_COOKIE, session, { ...sessionCookieOptions, secure: config.origin.protocol === "https:" });
    return res;
  } catch {
    console.warn("[google-auth] Callback rejected");
    return redirect("/login?error=invalid");
  }
}
