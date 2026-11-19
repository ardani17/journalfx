import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/server/audit";
import type { CreateAccountInput } from "@/lib/validation/ledger";
import { getDefaultProject } from "./projects";

export async function listAccounts(userId: string) {
  return prisma.tradingAccount.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, name: true, broker: true, accountNumber: true, currency: true,
      notes: true, isActive: true, isProp: true, createdAt: true, projectId: true,
    },
  });
}

export async function getAccount(userId: string, id: string) {
  const account = await prisma.tradingAccount.findFirst({ where: { id, userId } });
  if (!account) throw new ApiError(404, "Akun tidak ditemukan");
  return account;
}

export async function requireActiveAccount(userId: string, id: string, tx?: Prisma.TransactionClient) {
  if (tx) {
    // Serialize account status changes and deletes with new trades and imports.
    await tx.$queryRaw`SELECT "id" FROM "TradingAccount" WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE`;
  }
  const account = await (tx ?? prisma).tradingAccount.findFirst({ where: { id, userId } });
  if (!account) throw new ApiError(404, "Akun tidak ditemukan");
  if (!account.isActive) throw new ApiError(409, "Akun trading nonaktif");
  return account;
}

export async function createAccount(userId: string, input: CreateAccountInput, req?: Request) {
  const project = await getDefaultProject(userId);
  const account = await prisma.tradingAccount.create({
    data: {
      userId,
      projectId: project.id,
      name: input.name,
      broker: input.broker || null,
      accountNumber: input.accountNumber || null,
      notes: input.notes || null,
      ...(input.initialDeposit && input.initialDeposit > 0 ? {
        transactions: { create: {
          userId,
          type: "DEPOSIT",
          amount: input.initialDeposit,
          occurredAt: new Date(),
          note: "Deposit awal",
        } },
      } : {}),
    },
  });
  await audit({ userId, action: "create", entity: "TradingAccount", entityId: account.id, after: input, req });
  return account;
}

export async function updateAccount(
  userId: string,
  id: string,
  data: Partial<Omit<CreateAccountInput, "initialDeposit">> & { isActive?: boolean },
  req?: Request,
) {
  const [account] = await prisma.tradingAccount.updateManyAndReturn({
    where: { id, userId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.broker !== undefined ? { broker: data.broker || null } : {}),
      ...(data.accountNumber !== undefined ? { accountNumber: data.accountNumber || null } : {}),
      ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
  if (!account) throw new ApiError(404, "Akun tidak ditemukan");
  await audit({ userId, action: "update", entity: "TradingAccount", entityId: id, after: data, req });
  return account;
}

export async function deleteAccount(userId: string, id: string, req?: Request) {
  const removed = await prisma.$transaction(async (tx) => {
    // The row lock also blocks concurrent inserts that reference this account.
    const [account] = await tx.$queryRaw<{ id: string; name: string }[]>`
      SELECT "id", "name" FROM "TradingAccount" WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE
    `;
    if (!account) throw new ApiError(404, "Akun tidak ditemukan");
    const deletable = await tx.tradingAccount.findFirst({
      where: { id, userId, trades: { none: {} }, transactions: { none: {} }, snapshots: { none: {} }, withdrawals: { none: {} } },
      select: { id: true },
    });
    if (!deletable) throw new ApiError(409, "Akun memiliki riwayat atau referensi. Nonaktifkan akun untuk mempertahankan riwayat.");
    await tx.tradingAccount.delete({ where: { id, userId } });
    return account;
  });
  await audit({ userId, action: "delete", entity: "TradingAccount", entityId: id, before: removed, req });
}
