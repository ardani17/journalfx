import { BucketKind } from "@prisma/client";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { fmtUSD0 } from "@/lib/money";
import { APP_NAME } from "@/lib/brand";

/** PRD roadmap milestone amounts (USD): 200 → 1m */
export const ROADMAP_AMOUNTS = [
  200, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000,
] as const;

export const DEFAULT_BUCKETS: { kind: BucketKind; name: string; priority: number }[] = [
  { kind: "LIVING", name: "Kebutuhan Hidup", priority: 10 },
  { kind: "DEBT", name: "Pelunasan Hutang", priority: 20 },
  { kind: "EMERGENCY", name: "Dana Darurat", priority: 30 },
  { kind: "SAVINGS", name: "Tabungan", priority: 40 },
  { kind: "TRADING", name: "Compounding Trading", priority: 50 },
  { kind: "UNALLOCATED", name: "Belum Dialokasikan", priority: 90 },
];

export async function findOrCreateGoogleUser(identity: { subject: string; email: string; name: string }) {
  const select = { id: true, email: true, name: true } as const;
  const key = `google:${identity.subject}`;
  const { user, created } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const existing = await tx.user.findUnique({ where: { googleSubject: identity.subject }, select });
    if (existing) {
      const user = existing.email === identity.email ? existing : await tx.user.update({
        where: { id: existing.id }, data: { email: identity.email }, select,
      });
      return { user, created: false };
    }

    const user = await tx.user.create({
      data: { googleSubject: identity.subject, email: identity.email, name: identity.name, riskSettings: { create: {} } },
      select,
    });
    await tx.project.create({
      data: {
        userId: user.id,
        name: APP_NAME,
        initialCapital: 0,
        startDate: new Date(),
        milestones: { create: ROADMAP_AMOUNTS.map((amount, index) => ({ order: index + 1, amount, label: fmtUSD0(amount) })) },
        buckets: { create: DEFAULT_BUCKETS.map((bucket) => ({ ...bucket, userId: user.id })) },
        accounts: { create: { name: "Akun Utama", userId: user.id } },
      },
    });
    return { user, created: true };
  });
  if (created) await audit({ userId: user.id, action: "onboard", entity: "User", entityId: user.id });
  return user;
}

export async function updateProfile(
  userId: string,
  data: { name?: string; timezone?: string; locale?: string },
) {
  await prisma.user.update({ where: { id: userId }, data });
  await audit({ userId, action: "update", entity: "User", entityId: userId, after: data });
}
