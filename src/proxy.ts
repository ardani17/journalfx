import { NextResponse, type NextRequest } from "next/server";
import { getAppOrigin, isSameOriginMutation } from "@/lib/app-origin";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const PUBLIC_PAGES = new Set([
  "/", "/login", "/privacy", "/terms", "/manifest.webmanifest",
  "/pwa/icon-192.png", "/pwa/icon-512.png", "/pwa/icon-maskable-512.png", "/pwa/apple-touch-icon.png",
]);
const PUBLIC_API = new Set([
  "/api/health", "/api/auth/google/start", "/api/auth/google/callback", "/api/auth/logout",
  "/api/integrations/telegram/webhook",
]);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isApi = pathname.startsWith("/api");
  const isPublic = isApi ? PUBLIC_API.has(pathname) : PUBLIC_PAGES.has(pathname);
  if (isPublic) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    if (isApi) {
      return NextResponse.json({ ok: false, error: "Tidak terautentikasi" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isApi && !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !isSameOriginMutation(req, getAppOrigin()?.origin ?? req.nextUrl.origin)) {
    return NextResponse.json({ ok: false, error: "Permintaan tidak diizinkan." }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // protect everything except static assets and next internals
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)",
  ],
};
