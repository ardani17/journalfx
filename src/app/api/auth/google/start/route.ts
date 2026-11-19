import { NextResponse } from "next/server";
import { authHeaders, getGoogleConfig, GOOGLE_FLOW_COOKIE, googleFlowCookieOptions, startGoogleFlow } from "@/server/google-oauth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const config = getGoogleConfig();
  if (!config) {
    return NextResponse.json({ ok: false, error: "Login Google belum dikonfigurasi." }, { status: 503, headers: authHeaders });
  }
  if (req.headers.get("origin") !== config.origin.origin) {
    return NextResponse.json({ ok: false, error: "Permintaan login ditolak." }, { status: 403, headers: authHeaders });
  }
  try {
    const { authorizationUrl, cookie } = await startGoogleFlow(config);
    const res = NextResponse.json({ ok: true, data: { authorizationUrl } }, { headers: authHeaders });
    res.cookies.set(GOOGLE_FLOW_COOKIE, cookie, googleFlowCookieOptions());
    return res;
  } catch {
    return NextResponse.json({ ok: false, error: "Layanan login Google sedang tidak tersedia." }, { status: 503, headers: authHeaders });
  }
}
