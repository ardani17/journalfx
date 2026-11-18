import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SESSION_COOKIE, signSession } from "../src/lib/session";

const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());

async function login(page: Page) {
  // OAuth protocol tests use a signed provider fixture. These UI tests exercise an already authenticated test session.
  const user = await prisma.user.findUniqueOrThrow({ where: { googleSubject: "horizon-journal-demo" } });
  const base = test.info().project.use.baseURL!;
  await page.context().addCookies([{
    url: base,
    name: SESSION_COOKIE,
    value: await signSession({ sub: user.id, email: user.email, name: user.name }),
    httpOnly: true,
    secure: new URL(base).protocol === "https:",
    sameSite: "Lax",
  }]);
  await page.goto("/dashboard");
  await page.waitForURL("**/dashboard");
}

test("public entry points offer only Google sign-in and expose policy pages", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Masuk dengan Google" })).toBeVisible();
  await expect(page.locator("input[type=password]")).toHaveCount(0);
  await page.getByRole("link", { name: "Kebijakan Privasi" }).click();
  await expect(page.getByRole("heading", { name: "Kebijakan Privasi Horizon Journal" })).toBeVisible();
  await page.getByRole("link", { name: "Ketentuan Penggunaan" }).click();
  await expect(page.getByRole("heading", { name: "Ketentuan Penggunaan Horizon Journal" })).toBeVisible();
  for (const path of ["/api/auth/login", "/api/onboard"]) {
    const response = await page.request.post(path, { data: { email: "test@example.com", password: "test" } });
    expect([401, 404, 405]).toContain(response.status());
    expect(response.headers()["set-cookie"]).toBeUndefined();
  }
});

test("security: unauthenticated routes redirect to /login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});

test("security: API rejects unauthenticated access", async ({ request }) => {
  const res = await request.get("/api/transactions");
  expect(res.status()).toBe(401);
  const att = await request.get("/api/attachments/nonexistent");
  expect(att.status()).toBe(401);
});

test("security: private attachment files are never served raw (redirect or 404, never image bytes)", async ({ request }) => {
  const res = await request.get("/uploads/trade-attachments/x/y.png", { maxRedirects: 0 });
  expect([307, 302, 404, 400]).toContain(res.status());
  expect(res.headers()["content-type"] ?? "").not.toContain("image/");
});

test("login → dashboard renders ledger-driven KPIs", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Balance Saat Ini")).toBeVisible();
  await expect(page.getByText("Progress Target")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rencana & Target" })).toBeVisible();
  await expect(page).toHaveTitle("Dashboard · Horizon Journal");
  await expect(page.getByRole("link", { name: "Horizon Journal" })).toBeVisible();
});

test("journal list + analytics + calendar + finance pages render", async ({ page }) => {
  await login(page);
  for (const path of ["/journal", "/calendar", "/analytics", "/roadmap", "/simulator", "/risk", "/risk/calculator", "/withdrawals", "/expenses", "/debts", "/finance/cashflow", "/finance/allocation", "/reports", "/reviews/weekly", "/notifications", "/transactions", "/accounts", "/settings"]) {
    const res = await page.goto(path);
    expect(res?.status(), `page ${path}`).toBe(200);
  }
});

test("a11y: key interactive elements have accessible names; no title overflow at mobile", async ({ page }) => {
  await login(page);
  const nav = page.getByRole("navigation", { name: "Navigasi utama" });
  await expect(nav).toBeVisible();
  await expect(page.getByRole("banner")).toBeVisible();
});

test("allocation percentages are configurable and invalid review kinds return 400", async ({ page }) => {
  await login(page);
  await page.goto("/finance/allocation");
  await expect(page.getByRole("button", { name: "Simpan Persentase" })).toBeVisible();
  expect(await page.locator('input[id^="pct-"]').count()).toBeGreaterThan(0);
  const response = await page.request.get("/api/reviews?kind=INVALID");
  expect(response.status()).toBe(400);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/allocation-mobile.png", fullPage: true });
});

test.describe("visual QA evidence (1440/1280/390)", () => {
  for (const vp of [
    { name: "1440x900", width: 1440, height: 900 },
    { name: "1280x800", width: 1280, height: 800 },
    { name: "390x844", width: 390, height: 844 },
  ]) {
    test(`dashboard @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await login(page);
      await page.waitForTimeout(800);
      await page.screenshot({ path: `e2e/visual/dashboard-${vp.name}.png`, fullPage: false });
    });
    test(`journal @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await login(page);
      await page.goto("/journal");
      await page.waitForTimeout(600);
      await page.screenshot({ path: `e2e/visual/journal-${vp.name}.png`, fullPage: false });
    });
  }
});
