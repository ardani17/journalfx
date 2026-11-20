import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SESSION_COOKIE, signSession } from "../src/lib/session";
import { fmtUSD } from "../src/lib/money";
import { zonedPeriod } from "../src/lib/dates";
import { formatLocalizedNumber } from "../src/lib/number-input";

const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());

async function planningFixture() {
  return prisma.$transaction(async (tx) => {
    const fixture = randomUUID();
    const [owner, other] = await Promise.all(["owner", "other"].map((role) => tx.user.create({
      data: { googleSubject: `roadmap-${role}-${fixture}`, email: `${role}-${fixture}@example.test`, name: role, timezone: "Asia/Jakarta" },
    })));
    const [project, otherProject, foreignProject] = await Promise.all([
      tx.project.create({ data: { userId: owner!.id, name: "Project utama", initialCapital: 200 } }),
      tx.project.create({ data: { userId: owner!.id, name: "Project lain", initialCapital: 200, isDefault: false } }),
      tx.project.create({ data: { userId: other!.id, name: "Project pengguna lain", initialCapital: 200 } }),
    ]);
    const [account, extraAccount] = await Promise.all([
      tx.tradingAccount.create({ data: { userId: owner!.id, projectId: project.id, name: "Saldo aktual" } }),
      tx.tradingAccount.create({ data: { userId: owner!.id, projectId: otherProject.id, name: "Di luar project aktif" } }),
    ]);
    await tx.accountTransaction.createMany({
      data: [
        { userId: owner!.id, accountId: account.id, type: "DEPOSIT", amount: 600, occurredAt: new Date("2025-01-01T20:00:00Z") },
        { userId: owner!.id, accountId: account.id, type: "WITHDRAWAL", amount: -250, occurredAt: new Date("2025-01-03T05:00:00Z") },
        { userId: owner!.id, accountId: extraAccount.id, type: "DEPOSIT", amount: 2500, occurredAt: new Date("2025-01-01T05:00:00Z") },
      ],
    });
    const values = {
      initialCapital: 200, targetAmount: 550.25, returnPerCycle: 25.1234,
      frequency: "MONTHLY" as const, wdMode: "FIXED" as const, fixedWdAmount: 5.75, costPerCycle: 1.25,
      deposits: { "01": 100 }, stressReturns: { "2.0": 15 },
    };
    const [saved, elsewhere, foreign, immediate] = await Promise.all([
      tx.compoundingScenario.create({ data: { ...values, userId: owner!.id, projectId: project.id, name: "Skenario lama" } }),
      tx.compoundingScenario.create({ data: { ...values, userId: owner!.id, projectId: otherProject.id, name: "Skenario project lain" } }),
      tx.compoundingScenario.create({ data: { ...values, userId: other!.id, projectId: foreignProject.id, name: "Skenario privat" } }),
      tx.compoundingScenario.create({
        data: { ...values, targetAmount: 200, userId: owner!.id, projectId: project.id, name: "Sudah tercapai" },
      }),
    ]);
    return { owner: owner!, other: other!, project, saved, elsewhere, foreign, immediate, values };
  });
}

async function runAndRead(page: Page, action: string, endpoint: string) {
  const pending = page.waitForResponse((response) => response.url().endsWith(endpoint) && response.request().method() === "POST");
  await page.getByRole("button", { name: action, exact: true }).click();
  const response = await pending;
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.ok).toBe(true);
  return { data: body.data, response };
}

