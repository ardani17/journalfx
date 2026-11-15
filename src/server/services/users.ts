import { BucketKind } from "@prisma/client";
import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";
import { hashPassword, verifyPassword } from "@/lib/password";
import type { LoginInput, OnboardInput } from "@/lib/validation/auth";
import { audit } from "@/server/audit";
import { fmtUSD0 } from "@/lib/money";

/** PRD roadmap milestone amounts (USD): 200 → 1m */
export const ROADMAP_AMOUNTS = [
  200, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000,
] as const;

const DEFAULT_BUCKETS: { kind: BucketKind; name: string; priority: number }[] = [
  { kind: "LIVING", name: "Kebutuhan Hidup", priority: 10 },
  { kind: "DEBT", name: "Pelunasan Hutang", priority: 20 },
  { kind: "EMERGENCY", name: "Dana Darurat", priority: 30 },
  { kind: "SAVINGS", name: "Tabungan", priority: 40 },
  { kind: "TRADING", name: "Compounding Trading", priority: 50 },
  { kind: "UNALLOCATED", name: "Belum Dialokasikan", priority: 90 },
];

export async function countUsers(): Promise<number> {
  return prisma.user.count();
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new ApiError(401, "Email atau password salah");
  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) throw new ApiError(401, "Email atau password salah");
  return { id: user.id, email: user.email, name: user.name };
}

/**
 * Onboarding creates the single private user (registration closed afterwards),
 * the default project with PRD roadmap milestones, risk settings, financial
 * buckets and the first trading account with its initial deposit in the ledger.
 */
export async function onboard(input: OnboardInput, req?: Request) {
  const existing = await countUsers();
  if (existing > 0) {
    throw new ApiError(403, "Onboarding sudah selesai. Silakan login.");
  }

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      timezone: input.timezone,
      locale: input.locale,
    },
  });

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      name: "Million Dollar Trading Project",
      initialCapital: input.initialCapital,
      targetAmount: input.targetAmount,
      startDate: new Date(),
      milestones: {
        create: ROADMAP_AMOUNTS.map((amount, i) => ({
          order: i + 1,
          amount,
          label: fmtUSD0(amount),
        })),
      },
      buckets: {
        create: DEFAULT_BUCKETS.map((b) => ({ ...b, user: { connect: { id: user.id } } })),
      },
    },
  });

  await prisma.riskSettings.create({ data: { userId: user.id } });

  const account = await prisma.tradingAccount.create({
    data: {
      userId: user.id,
      projectId: project.id,
      name: input.accountName,
      broker: input.broker || null,
    },
  });

  // Initial capital enters exclusively through the ledger.
  if (input.initialCapital > 0) {
    await prisma.accountTransaction.create({
      data: {
        userId: user.id,
        accountId: account.id,
        type: "DEPOSIT",
        amount: input.initialCapital,
        occurredAt: new Date(),
        note: "Modal awal (onboarding)",
      },
    });
  }

  await audit({ userId: user.id, action: "onboard", entity: "User", entityId: user.id, req });
  return { user: { id: user.id, email: user.email, name: user.name }, account };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, "User tidak ditemukan");
  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw new ApiError(400, "Password saat ini salah");
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  await audit({ userId, action: "update", entity: "User", entityId: userId, after: { password: true } });
}

export async function updateProfile(
  userId: string,
  data: { name?: string; timezone?: string; locale?: string },
) {
  await prisma.user.update({ where: { id: userId }, data });
  await audit({ userId, action: "update", entity: "User", entityId: userId, after: data });
}
