import { NextResponse } from "next/server";
import { z } from "zod";
import { authHeaders, getGoogleConfig, GOOGLE_FLOW_COOKIE, googleFlowCookieOptions, startGoogleFlow } from "@/server/google-oauth";
import { getTurnstileConfig, verifyTurnstile } from "@/server/turnstile";

export const runtime = "nodejs";

const loginInput = z.strictObject({ turnstileToken: z.string().trim().min(1).max(2048) });

function rejectLogin(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status, headers: authHeaders });
}

export async function POST(req: Request) {
  const config = getGoogleConfig();
  if (!config) return rejectLogin(503, "Login Google belum dikonfigurasi.");

  if (req.headers.get("origin") !== config.origin.origin) {
    return rejectLogin(403, "Permintaan login ditolak.");
  }

  const turnstile = getTurnstileConfig();
  if (!turnstile) return rejectLogin(503, "Verifikasi keamanan belum dikonfigurasi.");

  const input = loginInput.safeParse(await req.json().catch(() => null));
  if (!input.success) return rejectLogin(400, "Selesaikan verifikasi keamanan sebelum masuk.");

  const verification = await verifyTurnstile(input.data.turnstileToken, turnstile.secretKey, config.origin.hostname);
  if (verification === "unavailable") {
    return rejectLogin(503, "Layanan verifikasi keamanan sedang tidak tersedia. Silakan coba lagi.");
  }
  if (verification === "rejected") {
    return rejectLogin(403, "Verifikasi keamanan tidak valid atau kedaluwarsa. Silakan coba lagi.");
  }

  try {
    const { authorizationUrl, cookie } = await startGoogleFlow(config);
    const res = NextResponse.json({ ok: true, data: { authorizationUrl } }, { headers: authHeaders });
    res.cookies.set(GOOGLE_FLOW_COOKIE, cookie, googleFlowCookieOptions());
    return res;
  } catch {
    return rejectLogin(503, "Layanan login Google sedang tidak tersedia.");
  }
}
