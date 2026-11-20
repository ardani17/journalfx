import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SESSION_COOKIE, signSession } from "../src/lib/session";
import { requireLocalTestDatabase } from "./test-database";

const prisma = new PrismaClient();
test.beforeAll(requireLocalTestDatabase);
test.afterAll(() => prisma.$disconnect());

async function createUser() {
  const key = randomUUID();
  return prisma.user.create({
    data: {
      googleSubject: `tasks-${key}`,
      email: `tasks-${key}@example.test`,
      name: "Task / Jadwal QA",
      timezone: "Pacific/Kiritimati",
      projects: { create: { name: "Jurnal", initialCapital: 100 } },
    },
  });
}

async function signIn(context: BrowserContext, baseURL: string, user: { id: string; email: string; name: string }) {
  await context.addCookies([{
    url: baseURL,
    name: SESSION_COOKIE,
    httpOnly: true,
    value: await signSession({ sub: user.id, email: user.email, name: user.name }),
  }]);
}

test("plans tomorrow, records outcomes, reviews history and opens the schedule on mobile", async ({ page, baseURL }, testInfo) => {
  const user = await createUser();

  try {
    const strategy = await prisma.strategy.create({ data: { userId: user.id, name: "Tunggu konfirmasi penutupan" } });
    await signIn(page.context(), baseURL!, user);
    await page.goto("/dashboard");
    await page.getByRole("navigation", { name: "Navigasi utama" }).getByRole("link", { name: "Tugas / Jadwal" }).click();
    const formatLocal = new Intl.DateTimeFormat("sv-SE", {
      dateStyle: "short",
      timeZone: user.timezone,
    });
    const now = new Date();
    const today = formatLocal.format(now);
    const tomorrow = formatLocal.format(new Date(now.getTime() + 86_400_000));
    const dateInput = page.getByLabel("Tanggal rencana");
    await expect(dateInput).toHaveValue(today);
    await expect(page.getByText("Belum ada rencana", { exact: true })).toBeVisible();

    const reflection = "Siapkan daftar tugas malam ini.";
    await page.getByLabel("Langkah perbaikan").fill(reflection);
    await page.getByRole("button", { name: "Simpan refleksi" }).click();
    await expect(page.getByRole("status")).toHaveText("Refleksi tersimpan.");
    const tomorrowLink = page.getByRole("link", { name: "Besok", exact: true });
    await tomorrowLink.click();
    await expect(dateInput).toHaveValue(tomorrow);
    await expect(tomorrowLink).toHaveAttribute("aria-current", "date");
    await expect(page.getByRole("complementary", { name: "Langkah dari hari sebelumnya" })).toContainText(reflection);

    const plans = ["Periksa peluang trading", "Baca buku", "Olahraga pagi", "Belanja rumah", "Telepon keluarga"];
    for (const [index, plan] of plans.entries()) {
      await page.getByRole("button", { name: "Tambah kegiatan" }).click();
      await page.getByLabel("Rencana kegiatan", { exact: true }).fill(plan);
      if (index === 0) {
        await page.getByLabel("Jenis kegiatan").selectOption({ label: "Trading" });
        await page.getByLabel("Strategi (opsional)").selectOption(strategy.id);
        await page.getByLabel("Kondisi masuk (opsional)").fill("Tunggu penutupan di atas level rencana.");
      } else {
        await expect(page.getByLabel("Strategi (opsional)")).toHaveCount(0);
      }
      await page.getByRole("button", { name: "Simpan rencana" }).click();
      await expect(page.getByText(plan, { exact: true })).toBeVisible();
    }

    for (const [index, plan] of plans.entries()) {
      const activity = page.getByRole("listitem").filter({ has: page.getByText(plan, { exact: true }) });
      await expect(activity.getByText("Menunggu", { exact: true })).toBeVisible();
      await activity.getByRole("button", { name: "Catat realisasi" }).click();
      if (index === 0) {
        await expect(activity.getByText(/jika keputusan untuk tidak membuka posisi/)).toBeVisible();
        await activity.getByLabel("Catatan realisasi").fill("Tidak membuka posisi karena kondisi belum terpenuhi.");
      }
      await activity.getByLabel("Status", { exact: true }).selectOption(index < 4 ? "COMPLETED" : "NOT_COMPLETED");
      await activity.getByRole("button", { name: "Simpan realisasi" }).click();
      await expect(activity.getByText(index < 4 ? "Terlaksana" : "Tidak terlaksana", { exact: true })).toBeVisible();
    }
    await expect(page.getByText("80%", { exact: true })).toBeVisible();
    await expect(page.getByText("4 dari 5 kegiatan terlaksana")).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath("task-jadwal-desktop.png") });

    await dateInput.fill(`${tomorrow.slice(0, 8)}01`);
    await page.getByRole("button", { name: "Lihat", exact: true }).click();
    const history = page.getByRole("link").filter({ has: page.locator(`time[datetime="${tomorrow}"]`) });
    await history.click();
    await expect(page.getByText("Tidak membuka posisi karena kondisi belum terpenuhi.")).toBeVisible();
    await expect(page.getByText(strategy.name, { exact: true })).toBeVisible();

    const last = page.getByRole("listitem").filter({ hasText: "Telepon keluarga" });
    await last.getByRole("button", { name: "Edit rencana" }).click();
    await last.getByLabel("Rencana kegiatan", { exact: true }).fill("Telepon keluarga sore ini");
    await last.getByRole("button", { name: "Simpan rencana" }).click();
    await expect(page.getByText("Telepon keluarga sore ini")).toBeVisible();
    await expect(last.getByText("Tidak terlaksana", { exact: true })).toBeVisible();
    await last.getByRole("button", { name: "Hapus", exact: true }).click();
    await page.getByRole("dialog", { name: "Hapus kegiatan?" }).getByRole("button", { name: "Hapus kegiatan" }).click();
    await expect(page.getByText("4 dari 4 kegiatan terlaksana")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Buka menu navigasi" }).click();
    await page.getByRole("dialog", { name: "Menu navigasi" }).getByRole("link", { name: "Tugas / Jadwal" }).click();
    await page.getByRole("link", { name: "Besok", exact: true }).click();
    await expect(page.getByText("Tidak membuka posisi karena kondisi belum terpenuhi.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: testInfo.outputPath("task-jadwal-mobile.png") });
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("protects private plans, reflections and strategies at the normal page and API routes", async ({ browser, page, baseURL, request }) => {
  const owner = await createUser();
  const other = await createUser();
  const otherContext = await browser.newContext({ baseURL });

  try {
    const date = "2028-02-29";
    const strategy = await prisma.strategy.create({ data: { userId: owner.id, name: "Strategi privat" } });
    const body = { date, requestId: randomUUID(), plan: "Rencana privat", kind: "TRADING", strategyId: strategy.id };

    await signIn(page.context(), baseURL!, owner);
    await signIn(otherContext, baseURL!, other);
    expect((await request.post("/api/tasks", { data: body })).status()).toBe(401);
    expect((await page.request.post("/api/tasks", { data: { ...body, date: "2027-02-29" } })).status()).toBe(400);
    const created = await page.request.post("/api/tasks", { data: body });
    expect(created.status()).toBe(201);
    const { data: { id } } = await created.json();
    const replay = await page.request.post("/api/tasks", { data: body });
    expect(replay.status()).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ data: { id } });
    expect((await page.request.put("/api/tasks/reflection", { data: { date, reflection: "Refleksi privat" } })).status()).toBe(200);

    expect((await otherContext.request.post("/api/tasks", { data: body })).status()).toBe(404);
    expect((await otherContext.request.patch(`/api/tasks/${id}`, {
      data: { section: "realization", status: "COMPLETED" },
    })).status()).toBe(404);
    expect((await otherContext.request.delete(`/api/tasks/${id}`)).status()).toBe(404);

    const otherPage = await otherContext.newPage();
    await otherPage.goto(`/tasks?date=${date}`);
    await expect(otherPage.getByText("Belum ada rencana")).toBeVisible();
    await expect(otherPage.getByText("Rencana privat")).toHaveCount(0);
    await otherPage.getByRole("button", { name: "Tambah kegiatan" }).click();
    await otherPage.getByLabel("Jenis kegiatan").selectOption({ label: "Trading" });
    await expect(otherPage.getByRole("option", { name: "Strategi privat" })).toHaveCount(0);
    await otherPage.goto("/tasks?date=2028-03-01");
    await expect(otherPage.getByText("Refleksi privat")).toHaveCount(0);

    await page.goto(`/tasks?date=${date}`);
    await expect(page.getByText("Rencana privat", { exact: true })).toBeVisible();
    await expect(page.getByText("Menunggu", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Langkah perbaikan")).toHaveValue("Refleksi privat");
  } finally {
    await otherContext.close();
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
  }
});

test("manages activity types on mobile and changes an existing activity without losing its result", async ({ page, baseURL }) => {
  const user = await createUser();
  const plan = "Periksa kondisi pasar";

  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page.context(), baseURL!, user);
    await page.goto("/tasks?date=2028-03-05");
    await page.getByRole("button", { name: "Tambah kegiatan" }).click();
    const kinds = page.getByLabel("Jenis kegiatan");
    await kinds.selectOption({ label: "Trading" });
    await page.getByLabel("Rencana kegiatan", { exact: true }).fill(plan);
    await page.getByLabel("Kondisi masuk (opsional)").fill("Patuhi kondisi masuk.");
    await page.getByRole("button", { name: "Simpan rencana" }).click();
    const activity = page.getByRole("listitem").filter({ has: page.getByText(plan, { exact: true }) });
    await activity.getByRole("button", { name: "Catat realisasi" }).click();
    await activity.getByLabel("Status", { exact: true }).selectOption("COMPLETED");
    await activity.getByLabel("Catatan realisasi").fill("Menunggu konfirmasi dan tidak membuka posisi.");
    await activity.getByRole("button", { name: "Simpan realisasi" }).click();
    await expect(activity.getByText("Terlaksana", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Kelola jenis", exact: true }).click();
    const manager = page.getByRole("dialog", { name: "Kelola jenis kegiatan" });
    await manager.getByLabel("Nama jenis baru").fill("Belajar");
    await manager.getByRole("button", { name: "Tambah jenis", exact: true }).click();
    await expect(manager.getByText("Belajar", { exact: true })).toBeVisible();

    const row = (name: string) => manager.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });
    await row("Trading").getByRole("button", { name: "Ubah nama" }).click();
    await manager.getByLabel("Nama baru").fill("Analisis pasar");
    await manager.getByRole("button", { name: "Simpan nama" }).click();
    await row("Analisis pasar").getByRole("button", { name: "Hapus jenis", exact: true }).click();
    await manager.getByRole("button", { name: "Konfirmasi hapus jenis" }).click();
    await expect(row("Analisis pasar")).toHaveCount(0);
    await manager.getByRole("button", { name: "Tutup", exact: true }).click();

    await expect(activity.getByText("Analisis pasar", { exact: true })).toBeVisible();
    await expect(activity.getByText("Patuhi kondisi masuk.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Tambah kegiatan" }).click();
    await expect(kinds.getByRole("option", { name: /Analisis pasar/ })).toHaveCount(0);
    await expect(kinds.getByRole("option", { name: "Belajar" })).toHaveCount(1);
    await page.getByRole("button", { name: "Batal", exact: true }).click();

    await activity.getByRole("button", { name: "Edit rencana" }).click();
    await expect(kinds.locator("option:checked")).toHaveText("Analisis pasar (dihapus)");
    await kinds.selectOption({ label: "Belajar" });
    await activity.getByRole("button", { name: "Simpan rencana" }).click();
    await expect(activity.getByText("Belajar", { exact: true })).toBeVisible();
    await expect(activity.getByText("Menunggu konfirmasi dan tidak membuka posisi.")).toBeVisible();
    await expect(activity.getByText("Terlaksana", { exact: true })).toBeVisible();
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("adds the first strategy from a trading activity without losing the plan", async ({ page, baseURL }) => {
  const user = await createUser();
  const plan = "Periksa setup sebelum membuka posisi";
  const conditions = "Tunggu candle selesai.";
  const name = "Konfirmasi sesi pagi";

  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page.context(), baseURL!, user);
    await page.goto("/tasks?date=2028-03-06");
    await page.getByRole("button", { name: "Tambah kegiatan" }).click();
    await page.getByLabel("Rencana kegiatan", { exact: true }).fill(plan);
    await page.getByLabel("Jenis kegiatan").selectOption({ label: "Trading" });
    await page.getByLabel("Kondisi masuk (opsional)").fill(conditions);
    await page.getByLabel("Jenis kegiatan").selectOption({ label: "Umum" });
    await page.getByLabel("Jenis kegiatan").selectOption({ label: "Trading" });
    await expect(page.getByLabel("Kondisi masuk (opsional)")).toHaveValue(conditions);
    const strategy = page.getByLabel("Strategi (opsional)");
    await expect(strategy.getByRole("option")).toHaveCount(1);

    const addStrategy = page.getByRole("button", { name: "Tambah strategi", exact: true });
    await expect(addStrategy).toBeVisible({ timeout: 3000 });
    await addStrategy.click();
    const dialog = page.getByRole("dialog", { name: "Tambah strategi" });
    await dialog.getByLabel("Nama strategi").fill(name);
    await dialog.getByRole("button", { name: "Simpan strategi", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(strategy.locator("option:checked")).toHaveText(name);
    await expect(page.getByLabel("Rencana kegiatan", { exact: true })).toHaveValue(plan);
    await expect(page.getByLabel("Kondisi masuk (opsional)")).toHaveValue(conditions);

    await page.getByRole("button", { name: "Simpan rencana", exact: true }).click();
    const saved = page.getByRole("listitem").filter({ has: page.getByText(plan, { exact: true }) });
    await expect(saved.getByText(name, { exact: true })).toBeVisible();
    await page.reload();
    await expect(saved.getByText(name, { exact: true })).toBeVisible();
    await page.goto("/journal/new");
    await expect(page.getByLabel("Strategi", { exact: true }).getByRole("option", { name, exact: true })).toHaveCount(1);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
