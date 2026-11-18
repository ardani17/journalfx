import { prisma } from "@/server/db";
import { importStatement } from "./imports";

/**
 * MT5 read-only sync (v1.1.0).
 * - Never sends orders — import direction only (PRD guardrail).
 * - Positions and cash movements use their broker IDs to prevent duplicate entries.
 * - Stale-data warning when the last successful sync is older than the threshold.
 */

export const SYNC_STALE_AFTER_HOURS = 72;

export interface SyncStatus {
  lastSyncAt: Date | null;
  lastSyncResult: string | null;
  stale: boolean;
  staleHours: number | null;
}

export async function mt5SyncStatus(userId: string): Promise<SyncStatus> {
  const last = await prisma.auditLog.findFirst({
    where: { userId, action: "mt5-sync" },
    orderBy: { createdAt: "desc" },
  });
  if (!last) return { lastSyncAt: null, lastSyncResult: null, stale: true, staleHours: null };
  const hours = (Date.now() - last.createdAt.getTime()) / 3_600_000;
  return {
    lastSyncAt: last.createdAt,
    lastSyncResult: (last.after as { summary?: string } | null)?.summary ?? null,
    stale: hours > SYNC_STALE_AFTER_HOURS,
    staleHours: Math.round(hours),
  };
}

export async function mt5Sync(
  userId: string,
  accountId: string,
  bytes: Buffer,
  req?: Request,
) {
  const report = await importStatement(userId, accountId, bytes, req);
  const newEntries = report.imported + report.depositsImported + report.withdrawalsImported;
  const summary = `${report.imported} posisi baru, ${report.duplicates} duplikat posisi. ${report.depositsImported} deposit, ${report.withdrawalsImported} withdrawal, ${report.cashflowDuplicates} duplikat arus kas. ${report.skipped} baris bermasalah.`;
  if (newEntries + report.duplicates + report.cashflowDuplicates === 0) return { ...report, summary };
  await prisma.auditLog.create({
    data: {
      userId,
      action: "mt5-sync",
      entity: "TradingAccount",
      entityId: accountId,
      after: { summary, ...report },
    },
  });
  if (newEntries > 0) {
    await prisma.notification.create({
      data: {
        userId,
        kind: "journal",
        title: "Sinkronisasi riwayat MT5 selesai",
        body: summary,
        severity: "INFO",
        link: report.imported > 0 ? "/journal" : "/transactions",
      },
    });
  }
  return { ...report, summary };
}
