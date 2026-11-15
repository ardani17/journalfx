import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  timezone: string;
  locale: string;
}

/** Returns the signed-in user or null (no throw). */
export async function getSessionUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySession(token);
  if (!payload) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, name: true, timezone: true, locale: true },
  });
  return user;
}

/** Throws 401 when unauthenticated — use inside every authenticated service/route. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "Tidak terautentikasi");
  return user;
}