test("opens cycle 100 and the final deterministic cycle, then runs Monte Carlo in a worker", async ({ page, baseURL }) => {
  const { owner, other } = await planningFixture();
  try {
    await page.context().addCookies([{
      url: baseURL!, name: SESSION_COOKIE, httpOnly: true,
      value: await signSession({ sub: owner.id, email: owner.email, name: owner.name }),
    }]);
    await page.goto("/simulator");
    await page.getByLabel("Return / Siklus (%)", { exact: true }).fill("5");
    await page.getByLabel("Biaya / Siklus (USD)", { exact: true }).fill("1");
    await page.getByLabel("Mode WD", { exact: true }).selectOption("FIXED");
    await page.getByLabel("Nominal WD (USD)", { exact: true }).fill("2");
    const { data } = await runAndRead(page, "Simulasikan", "/api/simulator/run");
    expect(data.cycles.length).toBeGreaterThan(100);
    const history = page.getByRole("region", { name: "Riwayat siklus deterministik" });
    const jump = async (cycle: number) => {
      await history.getByLabel("Nomor siklus").fill(String(cycle));
      await history.getByRole("button", { name: "Ke siklus" }).click();
    };
    await jump(100);
    const cycle = data.cycles[99];
    const row = history.getByRole("row").filter({ has: page.getByRole("cell", { name: "100 minggu", exact: true }) });
    // Compare the displayed values to the actual API row and reconcile the unrounded amounts.
    await expect(row.getByRole("cell")).toHaveCount(9);
    for (const [index, amount] of [[1, cycle.opening], [3, cycle.grossProfit], [4, cycle.costs],
      [5, cycle.profit], [6, cycle.deposit], [7, cycle.wd], [8, cycle.closing]]) {
      await expect(row.getByRole("cell").nth(Number(index))).toHaveText(fmtUSD(amount));
    }
    expect(Number(cycle.opening) + Number(cycle.profit) - Number(cycle.wd) + Number(cycle.deposit))
      .toBeCloseTo(Number(cycle.closing), 7);
    for (const size of ["50", "100", "200"]) {
      await history.getByLabel("Siklus per halaman").selectOption(size);
      await jump(data.cycles.length);
      await expect(history.getByRole("cell", { name: `${data.cycles.length} minggu`, exact: true })).toBeVisible();
    }

    await page.getByLabel("Iterasi Monte Carlo").fill("2000");
    await page.getByLabel("Jumlah trade", { exact: true }).fill("110");
    await page.getByLabel("Trade per siklus", { exact: true }).fill("1");
    await page.getByLabel("Win rate (%)", { exact: true }).fill("100");
    const worker = page.waitForEvent("worker");
    await page.getByRole("button", { name: "Simulasikan Monte Carlo" }).click();
    await worker;
    await expect(page.getByRole("heading", { name: "Contoh jalur simulasi" })).toBeVisible();
    const sample = page.getByRole("region", { name: "Riwayat siklus Monte Carlo" });
    await sample.getByLabel("Nomor siklus").fill("100");
    await sample.getByRole("button", { name: "Ke siklus" }).click();
    await sample.getByRole("button", { name: /Siklus 100 · Trade 100/ }).click();
    await expect(sample.getByRole("cell", { name: "Menang", exact: true })).toBeVisible();
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
  }
});

