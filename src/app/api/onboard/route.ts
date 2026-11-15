import { onboardSchema } from "@/lib/validation/auth";
import { onboard } from "@/server/services/users";
import { signSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/session";
import { handleRouteError, ok, parseBody } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const input = await parseBody(req, onboardSchema);
    const { user } = await onboard(input, req);
    const token = await signSession({ sub: user.id, email: user.email, name: user.name });
    const res = ok({ user });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return res;
  } catch (e) {
    return handleRouteError(e);
  }
}
