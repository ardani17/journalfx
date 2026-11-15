import { prisma } from "@/server/db";
import { DEFAULT_TZ } from "@/lib/dates";

export async function userTimezone(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  return user?.timezone ?? DEFAULT_TZ;
}
