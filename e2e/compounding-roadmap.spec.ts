import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SESSION_COOKIE, signSession } from "../src/lib/session";
import { describeProjection } from "../src/lib/finance/compounding";
import { zonedPeriod } from "../src/lib/dates";
import { monteCarloEquityStorageKey } from "../src/lib/finance/trading-capital";

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
    const month = start.toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: owner.timezone });
    await expect(page.getByText(`Periode: ${month}`, { exact: true })).toBeVisible();
    await expect(page.getByLabel("Target dana bulanan (IDR)")).toHaveValue("5.000.000");
    await page.getByLabel("Imbal hasil bersih per bulan (%)").fill("5");
    await page.getByLabel("Porsi laba untuk kebutuhan (%)").fill("50");
    await expect(page.getByText("Rp200.000.000", { exact: false })).toBeVisible();
    await page.getByLabel("Target dana bulanan (IDR)").fill("2.500.000");
    await expect(page.getByText("Rp100.000.000", { exact: false })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("capital-estimate-desktop.png") });
    const jump = page.getByRole("link", { name: "Uji di Monte Carlo" });
    const href = await jump.getAttribute("href", { timeout: 3000 }).catch(() => null);
    const storageKey = monteCarloEquityStorageKey(owner!.id);
    if (href) {
      expect(href).toBe("/simulator#monte-carlo");
      await jump.click();
      await expect(page.getByLabel("Modal awal (USD)", { exact: true })).not.toHaveValue("200");
    } else {
      await expect(page.getByText("Kurs USD diperlukan untuk mengisi modal awal Monte Carlo.")).toBeVisible();
      await page.evaluate(([key, amount]) => sessionStorage.setItem(key!, amount!), [storageKey, "6250.25"]);
      await page.goto("/simulator#monte-carlo");
      await expect(page.getByLabel("Modal awal (USD)", { exact: true })).toHaveValue("6.250,25");
    }
    await expect(page).toHaveURL(/\/simulator#monte-carlo$/);
    const equity = page.getByLabel("Modal awal (USD)", { exact: true });
    const transferred = await equity.inputValue();
    await page.getByRole("button", { name: "Acak ulang" }).click();
    await expect(equity).toHaveValue(transferred);
    expect(await page.evaluate((key) => sessionStorage.getItem(key), storageKey)).toBeNull();
    if (href) {
      const estimate = page.locator("#exploration-capital-idr");
      await expect(estimate).toHaveText(/^≈ Rp [\d.]+$/);
      await equity.fill("1.250,75");
      await expect(estimate).toHaveText(/^≈ Rp [\d.]+$/);
      const preview = await estimate.innerText();
      await equity.fill("250,75");
      await expect(estimate).not.toHaveText(preview);
      await equity.fill("");
      await expect(estimate).toHaveCount(0);
      await equity.fill("tidak valid");
      await expect(estimate).toHaveCount(0);
      await equity.fill(transferred);
      await page.getByText("Penarikan & biaya", { exact: true }).click();
      await expect(page.getByLabel("Biaya per trade (USD)", { exact: true })).toHaveAccessibleDescription("≈ Rp 0");
      const withdrawalMode = page.getByLabel("Mode penarikan per trade");
      await expect(page.getByLabel("Nominal ditarik (USD)", { exact: true })).toHaveCount(0);
      await withdrawalMode.selectOption("FIXED");
      await expect(page.getByLabel("Nominal ditarik (USD)", { exact: true })).toHaveAccessibleDescription("≈ Rp 0");
      await withdrawalMode.selectOption("NONE");
      await expect(page.locator("#exploration-withdrawalAmount-idr")).toHaveCount(0);
    }
    await page.reload();
    await expect(equity).toHaveValue("200");
    await expect(page.getByRole("heading", { name: "Peluang menyentuh target" })).toBeVisible();
  } finally {
    await prisma.exchangeRate.deleteMany({ where: { id: rateId } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
  }
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test.describe(viewport.name, () => {
    test.use({ isMobile: viewport.name === "mobile", hasTouch: viewport.name === "mobile" });

    test("explores a single trade horizon across the three chart scales", async ({ page, baseURL }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const { owner, other, saved } = await planningFixture();
      try {
        await page.context().addCookies([{
          url: baseURL!, name: SESSION_COOKIE, httpOnly: true,
          value: await signSession({ sub: owner.id, email: owner.email, name: owner.name }),
        }]);
        await page.goto("/simulator");
        const heading = page.getByRole("heading", { name: "Simulasi Compounding", exact: true });
        await expect(heading).toBeVisible();
        await expect(page).toHaveTitle(/Simulasi Compounding · Horizon Journal/);
        await expect(page.getByRole("navigation", { name: "Mode simulator" })).toHaveCount(0);
        const navigation = viewport.name === "mobile" ? "Navigasi bawah" : "Navigasi utama";
        const navLabel = viewport.name === "mobile" ? "Compounding" : "Simulasi Compounding";
        await expect(page.getByRole("navigation", { name: navigation }).getByRole("link", { name: navLabel, exact: true }))
          .toHaveAttribute("href", "/simulator");

        for (const query of ["?mode=pemajemukan", "?mode=lanjutan"]) {
          await page.goto("/simulator" + query);
          await expect(page).toHaveURL(/\/simulator$/);
          await expect(heading).toBeVisible();
        }
        await page.getByText("Rencana tersimpan dan Monte Carlo lanjutan", { exact: true }).click();
        await expect(page.getByRole("button", { name: "Coba contoh US$200", exact: true })).toBeVisible();
        await page.getByRole("link", { name: "Buka Skenario lama" }).click();
        await expect(page).toHaveURL(new RegExp(`/simulator\\?scenarioId=${saved.id}#rencana-tersimpan$`));
        await expect(page.getByText("Estimasi Pencapaian", { exact: true })).toBeVisible();
        await page.reload();
        await expect(page.getByText("Estimasi Pencapaian", { exact: true })).toBeVisible();
        await page.goto("/simulator");
        const trades = page.getByLabel("Jumlah trade", { exact: true });
        await expect(trades).toHaveCount(1);
        await trades.fill("1,5");
        await expect(trades).toHaveAttribute("aria-invalid", "true");
        await expect(page.getByRole("alert").filter({ hasText: "bilangan bulat" })).toBeVisible();
        await trades.fill("101");
        await expect(page.getByRole("img", { name: /Siklus 21/ })).toBeVisible();
        const axis = page.getByRole("group", { name: "Sumbu grafik" });
        await axis.getByRole("button", { name: "Hari", exact: true }).click();
        await expect(page.getByRole("img", { name: /Hari 101/ })).toBeVisible();
        await axis.getByRole("button", { name: "Tanggal", exact: true }).click();
        await page.getByLabel("Tanggal awal grafik").fill("2026-12-20");
        await expect(page.getByRole("img", { name: /20 Des 26 hingga 31 Mar 27/ })).toBeVisible();
        await expect(trades).toHaveValue("101");

        await page.getByRole("button", { name: "Lihat jalur win/loss" }).click();
        const path = page.getByRole("dialog", { name: "Contoh jalur win/loss" });
        await expect(path.getByText(/win · .* loss/)).toBeVisible();
        await path.getByRole("button", { name: "Berikutnya" }).click();
        await expect(path.getByText("Trade 9–16 dari 101")).toBeVisible();
        await page.keyboard.press("Escape");

        await page.getByRole("button", { name: "Simpan skenario", exact: true }).click();
        const save = page.getByRole("dialog", { name: "Simpan skenario" });
        await save.getByLabel("Nama skenario").fill("Eksplorasi uji");
        await save.getByRole("button", { name: "Simpan", exact: true }).click();
        await page.reload();
        await page.getByRole("button", { name: "Skenario", exact: true }).click();
        await page.getByRole("button", { name: "Gunakan Eksplorasi uji" }).click();
        await expect(trades).toHaveValue("101");
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      } finally {
        await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
      }
    });

    test(`uses saved compounding scenarios in Roadmap on ${viewport.name}`, async ({ page, baseURL }) => {
      const { owner, other, project, saved, elsewhere, foreign, immediate, values } = await planningFixture();
      try {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.context().addCookies([{
          url: baseURL!, name: SESSION_COOKIE, value: await signSession({ sub: owner.id, email: owner.email, name: owner.name }),
          httpOnly: true,
        }]);
        const runEndpoint = "/api/simulator/run";
        const newInput = { initialCapital: 200, targetAmount: 1_000_000, returnPerCycle: 0, costPerCycle: 0 };
        const run = await page.request.post(runEndpoint, { data: newInput });
        expect(run.ok()).toBe(true);
        const simulation = (await run.json()).data;
        const created = await page.request.post("/api/scenarios", { data: { ...newInput, name: "Uji skenario baru" } });
        expect(created.status()).toBe(201);
        const { scenario, summary } = (await created.json()).data;
        expect(summary).toEqual({ cyclesCount: simulation.cyclesCount, reached: simulation.reached });

        const savedRun = await page.request.post(`/api/scenarios/${saved.id}/run`);
        expect(savedRun.ok()).toBe(true);
        const savedSimulation = (await savedRun.json()).data;
        expect(savedSimulation.totalDeposits).toBe("100");
        expect(savedSimulation.firstCycles[1].returnPct).toBe("15");
        const direct = await page.request.post(runEndpoint, { data: values });
        expect(direct.ok()).toBe(true);
        expect((await direct.json()).data).toEqual(savedSimulation);
        const estimate = describeProjection(savedSimulation, saved.frequency);
        expect((await prisma.compoundingScenario.findUniqueOrThrow({ where: { id: saved.id } })).updatedAt).toEqual(saved.updatedAt);

        expect((await page.request.post(`/api/scenarios/${foreign.id}/run`)).status()).toBe(404);
        for (const id of [foreign.id, elsewhere.id]) {
          expect((await page.request.patch("/api/roadmap", { data: { scenarioId: id } })).status()).toBe(404);
        }

        await page.goto("/roadmap");
        const select = page.getByLabel("Skenario Compounding");
        const simulator = page.getByRole("link", { name: "Buka Simulasi Compounding", exact: true });
        await expect(simulator).toHaveAttribute("href", "/simulator");
        const apply = page.getByRole("button", { name: "Terapkan", exact: true });
        const milestones = page.getByRole("table", { name: "Tonggak Pencapaian" });
        const history = page.getByRole("table", { name: "Riwayat Pencapaian" });
        await expect(select).toHaveValue("");
        await expect(page.getByText("Pengaturan project", { exact: true })).toBeVisible();
        await expect(select.locator("option", { hasText: "Skenario project lain" })).toHaveCount(0);
        await select.selectOption(saved.id);
        await apply.click();
        await expect(page.getByText("Skenario lama", { exact: true }).filter({ visible: true })).toBeVisible();
        await expect(simulator).toHaveAttribute("href", `/simulator?scenarioId=${saved.id}#rencana-tersimpan`);
        await page.reload();
        await expect(select).toHaveValue(saved.id);
        await expect(page.getByText(estimate, { exact: true })).toBeVisible();
        const details = page.getByRole("heading", { name: "Estimasi Proyek" }).locator("../..");
        for (const value of ["$550,25", "$200,00", "25,1234%", "Bulanan", "Nominal tetap · $5,75 / siklus", "$1,25"]) {
          await expect(details.getByText(value, { exact: true })).toBeVisible();
        }
        await expect(page.getByText("$350,00 / $550,25", { exact: true })).toBeVisible();
        await expect(milestones.getByRole("row").last()).toContainText("$550,25");
        await expect(milestones.getByRole("row").last()).toContainText("2 Jan 2025");
        await expect(history.getByRole("row", { name: /550,25/ })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

        await select.selectOption(scenario.id);
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
