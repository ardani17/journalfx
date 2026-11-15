import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const PUBLIC_PAGES = new Set(["/login", "/onboarding"]);
const PUBLIC_API = new Set(["/api/health", "/api/auth/login", "/api/auth/logout", "/api/onboard"]);

export async function middleware(req: NextRequest) {
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

  return NextResponse.next();
}

export const config = {
  matcher: [
    // protect everything except static assets and next internals
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)",
  ],
};
