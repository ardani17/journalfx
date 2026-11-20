import { Prisma, type DailyActivityKind } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { prisma } from "@/server/db";

export const activityTypeSelect = {
  id: true, name: true, kind: true, archivedAt: true,
} satisfies Prisma.DailyActivityTypeSelect;

export type TaskActivityType = Prisma.DailyActivityTypeGetPayload<{ select: typeof activityTypeSelect }>;

export function defaultActivityTypeId(userId: string, kind: DailyActivityKind) {
  return `${userId}:${kind}`;
}

export async function ensureDefaultActivityTypes(db: Prisma.TransactionClient, userId: string) {
  await db.dailyActivityType.createMany({
    data: [
      { id: defaultActivityTypeId(userId, "GENERAL"), userId, name: "Umum", kind: "GENERAL" },
      { id: defaultActivityTypeId(userId, "TRADING"), userId, name: "Trading", kind: "TRADING" },
    ],
    skipDuplicates: true,
  });
}

export async function listActivityTypes(userId: string) {
  const query = {
    where: { userId },
    orderBy: { name: "asc" },
    select: activityTypeSelect,
  } satisfies Prisma.DailyActivityTypeFindManyArgs;
  let all = await prisma.dailyActivityType.findMany(query);
  if (all.length === 0) {
    await ensureDefaultActivityTypes(prisma, userId);
    all = await prisma.dailyActivityType.findMany(query);
  }
  return all.filter((type) => type.archivedAt === null);
}

function handleTypeWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new ApiError(409, "Nama jenis kegiatan sudah dipakai");
  }
  throw error;
}

export async function createActivityType(userId: string, input: { name: string; kind: DailyActivityKind }) {
  try {
    return await prisma.$transaction(async (tx) => {
      await ensureDefaultActivityTypes(tx, userId);
      return tx.dailyActivityType.create({ data: { userId, ...input }, select: activityTypeSelect });
    });
  } catch (error) {
    handleTypeWriteError(error);
  }
}

export async function renameActivityType(userId: string, id: string, name: string) {
  try {
    const [type] = await prisma.dailyActivityType.updateManyAndReturn({
      where: { id, userId, archivedAt: null },
      data: { name },
      select: activityTypeSelect,
    });
    if (!type) throw new ApiError(404, "Jenis kegiatan tidak ditemukan");
    return type;
  } catch (error) {
    handleTypeWriteError(error);
  }
}

export async function archiveActivityType(userId: string, id: string) {
  const { count } = await prisma.dailyActivityType.updateMany({
    where: { id, userId, archivedAt: null },
    data: { archivedAt: new Date() },
  });
  if (!count && !await prisma.dailyActivityType.findUnique({ where: { id, userId }, select: { id: true } })) {
    throw new ApiError(404, "Jenis kegiatan tidak ditemukan");
  }
}
