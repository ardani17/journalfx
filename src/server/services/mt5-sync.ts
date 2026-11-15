import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";

import { importStatement } from "./imports";

/**
 * MT5 read-only sync (v1.1.0).
 * - Never sends orders — import direction only (PRD guardrail).
 * - Idempotent: execution dedupe via externalIds → repeated sync = no duplicate P&L.
 * - Incremental: only new/changed deals create trades.
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
  csvText: string,
  req?: Request,
) {
  const report = await importStatement(userId, accountId, csvText, req);
  const summary = `MT5 sync: ${report.imported} baru, ${report.duplicates} duplikat dilewati`;
  await prisma.auditLog.create({
    data: {
      userId,
      action: "mt5-sync",
      entity: "TradingAccount",
      entityId: accountId,
      after: { summary, ...report },
    },
  });
  if (report.imported > 0) {
    await prisma.notification.create({
      data: {
        userId,
        kind: "journal",
        title: `MT5 sync: ${report.imported} trade baru tersinkron`,
        body: `${report.duplicates} duplikat dilewati (idempoten).`,
        severity: "INFO",
        link: "/journal",
      },
    });
  }
  if (report.unknownSymbols?.length) {
    await prisma.notification.create({
      data: {
        userId,
        kind: "journal",
        title: `MT5 sync: simbol tidak dikenal dilewati`,
        body: report.unknownSymbols.join(", "),
        severity: "WARNING",
        link: "/settings",
      },
    });
  }
  return { ...report, summary };
}

export async function assertAccount(userId: string, accountId: string) {
  const acc = await prisma.tradingAccount.findFirst({ where: { id: accountId, userId } });
  if (!acc) throw new ApiError(404, "Akun tidak ditemukan");
  return acc;
}