test("estimates capital from the active budget and prefills Monte Carlo", async ({ page, baseURL }, testInfo) => {
  const { owner, other } = await planningFixture();
  const rateId = `fixture-capital-${randomUUID()}`;
  try {
    const { start, end } = zonedPeriod("MONTHLY", new Date(), owner.timezone);
    await prisma.budget.create({
      data: {
        userId: owner.id, periodStart: start, periodEnd: end,
        categories: { create: { userId: owner.id, name: "Kebutuhan uji", plannedAmount: 5_000_000 } },
      },
    });
    await prisma.exchangeRate.create({ data: { id: rateId, pair: "USDIDR", source: "bi-jisdor", rate: 16_000, at: new Date() } });
    await page.context().addCookies([{
      url: baseURL!, name: SESSION_COOKIE, httpOnly: true,
      value: await signSession({ sub: owner.id, email: owner.email, name: owner.name }),
    }]);
    await page.goto("/expenses");
    await expect(page.getByLabel("Target dana bulanan (IDR)")).toHaveValue("5.000.000");
    await page.getByLabel("Imbal hasil bersih per bulan (%)").fill("5");
    await page.getByLabel("Porsi laba untuk kebutuhan (%)").fill("50");
    await expect(page.getByText("Rp200.000.000", { exact: false })).toBeVisible();
    await page.getByLabel("Target dana bulanan (IDR)").fill("2.500.000");
    await expect(page.getByText("Rp100.000.000", { exact: false })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("capital-estimate-desktop.png") });
    const jump = page.getByRole("link", { name: "Uji di Monte Carlo" });
    const href = await jump.getAttribute("href", { timeout: 3000 }).catch(() => null);
    if (href) {
      const amount = new URL(href, baseURL).searchParams.get("monteCarloEquity")!;
      await jump.click();
      await expect(page.locator("#monte-carlo-initialEquity")).toHaveValue(formatLocalizedNumber(amount));
    } else {
      await expect(page.getByText("Kurs USD diperlukan untuk mengisi modal awal Monte Carlo.")).toBeVisible();
      await page.goto("/simulator?monteCarloEquity=6250.25#monte-carlo");
      await expect(page.locator("#monte-carlo-initialEquity")).toHaveValue("6.250,25");
    }
    await expect(page.getByRole("heading", { name: "Contoh jalur simulasi" })).toHaveCount(0);
  } finally {
    await prisma.exchangeRate.deleteMany({ where: { id: rateId } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
  }
});

test("runs all three editable US$200 templates", async ({ page, baseURL }, testInfo) => {
  const { owner, other } = await planningFixture();
  try {
    await page.context().addCookies([{
      url: baseURL!, name: SESSION_COOKIE, httpOnly: true,
      value: await signSession({ sub: owner.id, email: owner.email, name: owner.name }),
    }]);
    await page.goto("/simulator");
    await page.getByRole("button", { name: "Coba contoh US$200" }).click();
    await expect(page.getByRole("button", { name: "Santai", exact: true })).toHaveAttribute("aria-pressed", "true");
    for (const [name, percent, value] of [["Konservatif", "0,5", "$1,00"], ["Santai", "1", "$2,00"], ["Agresif", "2", "$4,00"]] as const) {
      await page.getByRole("button", { name, exact: true }).click();
      await expect(page.locator("#monte-carlo-initialEquity")).toHaveValue("200");
      await expect(page.locator("#monte-carlo-baseRiskPercent")).toHaveValue(percent);
      await expect(page.getByText(`= ${value} per transaksi.`, { exact: false })).toBeVisible();
      await page.getByRole("button", { name: "Simulasikan Monte Carlo" }).click();
      await expect(page.getByRole("heading", { name: "Contoh jalur simulasi" })).toBeVisible();
    }
    await page.locator("#monte-carlo-initialEquity").fill("250");
    await expect(page.getByText("= $5,00 per transaksi.", { exact: false })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("monte-carlo-examples.png") });
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
  }
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test.describe(viewport.name, () => {
    test.use({ isMobile: viewport.name === "mobile", hasTouch: viewport.name === "mobile" });

    test("runs Monte Carlo with localized numbers and validates integer fields", async ({ page, baseURL }, testInfo) => {
      const { owner, other } = await planningFixture();
      try {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.context().addCookies([{
          url: baseURL!, name: SESSION_COOKIE, httpOnly: true,
          value: await signSession({ sub: owner.id, email: owner.email, name: owner.name }),
        }]);
        await page.goto("/simulator");
        const funds = page.getByLabel("Modal awal Monte Carlo (USD)", { exact: true });
        const iterations = page.getByLabel("Iterasi Monte Carlo");
        const run = page.getByRole("button", { name: "Simulasikan Monte Carlo" });
        await expect(iterations).toHaveValue("1.000");
        await funds.fill("1000000");
        await iterations.focus();
        await expect(funds).toHaveValue("1.000.000");
        await funds.fill("1.000.000,50");
        await iterations.fill("1,5");
        await run.click();
        await expect(page.locator("#monte-carlo-error")).toContainText("bilangan bulat");
        await iterations.fill("5");
        await page.locator("#monte-carlo-totalTrades").fill("1");
        await run.click();
        await expect(page.getByText(`Saldo awal ${fmtUSD(1_000_000.50)}`, { exact: false })).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(`monte-carlo-input-${viewport.name}.png`) });
      } finally {
        await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
      }
    });

    test(`edits, reopens, and applies private compounding plans on ${viewport.name}`, async ({ page, baseURL }) => {
      const { owner, other, project, saved, elsewhere, foreign, immediate, values } = await planningFixture();
      try {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.context().addCookies([{
          url: baseURL!, name: SESSION_COOKIE, value: await signSession({ sub: owner.id, email: owner.email, name: owner.name }),
          httpOnly: true,
        }]);
        await page.goto("/simulator");
        const runEndpoint = "/api/simulator/run";
        const saveEndpoint = "/api/scenarios";
        const target = page.getByLabel("Target (USD)", { exact: true });
        const start = page.getByLabel("Modal Awal (USD)", { exact: true });
        const returns = page.getByLabel("Return / Siklus (%)", { exact: true });
        const cost = page.getByLabel("Biaya / Siklus (USD)", { exact: true });
        await expect(target).toHaveValue("1.000.000");
        await expect(cost).toHaveAttribute("inputmode", "decimal");
        for (const [input, value] of [[start, "200"], [returns, "2"], [cost, "50"]] as const) {
          await input.selectText();
          await input.press("Backspace");
          await expect(input).toHaveValue("");
          await input.pressSequentially(value);
          await expect(input).toHaveValue(value);
        }
        await returns.fill("");
        await page.getByRole("button", { name: "Simulasikan", exact: true }).click();
        await expect(returns).toHaveAttribute("aria-invalid", "true");
        await expect(page.getByText("Kolom ini wajib diisi.")).toBeVisible();
        await returns.fill("0");
        await cost.fill("0,00");
        await page.getByLabel("Nama Skenario").fill("Uji skenario baru");

        const run = await runAndRead(page, "Simulasikan", runEndpoint);
        const newScenario = await runAndRead(page, "Simpan Skenario", saveEndpoint);
        for (const { response } of [run, newScenario]) {
          expect(response.request().postDataJSON()).toMatchObject({
            targetAmount: 1_000_000, initialCapital: 200, returnPerCycle: 0, costPerCycle: 0,
          });
        }
        expect(newScenario.data.summary).toEqual({ cyclesCount: run.data.cyclesCount, reached: run.data.reached });
        const newId: string = newScenario.data.scenario.id;
        await expect(page.getByRole("link", { name: "Buka Uji skenario baru" })).toBeVisible();
        const savedEndpoint = `/api/scenarios/${saved.id}/run`;
        const automaticRun = page.waitForResponse((response) => response.url().endsWith(savedEndpoint) && response.request().method() === "POST");
        await page.getByRole("link", { name: "Buka Skenario lama" }).click();
        await expect(page.getByRole("heading", { name: "Skenario lama" })).toBeVisible();
        const savedResponse = await automaticRun;
        expect(savedResponse.ok()).toBe(true);
        const savedRun = await savedResponse.json();
        await expect(page.getByText("Estimasi Pencapaian", { exact: true })).toBeVisible();
        await expect(page.getByRole("img", { name: "Kurva pertumbuhan simulasi" })).toBeVisible();
        await expect(page.getByRole("columnheader", { name: "Siklus" })).toBeVisible();
        await page.reload();
        await expect(page.getByText("Estimasi Pencapaian", { exact: true })).toBeVisible();
        for (const value of ["$550,25", "$200,00", "25,1234%", "Bulanan", "Nominal tetap · $5,75 / siklus", "$1,25"]) {
          await expect(page.getByText(value, { exact: true }).first()).toBeVisible();
        }
        expect(savedRun.data.totalDeposits).toBe("100");
        expect(savedRun.data.firstCycles[1].returnPct).toBe("15");
        const direct = await page.request.post(runEndpoint, { data: values });
        expect((await direct.json()).data).toEqual(savedRun.data);
        const estimate = await page.getByText("Lama Estimasi").locator("..").locator("p").last().innerText();
        await page.getByRole("link", { name: "Buka Uji skenario baru" }).click();
        await expect(page.getByText("Target belum tercapai dalam horizon", { exact: true })).toBeVisible();
        await expect(page.getByText(estimate, { exact: true })).toHaveCount(0);

        const failureMessage = "Simulasi sedang tidak tersedia";
        await page.route(`**${savedEndpoint}`, async (route) => {
          await expect(page.getByRole("status").filter({ hasText: "Menghitung simulasi" })).toBeVisible();
          await route.fulfill({ status: 503, json: { ok: false, error: failureMessage } });
        }, { times: 1 });
        await page.goto(`/simulator?scenarioId=${saved.id}`);
        await expect(page.getByRole("alert").filter({ hasText: failureMessage })).toBeVisible();
        await page.getByRole("button", { name: "Coba Lagi" }).click();
        await expect(page.getByText("Estimasi Pencapaian", { exact: true })).toBeVisible();
        expect((await prisma.compoundingScenario.findUniqueOrThrow({ where: { id: saved.id } })).updatedAt).toEqual(saved.updatedAt);

        const forbidden = await page.request.get(`/simulator?scenarioId=${foreign.id}`);
        expect(forbidden.status()).toBe(404);
        expect((await page.request.post(`/api/scenarios/${foreign.id}/run`)).status()).toBe(404);
        for (const id of [foreign.id, elsewhere.id]) {
          expect((await page.request.patch("/api/roadmap", { data: { scenarioId: id } })).status()).toBe(404);
        }

        await page.goto("/roadmap");
        const select = page.getByLabel("Skenario Compounding");
        const apply = page.getByRole("button", { name: "Terapkan", exact: true });
        const milestones = page.getByRole("table", { name: "Milestone Roadmap" });
        const history = page.getByRole("table", { name: "Riwayat Milestone" });
        await expect(select).toHaveValue("");
        await expect(page.getByText("Pengaturan project", { exact: true })).toBeVisible();
        await expect(select.locator("option", { hasText: "Skenario project lain" })).toHaveCount(0);
        await select.selectOption(saved.id);
        await apply.click();
        await expect(page.getByRole("link", { name: "Buka skenario aktif" })).toHaveAttribute("href", `/simulator?scenarioId=${saved.id}`);
        await page.reload();
        await expect(select).toHaveValue(saved.id);
        await expect(page.getByText(estimate, { exact: true })).toBeVisible();
        await expect(page.getByText("$350,00 / $550,25", { exact: true })).toBeVisible();
        await expect(milestones.getByRole("row").last()).toContainText("$550,25");
        await expect(milestones.getByRole("row").last()).toContainText("2 Jan 2025");
        await expect(history.getByRole("row", { name: /550,25/ })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

        await select.selectOption(newId);
        await apply.click();
        await expect(page.getByText("Target belum tercapai dalam 2000 minggu", { exact: true })).toBeVisible();
        await expect(history.getByRole("row", { name: /550,25/ })).toBeVisible();
        await select.selectOption("");
        await apply.click();
        await expect(page.getByText("Pengaturan project", { exact: true })).toBeVisible();
        await select.selectOption(immediate.id);
        await apply.click();
        await expect(page.getByText("Target sudah tercapai sejak awal", { exact: true })).toBeVisible();
        await expect(milestones.getByRole("row").last()).toContainText("Sejak awal");

        expect((await page.request.delete(`/api/scenarios/${immediate.id}`)).ok()).toBe(true);
        await page.reload();
        await expect(select).toHaveValue("");
        await expect(history.getByRole("row", { name: /550,25/ })).toBeVisible();
        const achievement = await prisma.roadmapMilestoneAchievement.findUnique({
          where: { projectId_amount: { projectId: project.id, amount: 550.25 } },
        });
        expect(achievement?.achievedAt.toISOString()).toBe("2025-01-01T20:00:00.000Z");
      } finally {
        await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
      }
    });
  });
}
