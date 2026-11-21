import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SESSION_COOKIE, signSession } from "../src/lib/session";
import { requireLocalTestDatabase } from "./test-database";

const mode = process.env.AI_JOURNAL_E2E_MODE ?? "mock";
const db = new PrismaClient();
const fixtureIds: string[] = [];
let mockProvider: Server | undefined;
let stallProvider = false;
const seenExports: { metrics: { netPnlUsd: string }; coverage: { withJournal: number } }[] = [];

test.beforeAll(async () => {
  requireLocalTestDatabase();
  if (mode !== "mock") return;

  const server = createServer(async (request, response) => {
    try {
      let raw = "";
      for await (const chunk of request) raw += String(chunk);
      if (stallProvider) return;
      const { messages } = JSON.parse(raw);
      const data = JSON.parse(messages[1].content);
      seenExports.push(data);
      const sessions: { id: string; netPnlUsd: string }[] = data.breakdowns.session;
      const winner = sessions.find(({ netPnlUsd }) => Number(netPnlUsd) > 0);
      const loser = sessions.find(({ netPnlUsd }) => Number(netPnlUsd) < 0);
      const content = JSON.stringify({
        summary: "Evaluasi seluruh trade tertutup.",
        strengths: winner ? [{ text: "Pertahankan eksekusi yang konsisten pada kelompok dengan hasil positif.", evidenceIds: [winner.id] }] : [],
        mistakes: loser ? [{ text: "Tinjau ada tidaknya pola kesalahan dalam kelompok ini.", evidenceIds: [loser.id] }] : [],
        actionPlan: [{ text: "Tinjau alasan entry dan exit selama sesi berikutnya.", evidenceIds: ["overview"] }],
      });
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content } }] }));
    } catch {
      response.writeHead(400).end();
    }
  });
  mockProvider = server;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(3216, "127.0.0.1", resolve);
  });
});

test.afterEach(async () => {
  stallProvider = false;
  seenExports.length = 0;
  if (fixtureIds.length > 0) {
    const ids = fixtureIds.splice(0);
    await db.aiJournalRateLimit.deleteMany({ where: { key: { in: ids.map((id) => `user:${id}`) } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  }
});

test.afterAll(async () => {
  const server = mockProvider;
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await db.$disconnect();
});

async function openReports(page: Page, sample: Array<{ pnl: number; session?: string; actualR?: number }>) {
  const run = randomUUID();
  const user = await db.user.create({ data: { email: `ai-qa-${run}@example.invalid`, name: "AI Journal QA", googleSubject: `ai-qa-${run}` } });
  fixtureIds.push(user.id);
  const project = await db.project.create({ data: { userId: user.id, name: "QA", initialCapital: 100 } });
  const account = await db.tradingAccount.create({ data: { userId: user.id, projectId: project.id, name: "QA" } });
  const instrument = await db.instrument.create({ data: { ownerId: user.id, symbol: "QAAI", name: "Synthetic instrument", category: "metal" } });
  await db.trade.createMany({ data: sample.map(({ pnl, session, actualR }) => ({
    userId: user.id,
    accountId: account.id,
    instrumentId: instrument.id,
    direction: "LONG",
    status: "CLOSED",
    lot: 1,
    entryPrice: 100,
    initialStopLoss: 90,
    realizedPnl: pnl,
    actualR,
    entryAt: new Date("2020-01-01T09:00:00Z"),
    exitAt: new Date("2020-01-01T10:00:00Z"),
    session,
  })) });
  const base = test.info().project.use.baseURL!;
  await page.context().addCookies([{
    url: base,
    name: SESSION_COOKIE,
    value: await signSession({ sub: user.id, email: user.email, name: user.name }),
    httpOnly: true,
    secure: new URL(base).protocol === "https:",
    sameSite: "Lax",
  }]);
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { name: "Hasil Analisis AI", exact: true })).toBeVisible();
  return user.id;
}

async function generate(page: Page, button = "Buat analisis AI") {
  const response = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/analytics/journal-insights", {
    timeout: 25_000,
  });
  await page.getByRole("button", { name: button, exact: true }).click();
  return response;
}

const journalFreeSample = [{ pnl: 30, actualR: 2 }, { pnl: -10, actualR: -1 }, { pnl: 0 }];

test("explains why AI needs more closed trades", async ({ page }) => {
  await openReports(page, [{ pnl: 30 }]);
  await expect(page.getByRole("button", { name: "Buat analisis AI" })).toBeDisabled();
  await expect(page.getByText("Analisis AI membutuhkan minimal 3 trade tertutup dengan P/L tercatat.")).toBeVisible();
});

test("records an explicit noncompliant trade and clears a prior journal answer", async ({ page }) => {
  const userId = await openReports(page, [{ pnl: 30 }]);
  const { id } = await db.trade.findFirstOrThrow({ where: { userId }, select: { id: true } });
  await page.goto(`/journal/${id}`);
  await page.getByRole("tab", { name: "Psikologi dan Jurnal" }).click();
  const compliant = page.getByLabel("Patuh pada rencana");
  await expect(compliant).toHaveValue("");

  for (const value of ["true", "false", ""]) {
    const saved = page.waitForResponse((response) =>
      new URL(response.url()).pathname === `/api/trades/${id}/journal` && response.request().method() === "PUT");
    await compliant.selectOption(value);
    await page.getByRole("button", { name: "Simpan Jurnal" }).click();
    expect((await saved).ok()).toBe(true);
    expect(await db.tradeJournal.findUnique({ where: { tradeId: id }, select: { compliant: true } }))
      .toEqual({ compliant: value === "" ? null : value === "true" });
  }
});

