import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { DEFAULT_TZ } from "@/lib/dates";

export async function userTimezone(userId: string, db: Prisma.TransactionClient = prisma) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  return user?.timezone ?? DEFAULT_TZ;
}
