import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { prisma } from "@/server/db";
import { createTrade, addExecution, cancelTrade, getTrade, listTrades, registerTradeInstrument } from "@/server/services/trades";
import { registerInstrumentSchema } from "@/lib/validation/trades";
import { balanceSeries, computeBalance, reverseTransaction, weeklySummary } from "@/server/services/ledger";
import { dailyPnl, coreMetrics } from "@/server/services/analytics";
import { allocateProfit, budgetOverview, payDebt } from "@/server/services/finance";
import { cancelWithdrawal, completeWithdrawal, getRecommendation, listWithdrawalSourceAccounts, listWithdrawals, requestWithdrawal } from "@/server/services/withdrawals";
import { closeReview, correctReview, getOrCreateReview, saveReviewFields } from "@/server/services/reviews";
import { reviewPeriodForDate } from "@/lib/review-period";
import { importStatement } from "@/server/services/imports";
import { mt5Sync, mt5SyncStatus } from "@/server/services/mt5-sync";
import { findOrCreateGoogleUser } from "@/server/services/users";
import { readAttachment } from "@/server/services/attachments";
import { createAccount, deleteAccount, getAccount, updateAccount } from "@/server/services/accounts";

vi.mock("@/server/services/jisdor", () => ({
  getJisdorQuote: async () => ({ rate: "18252", at: new Date().toISOString(), source: "bi-jisdor", status: "latest" }),
}));

