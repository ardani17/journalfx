import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SESSION_COOKIE, signSession } from "../src/lib/session";

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

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test.describe(viewport.name, () => {
    test.use({ isMobile: viewport.name === "mobile", hasTouch: viewport.name === "mobile" });

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
        await page.getByRole("link", { name: "Buka Skenario lama" }).click();
        await expect(page.getByRole("heading", { name: "Skenario lama" })).toBeVisible();
        await page.reload();
        for (const value of ["$550,25", "$200,00", "25,1234%", "Bulanan", "Nominal tetap · $5,75 / siklus", "$1,25"]) {
          await expect(page.getByText(value, { exact: true })).toBeVisible();
        }
        const savedRun = await runAndRead(page, "Simulasikan Skenario", `/api/scenarios/${saved.id}/run`);
        expect(savedRun.data.totalDeposits).toBe("100");
        expect(savedRun.data.firstCycles[1].returnPct).toBe("15");
        const direct = await page.request.post(runEndpoint, { data: values });
        expect((await direct.json()).data).toEqual(savedRun.data);
        const estimate = await page.getByText("Lama Estimasi").locator("..").locator("p").last().innerText();

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
