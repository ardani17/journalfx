import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/server/audit";
import type { UpdateJournalInput } from "@/lib/validation/trades";

export async function upsertJournal(userId: string, tradeId: string, input: UpdateJournalInput, req?: Request) {
  const trade = await prisma.trade.findFirst({ where: { id: tradeId, userId } });
  if (!trade) throw new ApiError(404, "Transaksi tidak ditemukan");
  const journal = await prisma.tradeJournal.upsert({
    where: { tradeId },
    create: { tradeId, ...input },
    update: input,
  });
  await audit({ userId, action: "update", entity: "TradeJournal", entityId: journal.id, after: input, req });
  return journal;
}

/* ───────────────────────── Strategies ───────────────────────── */

export async function listStrategies(userId: string) {
  return prisma.strategy.findMany({
    where: { userId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
}

export async function createStrategy(
  userId: string,
  input: { name: string; description?: string; timeframe?: string; rules?: string },
  req?: Request,
) {
  const s = await prisma.strategy.create({ data: { userId, ...input } }).catch((error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, "Nama strategi sudah dipakai");
    }
    throw error;
  });
  await audit({ userId, action: "create", entity: "Strategy", entityId: s.id, after: input, req });
  return s;
}

export async function updateStrategy(
  userId: string,
  id: string,
  input: Partial<{ name: string; description?: string; timeframe?: string; rules?: string; isActive: boolean }>,
  req?: Request,
) {
  const existing = await prisma.strategy.findFirst({ where: { id, userId } });
  if (!existing) throw new ApiError(404, "Strategi tidak ditemukan");
  const s = await prisma.strategy.update({ where: { id }, data: input });
  await audit({ userId, action: "update", entity: "Strategy", entityId: id, before: existing, after: input, req });
  return s;
}