// Explicit opt-in: temporary, uniquely named fixtures only; deleted by their IDs.
describe.skipIf(process.env.RUN_DB_TESTS !== "1")("PostgreSQL financial integration", () => {
  const fixtureIds: string[] = [];
  let instrumentId: string;
  let symbol: string;
  beforeAll(async () => {
    if (existsSync(".env")) process.loadEnvFile(".env");
    symbol = `QA${randomUUID().slice(0, 8).replace(/-/g, "").toUpperCase()}`;
    const instrument = await prisma.instrument.create({ data: { symbol, name: "Temporary verification fixture", category: "metal", contractSize: 100 } });
    instrumentId = instrument.id;
  });
  afterAll(async () => {
    if (fixtureIds.length) await prisma.user.deleteMany({ where: { id: { in: fixtureIds } } });
    if (instrumentId) await prisma.instrument.delete({ where: { id: instrumentId } });
    await prisma.$disconnect();
  });
  async function fixture() {
    const user = await prisma.user.create({ data: { email: `qa-${randomUUID()}@example.invalid`, name: "Temporary QA", googleSubject: `qa-${randomUUID()}` } });
    fixtureIds.push(user.id);
    const project = await prisma.project.create({ data: { userId: user.id, name: "QA", initialCapital: 200 } });
    const account = await prisma.tradingAccount.create({ data: { userId: user.id, projectId: project.id, name: "QA" } });
    await prisma.accountTransaction.create({ data: { userId: user.id, accountId: account.id, type: "DEPOSIT", amount: 200, occurredAt: new Date("2026-01-01") } });
    return { userId: user.id, projectId: project.id, accountId: account.id };
  }

  it("captures historical review facts and isolates revisions by period and owner", async () => {
    const owner = await fixture();
    const other = await fixture();
    const first = { date: "2026-11-04" };
    const second = { date: "2026-11-09" };
    const boundary = reviewPeriodForDate("WEEKLY", first.date, "Asia/Jakarta");
    expect(boundary.start.toISOString()).toBe("2026-11-01T17:00:00.000Z");
    expect(boundary.end.toISOString()).toBe("2026-11-08T17:00:00.000Z");
    const { id } = await prisma.trade.create({
      data: {
        userId: owner.userId, accountId: owner.accountId, instrumentId,
        direction: "LONG", status: "CLOSED", lot: 0.01, entryPrice: 2000, exitPrice: 2001,
        realizedPnl: 12, entryAt: boundary.start, exitAt: new Date("2026-11-03T02:00:00Z"),
      },
    });
    await prisma.accountTransaction.createMany({ data: [
      { userId: owner.userId, accountId: owner.accountId, type: "REALIZED_PNL", amount: 12, occurredAt: boundary.start, sourceTradeId: id },
      { userId: owner.userId, accountId: owner.accountId, type: "FEE", amount: -2, occurredAt: boundary.start, sourceTradeId: id },
      { userId: owner.userId, accountId: owner.accountId, type: "REALIZED_PNL", amount: 40, occurredAt: boundary.end },
    ] });

    const draft = await getOrCreateReview(owner.userId, "WEEKLY", first);
    await saveReviewFields(owner.userId, "WEEKLY", { reflections: "Minggu pertama" }, undefined, first);
    expect(await getOrCreateReview(owner.userId, "WEEKLY", { date: "2026-11-07" }))
      .toMatchObject({ id: draft.id, reflections: "Minggu pertama" });
    const closed = await closeReview(owner.userId, "WEEKLY", undefined, first);
    expect(closed.snapshot).toMatchObject({ tradesCount: 1, netPnl: "10", balance: "210" });
    expect(closed.snapshot).toMatchObject({ discipline: { missing: expect.arrayContaining(["Risiko"]) } });
    expect((await closeReview(owner.userId, "WEEKLY", undefined, second)).snapshot)
      .toMatchObject({ tradesCount: 0, netPnl: "40" });
    const correction = await correctReview(owner.userId, "WEEKLY", undefined, { reviewId: closed.id });
    expect(await getOrCreateReview(owner.userId, "WEEKLY", first)).toMatchObject({ id: correction.id, status: "OPEN" });
    expect((await getOrCreateReview(owner.userId, "WEEKLY", { reviewId: closed.id })).snapshot).toEqual(closed.snapshot);
    expect((await closeReview(owner.userId, "WEEKLY", undefined, { reviewId: correction.id })).snapshot)
      .toMatchObject({ tradesCount: 1, netPnl: "10" });
    await expect(getOrCreateReview(other.userId, "WEEKLY", { reviewId: closed.id })).rejects.toMatchObject({ status: 404 });
    for (const kind of ["DAILY", "MONTHLY"] as const) {
      expect(await getOrCreateReview(owner.userId, kind, first)).toMatchObject({ status: "OPEN", kind });
    }
  });

  it("provisions one empty private journal per Google subject even with concurrent sign-ins or shared email text", async () => {
    const identity = { subject: `google-${randomUUID()}`, name: "OAuth Tester", email: "same@example.com" };
    const owners = await Promise.all([findOrCreateGoogleUser(identity), findOrCreateGoogleUser(identity)]);
    const first = owners[0]!;
    fixtureIds.push(first.id);
    expect(owners[1]?.id).toBe(first.id);
    const second = await findOrCreateGoogleUser({ ...identity, subject: `google-${randomUUID()}` });
    fixtureIds.push(second.id);
    expect(second.id).not.toBe(first.id);
    expect((await findOrCreateGoogleUser({ ...identity, email: "changed@example.com" })).id).toBe(first.id);

    const workspace = await prisma.user.findUniqueOrThrow({ where: { id: first.id }, include: {
      projects: { include: { accounts: true, buckets: true } }, riskSettings: true,
    } });
    expect(workspace.projects).toHaveLength(1);
    expect(workspace.projects[0]?.accounts).toHaveLength(1);
    expect(workspace.projects[0]?.buckets).toHaveLength(6);
    expect(workspace.riskSettings).not.toBeNull();
    expect((await computeBalance(first.id)).balance.isZero()).toBe(true);

    const accountId = workspace.projects[0]!.accounts[0]!.id;
    const trade = await createTrade(first.id, { accountId, instrumentId, direction: "LONG", lot: 0.1,
      entryPrice: 2000, entryAt: new Date().toISOString(), commission: 0, swap: 0, fees: 0 });
    const attachment = await prisma.tradeAttachment.create({ data: {
      tradeId: trade.id, kind: "ENTRY", fileName: "private.png", mimeType: "image/png", sizeBytes: 12,
      storagePath: "test-only-do-not-read/private.png",
    } });
    await expect(getTrade(second.id, trade.id)).rejects.toMatchObject({ status: 404 });
    await expect(getAccount(second.id, accountId)).rejects.toMatchObject({ status: 404 });
    await expect(updateAccount(second.id, accountId, { name: "Foreign edit" })).rejects.toMatchObject({ status: 404 });
    await expect(readAttachment(second.id, attachment.id)).rejects.toMatchObject({ status: 403 });
    expect((await listTrades(second.id, { limit: 10, offset: 0 })).total).toBe(0);
  });

  it("registers a private symbol once and keeps shared and imported instruments selectable", async () => {
    const owner = await fixture();
    const other = await fixture();
    const parseSymbol = (value: string) => registerInstrumentSchema.parse({ symbol: value }).symbol;
    expect(registerInstrumentSchema.safeParse({ symbol: "  " }).success).toBe(false);
    expect(registerInstrumentSchema.safeParse({ symbol: "X".repeat(65) }).success).toBe(false);
    expect(registerInstrumentSchema.safeParse({ symbol: "XYZ CASH" }).success).toBe(false);
    expect(await registerTradeInstrument(owner.userId, parseSymbol(` ${symbol.toLowerCase()} `))).toEqual({ id: instrumentId, symbol });

    const [first, duplicate] = await Promise.all([
      registerTradeInstrument(owner.userId, parseSymbol("  xyZ.cash  ")),
      registerTradeInstrument(owner.userId, parseSymbol("XYZ.CASH")),
    ]);
    expect(first).toEqual(duplicate);
    const registered = await prisma.instrument.findMany({ where: { ownerId: owner.userId, symbol: "XYZ.CASH" } });
    expect(registered.map((row) => [row.id, row.contractSize])).toEqual([[first.id, null]]);

    const input = { accountId: owner.accountId, instrumentId: first.id, direction: "LONG" as const, lot: 0.1,
      entryPrice: 2000, entryAt: new Date().toISOString(), commission: 0, swap: 0, fees: 0 };
    const trade = await createTrade(owner.userId, input);
    expect(trade.instrumentId).toBe(first.id);
    await addExecution(owner.userId, trade.id, {
      kind: "CLOSE", quantity: 0.1, price: 2000.123456, commission: 0, swap: 0, fees: 0, reportedNetPnl: "0",
    });
    expect((await getTrade(owner.userId, trade.id)).instrument.pricePrecision).toBe(6);
    await expect(createTrade(other.userId, { ...input, accountId: other.accountId })).rejects.toMatchObject({ status: 404 });
    expect((await registerTradeInstrument(other.userId, parseSymbol(first.symbol))).id).not.toBe(first.id);

    await importStatement(owner.userId, owner.accountId, readFileSync(new URL("../fixtures/mt5-history.xlsx", import.meta.url)));
    const imported = await prisma.instrument.findUniqueOrThrow({ where: { ownerId_symbol: { ownerId: owner.userId, symbol: "US100.DEMO" } } });
    expect(await registerTradeInstrument(owner.userId, parseSymbol("us100.demo"))).toEqual({ id: imported.id, symbol: imported.symbol });
  });

  it("protects account ownership and history while allowing account edits, deletion and reactivation", async () => {
    const f = await fixture();
    const other = await fixture();
    const empty = await createAccount(f.userId, { name: "Empty QA account" });
    await updateAccount(f.userId, empty.id, { name: "Updated QA account", broker: "Broker", accountNumber: "123", notes: "Edited" });
    expect(await getAccount(f.userId, empty.id)).toMatchObject({ name: "Updated QA account", broker: "Broker", accountNumber: "123", notes: "Edited" });
    await expect(deleteAccount(other.userId, empty.id)).rejects.toMatchObject({ status: 404 });
    await deleteAccount(f.userId, empty.id);
    await expect(getAccount(f.userId, empty.id)).rejects.toMatchObject({ status: 404 });

    const funded = await createAccount(f.userId, { name: "Funded QA account", initialDeposit: 10 });
    await expect(deleteAccount(f.userId, funded.id)).rejects.toMatchObject({ status: 409 });
    const snapshotOnly = await createAccount(f.userId, { name: "Snapshot QA account" });
    await prisma.equitySnapshot.create({ data: { userId: f.userId, accountId: snapshotOnly.id, at: new Date(), balance: 1, equity: 1 } });
    await expect(deleteAccount(f.userId, snapshotOnly.id)).rejects.toMatchObject({ status: 409 });

    const input = {
      accountId: f.accountId, instrumentId, direction: "LONG" as const, lot: 0.1,
      entryPrice: 2000, entryAt: "2026-11-01T00:00:00Z", commission: 0, swap: 0, fees: 0,
    };
    const trade = await createTrade(f.userId, input);
    await updateAccount(f.userId, f.accountId, { isActive: false });
    const report = readFileSync(new URL("../fixtures/mt5-history.xlsx", import.meta.url));
    await expect(createTrade(f.userId, input)).rejects.toMatchObject({ status: 409 });
    await expect(importStatement(f.userId, f.accountId, report)).rejects.toMatchObject({ status: 409 });
    await expect(mt5Sync(f.userId, f.accountId, report)).rejects.toMatchObject({ status: 409 });
    expect((await listTrades(f.userId, { accountId: f.accountId, limit: 10, offset: 0 })).items[0]?.id).toBe(trade.id);
    expect((await computeBalance(f.userId, f.accountId)).balance.toNumber()).toBe(200);
    await updateAccount(f.userId, f.accountId, { isActive: true });
    await expect(createTrade(f.userId, input)).resolves.toMatchObject({ accountId: f.accountId });
  });

  it("recognizes each partial close in its own period, including net entry costs", async () => {
    const f = await fixture();
    const trade = await createTrade(f.userId, { accountId: f.accountId, instrumentId, direction: "LONG", lot: 0.1,
      entryPrice: 2000, entryAt: "2026-11-01T00:00:00Z", commission: 0.5, swap: 0, fees: 0 });
    await addExecution(f.userId, trade.id, { kind: "PARTIAL_CLOSE", quantity: 0.04, price: 2001,
      commission: 0, swap: 0, fees: 0, executedAt: "2026-11-02T00:00:00Z" });
    await addExecution(f.userId, trade.id, { kind: "CLOSE", quantity: 0.06, price: 2002,
      commission: 0, swap: 0, fees: 0, executedAt: "2026-11-03T00:00:00Z" });
    expect((await computeBalance(f.userId)).balance.toNumber()).toBe(215.5);
    const days = await dailyPnl(f.userId, new Date("2026-11-01T17:00:00Z"), new Date("2026-11-03T17:00:00Z"));
    expect(days.map((d) => d.pnl.toString())).toEqual(["3.8", "11.7"]);
    const firstDay = await coreMetrics(f.userId, { from: new Date("2026-11-02"), to: new Date("2026-11-03") });
    expect(firstDay.netPnl.toNumber()).toBe(3.8);
  });

  it("distinguishes an open trade from no activity and retains ledger precision", async () => {
    const f = await fixture();
    const trade = await createTrade(f.userId, {
      accountId: f.accountId, instrumentId, direction: "LONG", lot: 0.1,
      entryPrice: 2000, entryAt: "2026-11-02T00:00:00Z", commission: 0, swap: 0, fees: 0,
    });
    await prisma.accountTransaction.create({
      data: {
        userId: f.userId, accountId: f.accountId, type: "REALIZED_PNL",
        amount: "900719925474099.01", occurredAt: new Date("2026-11-03T10:00:00Z"),
      },
    });
    const days = await dailyPnl(f.userId, new Date("2026-11-01T17:00:00Z"), new Date("2026-11-04T17:00:00Z"));
    expect(days.map(({ hasActivity, hasRealizedPnl }) => [hasActivity, hasRealizedPnl]))
      .toEqual([[true, false], [true, true], [false, false]]);
    expect(days[1]?.pnl.toString()).toBe("900719925474099.01");

    await prisma.tradeJournal.update({
      where: { tradeId: trade.id },
      data: { entryReason: "Alasan masuk", postChecklist: { plan: true } },
    });
    const filter = { limit: 10, offset: 0 };
    const publicRow = (await listTrades(f.userId, filter)).items[0];
    expect(publicRow?.journal).toEqual({ tags: [], mistakes: [] });
    expect(publicRow).not.toHaveProperty("journalComplete");
    expect((await listTrades(f.userId, filter, { includeJournalCompletion: true })).items[0])
      .toMatchObject({ id: trade.id, journalComplete: true });
  });

  it("completes a withdrawal once and prevents concurrent/overlapping double allocations", async () => {
    const f = await fixture();
    const bucket = await prisma.financialBucket.create({ data: { userId: f.userId, projectId: f.projectId, name: "Living", kind: "LIVING", targetPercent: 100 } });
    const wd = await prisma.withdrawal.create({ data: { userId: f.userId, projectId: f.projectId, accountId: f.accountId, amountUSD: 50, status: "REQUESTED" } });
    const complete = await Promise.allSettled([1, 2].map(() => completeWithdrawal(f.userId, wd.id, { fxRate: 10000, receivedAmount: 500000 })));
    expect(complete.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await computeBalance(f.userId)).balance.toNumber()).toBe(150);
    await allocateProfit(f.userId, { periodStart: "2026-11-01", periodEnd: "2026-11-08", amount: 20 });
    const allocations = await Promise.allSettled([
      allocateProfit(f.userId, { periodStart: "2026-11-02", periodEnd: "2026-11-09", amount: 20 }),
      allocateProfit(f.userId, { periodStart: "2026-11-03", periodEnd: "2026-11-10", amount: 20 }),
    ]);
    expect(allocations.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(Number((await prisma.financialAllocation.aggregate({ where: { userId: f.userId }, _sum: { amount: true } }))._sum.amount)).toBe(40);
    const budget = await budgetOverview(f.userId);
    expect(budget.funded.toNumber()).toBe(400000);
    expect(bucket.kind).toBe("LIVING");
  });

  it("imports MT5 cent positions and deals in USC and aggregates them once in USD", async () => {
    const f = await fixture();
    const cent = await createAccount(f.userId, { name: "Cent QA", currency: "USC" });
    const centReport = readFileSync(new URL("../fixtures/mt5-usc.xlsx", import.meta.url));
    const usdReport = readFileSync(new URL("../fixtures/mt5-history.xlsx", import.meta.url));
    await expect(importStatement(f.userId, f.accountId, centReport)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/USC.*USD/) });
    await expect(mt5Sync(f.userId, cent.id, usdReport)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/USD.*USC/) });
    expect(await prisma.trade.count({ where: { userId: f.userId } })).toBe(0);
    expect(await prisma.accountTransaction.count({ where: { accountId: cent.id } })).toBe(0);
    expect(await prisma.accountTransaction.count({ where: { accountId: f.accountId } })).toBe(1);
    expect(await prisma.withdrawal.count({ where: { userId: f.userId } })).toBe(0);

    await expect(importStatement(f.userId, cent.id, centReport)).resolves.toMatchObject({
      imported: 1, feesImported: 1, depositsImported: 1, withdrawalsImported: 1, skipped: 0,
    });
    await expect(mt5Sync(f.userId, cent.id, centReport)).resolves.toMatchObject({
      imported: 0, duplicates: 1, feeDuplicates: 1, cashflowDuplicates: 2,
    });
    expect(await prisma.trade.count({ where: { accountId: cent.id } })).toBe(1);
    const trade = await prisma.trade.findFirstOrThrow({ where: { accountId: cent.id } });
    expect([trade.lot, trade.entryPrice, trade.exitPrice, trade.realizedPnl].map(String)).toEqual(["0.37", "2650.125", "2652.875", "1251.25"]);
    const entries = await prisma.accountTransaction.findMany({ where: { accountId: cent.id } });
    expect(entries).toHaveLength(4);
    expect(entries.every((row) => row.currency === "USC")).toBe(true);
    const withdrawals = await prisma.withdrawal.findMany({ where: { accountId: cent.id } });
    expect(withdrawals.map((row) => row.amountUSD.toString())).toEqual(["1.2555"]);
    expect((await computeBalance(f.userId, cent.id)).balance.toString()).toBe("6124.45");
    expect((await computeBalance(f.userId)).balance.toString()).toBe("261.2445");
    expect((await balanceSeries(f.userId)).at(-1)?.balance).toBe(261.24);
    expect((await coreMetrics(f.userId)).netPnl.toString()).toBe("12.5");
    expect((await coreMetrics(f.userId, { accountId: cent.id })).netPnl.toString()).toBe("1250");
    const journal = { accountId: cent.id, from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-11-06T00:00:00Z") };
    expect((await coreMetrics(f.userId, { accountId: cent.id, journal })).netPnl.toString()).toBe("1250");
    expect((await weeklySummary(f.userId, new Date("2026-11-05T00:00:00Z"))).realizedPnl.toString()).toBe("12.5");
    await expect(importStatement(f.userId, f.accountId, usdReport)).resolves.toMatchObject({ imported: 2 });
  });

  it("deduplicates concurrent imports and overlapping syncs while preserving the broker ledger", async () => {
    const f = await fixture();
    const report = readFileSync(new URL("../fixtures/mt5-history.xlsx", import.meta.url));
    const overlap = readFileSync(new URL("../fixtures/mt5-history-overlap.xlsx", import.meta.url));
    const [a, b] = await Promise.all([
      importStatement(f.userId, f.accountId, report),
      mt5Sync(f.userId, f.accountId, report),
    ]);
    expect(a.imported + b.imported).toBe(2);
    expect(a.duplicates + b.duplicates).toBe(2);
    expect(a.skipped + b.skipped).toBe(4);
    expect([...a.registeredSymbols, ...b.registeredSymbols].sort()).toEqual(["BTCUSD.TEST", "US100.DEMO"]);
    expect((await computeBalance(f.userId)).realizedPnl.toString()).toBe("1.2");
    expect(await mt5Sync(f.userId, f.accountId, overlap)).toMatchObject({ imported: 1, duplicates: 1, skipped: 0 });

    const trades = await prisma.trade.findMany({ where: { userId: f.userId }, include: { executions: true, instrument: true } });
    expect(trades).toHaveLength(3);
    const indexTrade = trades.find((trade) => trade.ticket === "9012345678901234567")!;
    expect(indexTrade.status).toBe("CLOSED");
    expect(indexTrade.lot.toString()).toBe("0.001");
    expect(indexTrade.realizedPnl?.toString()).toBe("9.4");
    expect(indexTrade.executions).toHaveLength(2);
    expect(indexTrade.instrument).toMatchObject({ ownerId: f.userId, pricePrecision: 6, contractSize: null });
    expect(await prisma.accountTransaction.count({ where: { userId: f.userId, type: "REALIZED_PNL" } })).toBe(3);
    expect((await computeBalance(f.userId)).realizedPnl.toString()).toBe("2.2");

    const anotherAccount = await prisma.tradingAccount.create({ data: { userId: f.userId, projectId: f.projectId, name: "Second account" } });
    expect(await importStatement(f.userId, anotherAccount.id, overlap)).toMatchObject({ imported: 2, duplicates: 0, registeredSymbols: [] });
  });

  it("keeps imported instruments private and records signed P&L for manual custom closes", async () => {
    const owner = await fixture();
    const another = await fixture();
    const report = readFileSync(new URL("../fixtures/mt5-history-overlap.xlsx", import.meta.url));
    await expect(importStatement(another.userId, owner.accountId, report)).rejects.toMatchObject({ status: 404 });
    await importStatement(owner.userId, owner.accountId, report);
    const ownedInstrument = await prisma.instrument.findUniqueOrThrow({
      where: { ownerId_symbol: { ownerId: owner.userId, symbol: "US100.DEMO" } },
    });
    const input = {
      instrumentId: ownedInstrument.id, direction: "LONG" as const, lot: 0.003, entryPrice: 20_000,
      entryAt: "2026-11-04T08:00:00Z", commission: 0, swap: 0, fees: 0,
    };
    await expect(createTrade(another.userId, { ...input, accountId: another.accountId })).rejects.toMatchObject({ status: 404 });
    expect(await importStatement(another.userId, another.accountId, report)).toMatchObject({ imported: 2, registeredSymbols: ["US100.DEMO"] });
    expect(await prisma.instrument.count({ where: { symbol: "US100.DEMO", ownerId: { in: [owner.userId, another.userId] } } })).toBe(2);

    const trade = await createTrade(owner.userId, { ...input, accountId: owner.accountId });
    const close = { kind: "PARTIAL_CLOSE" as const, quantity: 0.001, price: 19_000, commission: 0.2, swap: 0, fees: 0 };
    await expect(addExecution(owner.userId, trade.id, close)).rejects.toMatchObject({ status: 400 });
    const positive = await addExecution(owner.userId, trade.id, { ...close, reportedNetPnl: "2.25" });
    expect(positive.trade.status).toBe("PARTIAL");
    expect(positive.execution.realizedPnl?.toString()).toBe("2.25");
    await addExecution(owner.userId, trade.id, { ...close, reportedNetPnl: "-2.25" });
    const flat = await addExecution(owner.userId, trade.id, { ...close, kind: "CLOSE", reportedNetPnl: "0" });
    expect(flat.trade.status).toBe("CLOSED");
    expect(flat.trade.realizedPnl?.toString()).toBe("0");
    expect(await coreMetrics(owner.userId, { accountId: owner.accountId })).toMatchObject({ wins: 2, losses: 0, breakEven: 1 });
    const flatEntries = await prisma.accountTransaction.findMany({ where: { sourceTradeId: trade.id } });
    await expect(reverseTransaction(owner.userId, flatEntries[0]!.id, "Cannot reverse trade booking in isolation"))
      .rejects.toMatchObject({ status: 400 });
    expect(flatEntries.map((post) => post.amount.toString()).sort()).toEqual(["-2.25", "0", "2.25"]);
  });

  it("reconciles a matching open ticket with broker P&L and prevents cancel/close races", async () => {
    const f = await fixture();
    const report = readFileSync(new URL("../fixtures/mt5-history.xlsx", import.meta.url));
    const instrument = await prisma.instrument.create({
      data: { ownerId: f.userId, symbol: "US100.DEMO", name: "Temporary index", category: "custom" },
    });
    const open = await createTrade(f.userId, {
      accountId: f.accountId, instrumentId: instrument.id, ticket: "9012345678901234567", direction: "LONG",
      lot: 0.001, entryPrice: 20250.123, entryAt: "2026-11-01T08:00:00Z", commission: 0, swap: 0, fees: 0,
    });
    const results = await Promise.allSettled([
      importStatement(f.userId, f.accountId, report),
      importStatement(f.userId, f.accountId, report),
    ]);
    const successful = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    expect(successful).toHaveLength(2);
    expect(successful.reduce((total, result) => total + result.reconciled, 0)).toBe(1);
    const stored = await getTrade(f.userId, open.id);
    expect(stored.status).toBe("CLOSED");
    expect(stored.realizedPnl?.toString()).toBe("9.4");
    expect(stored.executions).toHaveLength(2);

    const manual = await createTrade(f.userId, { accountId: f.accountId, instrumentId, direction: "LONG", lot: 0.1,
      entryPrice: 2000, entryAt: "2026-11-01T00:00:00Z", commission: 0, swap: 0, fees: 0 });
    const writes = await Promise.allSettled([
      addExecution(f.userId, manual.id, { kind: "CLOSE", quantity: 0.1, price: 2001, commission: 0, swap: 0, fees: 0 }),
      cancelTrade(f.userId, manual.id, "Correcting mistaken entry"),
    ]);
    expect(writes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const after = await getTrade(f.userId, manual.id);
    expect(await prisma.accountTransaction.count({ where: { sourceTradeId: manual.id } })).toBe(after.status === "CLOSED" ? 1 : 0);
  });

  it("deduplicates cashflow-only uploads by account and keeps imported withdrawals and reversals in sync", async () => {
    const f = await fixture();
    const cashflowReport = readFileSync(new URL("../fixtures/mt5-cashflows.xlsx", import.meta.url));
    const [first, second] = await Promise.all([
      importStatement(f.userId, f.accountId, cashflowReport),
      mt5Sync(f.userId, f.accountId, cashflowReport),
    ]);
    expect(first.depositsImported + second.depositsImported).toBe(1);
    expect(first.withdrawalsImported + second.withdrawalsImported).toBe(1);
    expect(first.cashflowDuplicates + second.cashflowDuplicates).toBe(2);
    expect(first.feesImported + second.feesImported).toBe(1);
    expect(first.feeDuplicates + second.feeDuplicates).toBe(1);
    expect(first.skipped + second.skipped).toBe(6);
    expect((await mt5SyncStatus(f.userId)).lastSyncAt).not.toBeNull();

    const withdrawalTxn = await prisma.accountTransaction.findUniqueOrThrow({
      where: { accountId_mt5DealId: { accountId: f.accountId, mt5DealId: "9900000000000000002" } },
    });
    expect(withdrawalTxn.type).toBe("WITHDRAWAL");
    expect(withdrawalTxn.amount.toString()).toBe("-15");
    const history = await listWithdrawals(f.userId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      id: withdrawalTxn.withdrawalId, accountId: f.accountId, status: "COMPLETED",
      completedAt: new Date("2026-11-02T22:48:58Z"), note: "wd tr#demo",
      mt5DealId: "9900000000000000002", fxRate: null, receivedAmount: null,
    });
    expect(history[0]?.amountUSD.toString()).toBe("15");
    expect(await prisma.financialTransaction.count({ where: { userId: f.userId } })).toBe(0);
    expect(await prisma.exchangeRate.count({ where: { userId: f.userId } })).toBe(0);
    const balance = await computeBalance(f.userId, f.accountId);
    expect(balance.deposits.toString()).toBe("300");
    expect(balance.withdrawals.toString()).toBe("15");
    expect(balance.balance.toString()).toBe("283.75");
    expect(balance.fees.toString()).toBe("1.25");
    expect(balance.realizedPnl.toString()).toBe("0");

    await reverseTransaction(f.userId, withdrawalTxn.id, "Imported broker debit correction");
    expect(await listWithdrawals(f.userId)).toMatchObject([{ status: "CANCELLED" }]);
    const correctedBalance = await computeBalance(f.userId, f.accountId);
    expect(correctedBalance.balance.toString()).toBe("298.75");
    expect(correctedBalance.withdrawals.toString()).toBe("0");
    expect(await importStatement(f.userId, f.accountId, cashflowReport)).toMatchObject({
      depositsImported: 0, withdrawalsImported: 0, cashflowDuplicates: 2,
    });
    const anotherAccount = await prisma.tradingAccount.create({
      data: { userId: f.userId, projectId: f.projectId, name: "Second account" },
    });
    expect(await importStatement(f.userId, anotherAccount.id, cashflowReport)).toMatchObject({
      depositsImported: 1, withdrawalsImported: 1, cashflowDuplicates: 0,
    });
  });

  it("serializes competing partial closes so their total never exceeds open quantity", async () => {
    const f = await fixture();
    const trade = await createTrade(f.userId, { accountId: f.accountId, instrumentId, direction: "LONG", lot: 0.1,
      entryPrice: 2000, entryAt: new Date().toISOString(), commission: 0, swap: 0, fees: 0 });
    const results = await Promise.allSettled([1, 2].map(() => addExecution(f.userId, trade.id, {
      kind: "PARTIAL_CLOSE", quantity: 0.06, price: 2001, commission: 0, swap: 0, fees: 0,
    })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await computeBalance(f.userId)).realizedPnl.toNumber()).toBe(6);
  });

  it("serializes debt payments and rejects an unaccounted overpayment", async () => {
    const f = await fixture();
    const debt = await prisma.debt.create({ data: { userId: f.userId, name: "QA", principalOriginal: 1000, principalRemaining: 1000 } });
    const payments = await Promise.allSettled([1, 2].map(() => payDebt(f.userId, debt.id, {
      totalAmount: 600, interestPortion: 0, feePortion: 0,
    })));
    expect(payments.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(Number((await prisma.debt.findUniqueOrThrow({ where: { id: debt.id } })).principalRemaining)).toBe(400);
  });

  it("accepts the rounded JISDOR recommendation only once under simultaneous requests", async () => {
    const f = await fixture();
    await prisma.withdrawalRule.create({ data: { userId: f.userId, projectId: f.projectId, needsTargetIdr: 320000 } });
    await prisma.accountTransaction.create({ data: { userId: f.userId, accountId: f.accountId, type: "REALIZED_PNL", amount: 10, occurredAt: new Date() } });
    const { recommendation } = await getRecommendation(f.userId);
    expect(recommendation.recommended.toString()).toBe("4.04");
    const results = await Promise.allSettled([1, 2].map(() => requestWithdrawal(f.userId, recommendation.recommended.toNumber())));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("reserves cash against the project and source account until withdrawal is cancelled or completed", async () => {
    const f = await fixture();
    const otherSource = await prisma.tradingAccount.create({
      data: { userId: f.userId, projectId: f.projectId, name: "Second source" },
    });
    await prisma.withdrawalRule.create({
      data: { userId: f.userId, projectId: f.projectId, maxWdRatio: 100, needsTargetIdr: 50_000_000, reserveUsd: 970 },
    });
    await prisma.accountTransaction.create({
      data: { userId: f.userId, accountId: otherSource.id, type: "REALIZED_PNL", amount: 1000, occurredAt: new Date() },
    });

    const first = await requestWithdrawal(f.userId, 160, undefined, undefined, f.accountId);
    const sources = await listWithdrawalSourceAccounts(f.userId, f.projectId);
    expect(sources.find((source) => source.id === f.accountId)?.balanceUsd.toNumber()).toBe(40);
    await expect(requestWithdrawal(f.userId, 50, undefined, undefined, f.accountId)).rejects.toMatchObject({
      message: "Saldo yang tersedia di akun sumber tidak mencukupi",
    });

    const second = await requestWithdrawal(f.userId, 70, undefined, undefined, otherSource.id);
    const { recommendation } = await getRecommendation(f.userId);
    expect(recommendation.recommended.toNumber()).toBe(0);
    expect(recommendation.zeroReasons.join()).toContain("Kas di atas cadangan sudah dialokasikan");
    await cancelWithdrawal(f.userId, second.id);
    expect((await getRecommendation(f.userId)).recommendation.recommended.toNumber()).toBe(70);

    await prisma.tradingAccount.updateMany({ where: { userId: f.userId }, data: { isActive: false } });
    await completeWithdrawal(f.userId, first.id, { fxRate: 18_000, receivedAmount: 2_880_000 });
    expect((await getRecommendation(f.userId)).recommendation.recommended.toNumber()).toBe(70);
  });

  it("allocates remaining IDR at receipt cost without creating money when FX changes", async () => {
    const f = await fixture();
    await prisma.financialBucket.create({ data: { userId: f.userId, projectId: f.projectId, name: "Living", kind: "LIVING", targetPercent: 100 } });
    const receipt = async (rate: number) => {
      const wd = await prisma.withdrawal.create({ data: { userId: f.userId, projectId: f.projectId, accountId: f.accountId, amountUSD: 50, status: "REQUESTED" } });
      await completeWithdrawal(f.userId, wd.id, { fxRate: rate, receivedAmount: 50 * rate });
    };
    await receipt(20000);
    await allocateProfit(f.userId, { periodStart: "2026-11-01", periodEnd: "2026-11-08", amount: 50 });
    await receipt(10000);
    await allocateProfit(f.userId, { periodStart: "2026-11-08", periodEnd: "2026-11-15", amount: 50 });
    await getRecommendation(f.userId, { rate: "19500", at: new Date().toISOString(), source: "bi-jisdor", status: "latest" });
    const withdrawals = await prisma.withdrawal.findMany({ where: { userId: f.userId }, orderBy: { fxRate: "asc" } });
    expect(withdrawals.map((w) => [w.fxRate?.toString(), w.receivedAmount?.toString()])).toEqual([
      ["10000", "500000"], ["20000", "1000000"],
    ]);
    const total = await prisma.financialTransaction.aggregate({ where: { userId: f.userId, kind: "ALLOCATION" }, _sum: { amount: true } });
    expect(Number(total._sum.amount)).toBe(1500000);
  });

  it("opens and saves successive review corrections while preserving prior snapshots", async () => {
    const f = await fixture();
    const closed = await closeReview(f.userId, "WEEKLY");
    const correction = await correctReview(f.userId, "WEEKLY");
    expect((await getOrCreateReview(f.userId, "WEEKLY")).id).toBe(correction.id);
    await saveReviewFields(f.userId, "WEEKLY", { reflections: "Corrected facts" });
    await closeReview(f.userId, "WEEKLY");
    const second = await correctReview(f.userId, "WEEKLY");
    expect(second.id).not.toBe(correction.id);
    expect((await prisma.periodReview.findUniqueOrThrow({ where: { id: closed.id } })).snapshot).toEqual(closed.snapshot);
  });
});
