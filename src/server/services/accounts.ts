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
    },
  });
  if (input.initialDeposit && input.initialDeposit > 0) {
    await prisma.accountTransaction.create({
      data: {
        userId,
        accountId: account.id,
        type: "DEPOSIT",
        amount: input.initialDeposit,
        occurredAt: new Date(),
        note: "Deposit awal",
      },
    });
  }
  await audit({ userId, action: "create", entity: "TradingAccount", entityId: account.id, after: input, req });
  return account;
}

export async function updateAccount(
  userId: string,
  id: string,
  data: Partial<Omit<CreateAccountInput, "initialDeposit">> & { isActive?: boolean },
  req?: Request,
) {
  await getAccount(userId, id); // ownership check
  const updated = await prisma.tradingAccount.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.broker !== undefined ? { broker: data.broker || null } : {}),
      ...(data.accountNumber !== undefined ? { accountNumber: data.accountNumber || null } : {}),
      ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
  await audit({ userId, action: "update", entity: "TradingAccount", entityId: id, after: data, req });
  return updated;
}