test("explains unavailable configuration and keeps rule-based insights visible", async ({ page }) => {
  test.skip(mode !== "disabled", "Run with AI_JOURNAL_E2E_MODE=disabled.");
  await openReports(page, journalFreeSample);
  await expect(page.getByRole("button", { name: "Buat analisis AI" })).toBeDisabled();
  await expect(page.getByText("Penyedia AI belum dikonfigurasi.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Insight berbasis aturan" })).toBeVisible();
  expect((await page.request.post("/api/analytics/journal-insights")).status()).toBe(503);
});

test("compares opposite sessions using each signed-in account's full history", async ({ page }) => {
  test.skip(mode === "disabled", "Requires an AI provider.");
  for (const { london, newYork, winner, loser, winnerTotal, loserTotal } of [
    { london: 30, newYork: -10, winner: "London", loser: "New York", winnerTotal: "$90,00", loserTotal: "−$30,00" },
    { london: -8, newYork: 20, winner: "New York", loser: "London", winnerTotal: "$60,00", loserTotal: "−$24,00" },
  ]) {
    await openReports(page, [
      ...Array.from({ length: 3 }, () => ({ pnl: london, session: "london" })),
      ...Array.from({ length: 3 }, () => ({ pnl: newYork, session: "newyork" })),
    ]);
    const response = await generate(page);
    expect(response.status(), await response.text()).toBe(200);
    const findings = page.getByRole("region", { name: "Laporan analisis AI" });
    await expect(findings.getByText("6 trade dianalisis", { exact: false })).toBeVisible();
    await expect(findings.getByRole("heading", { name: "Apa yang Sudah Benar" })).toBeVisible();
    await expect(findings.getByRole("heading", { name: "Apa yang Salah" })).toBeVisible();
    if (mode === "mock") {
      await expect(findings.getByText(`${winner} · 3 trade · P/L ${winnerTotal}`, { exact: false })).toBeVisible();
      await expect(findings.getByText(`${loser} · 3 trade · P/L ${loserTotal}`, { exact: false })).toBeVisible();
    }
  }
});

test("shows evidence and a review action for closed trades without journal entries", async ({ page }) => {
  test.skip(mode === "disabled", "Requires an AI provider.");
  await openReports(page, journalFreeSample);
  const response = await generate(page);
  expect(response.status(), await response.text()).toBe(200);
  const report = page.getByRole("region", { name: "Laporan analisis AI" });
  await expect(report.getByText("3 trade dianalisis", { exact: false })).toBeVisible();
  await expect(report.getByText("$20,00", { exact: true })).toBeVisible();
  await expect(report.getByText("33,33%", { exact: true })).toBeVisible();
  await expect(report.getByText("Rata-rata R 0,50R dari 2 trade.")).toBeVisible();
  await expect(report.getByRole("heading", { name: "Evaluasi & Rencana Perbaikan" })).toBeVisible();
});

test("requests a new analysis for unchanged data and reflects the next saved database change", async ({ page }) => {
  test.skip(mode !== "mock", "Requires provider payload observations.");
  const userId = await openReports(page, journalFreeSample);
  const clearQuota = () => db.aiJournalRateLimit.delete({ where: { key: "user:" + userId } });
  expect((await generate(page)).status()).toBe(200);
  await clearQuota();
  expect((await generate(page)).status()).toBe(200);
  await clearQuota();
  const trade = await db.trade.findFirstOrThrow({ where: { userId, realizedPnl: 30 } });
  await db.trade.update({ where: { id: trade.id }, data: {
    realizedPnl: 40, journal: { create: { compliant: false } },
  } });
  expect((await generate(page)).status()).toBe(200);
  expect(seenExports.map((snapshot) => [snapshot.metrics.netPnlUsd, snapshot.coverage.withJournal]))
    .toEqual([["20", 0], ["20", 0], ["30", 1]]);
  await expect(page.getByRole("region", { name: "Laporan analisis AI" }).getByText("$30,00", { exact: true })).toBeVisible();
});

test("shows a timeout, explains quota, and allows retry", async ({ page }) => {
  test.skip(mode !== "mock", "Requires the mock provider to produce a controlled timeout.");
  const userId = await openReports(page, journalFreeSample);
  const key = `user:${userId}`;
  expect((await generate(page)).status()).toBe(200);
  await db.aiJournalRateLimit.delete({ where: { key } });
  stallProvider = true;
  const timedOut = generate(page);
  await expect(page.getByText("Analisis transaksi sedang diproses.")).toBeVisible();
  expect((await timedOut).status()).toBe(504);
  await expect(page.getByRole("alert").filter({ hasText: "Penyedia AI terlalu lama merespons." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hasil terakhir", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Insight berbasis aturan" })).toBeVisible();

  stallProvider = false;
  await db.aiJournalRateLimit.update({ where: { key }, data: { windowStart: new Date(Date.now() + 60_000) } });
  expect((await generate(page, "Coba lagi")).status()).toBe(429);
  await expect(page.getByRole("alert").filter({ hasText: "Batas permintaan insight AI tercapai." })).toBeVisible();

  await db.aiJournalRateLimit.delete({ where: { key } });
  expect((await generate(page, "Coba lagi")).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Laporan analisis AI", exact: true })).toBeVisible();
});
