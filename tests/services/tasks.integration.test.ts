import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createActivitySchema, taskDateSchema, taskReflectionSchema, updateActivitySchema } from "@/lib/validation/tasks";
import { prisma } from "@/server/db";
import { createActivity, deleteActivity, getTaskDay, saveTaskReflection, updateActivity } from "@/server/services/tasks";
import { archiveActivityType, createActivityType, listActivityTypes, renameActivityType } from "@/server/services/task-types";

describe.skipIf(process.env.RUN_DB_TESTS !== "1")("PostgreSQL daily activity plans", () => {
  const userIds: string[] = [];

  beforeAll(() => {
    if (existsSync(".env")) process.loadEnvFile(".env");
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  async function createUser() {
    const key = randomUUID();
    const { id } = await prisma.user.create({
      data: { googleSubject: key, email: `${key}@example.test`, name: "Task QA" },
      select: { id: true },
    });
    userIds.push(id);
    return id;
  }

  it("keeps one day and one activity per request during concurrent first writes", async () => {
    const userId = await createUser();
    const date = "2028-02-29";
    const first = createActivitySchema.parse({ date, requestId: randomUUID(), kind: "GENERAL", plan: "Belajar" });
    const second = { ...first, requestId: randomUUID(), plan: "Olahraga" };
    const reflection = taskReflectionSchema.parse({ date, reflection: "Siapkan buku besok." });

    const [added, replay] = await Promise.all([
      createActivity(userId, first),
      createActivity(userId, first),
      createActivity(userId, second),
      saveTaskReflection(userId, reflection),
    ]);
    expect(added?.id).toBe(replay?.id);
    expect([added?.created, replay?.created].sort()).toEqual([false, true]);
    expect(await prisma.dailyPlan.count({ where: { userId } })).toBe(1);

    const day = await getTaskDay(userId, date);
    expect(day.activities.map(({ plan }) => plan).sort()).toEqual(["Belajar", "Olahraga"]);
    expect(day.activities.every(({ status }) => status === "PENDING")).toBe(true);
    expect(day.history).toEqual([{ date, count: 2 }]);
    expect(day.reflection).toBe(reflection.reflection);

    const nextDay = await getTaskDay(userId, "2028-03-01");
    expect(nextDay.history).toEqual([]);
    expect(nextDay.previousReflection).toBe(reflection.reflection);
    expect((await getTaskDay(userId, "2028-03-02")).previousReflection).toBeNull();
    expect(taskDateSchema.safeParse("2027-02-29").success).toBe(false);

    await saveTaskReflection(userId, taskReflectionSchema.parse({ date, reflection: " " }));
    expect((await getTaskDay(userId, "2028-03-01")).previousReflection).toBeNull();
  });

  it("scopes history, strategies and mutations by owner and preserves both parts of an activity", async () => {
    const [owner, other] = await Promise.all([createUser(), createUser()]);
    const strategy = await prisma.strategy.create({ data: { userId: owner, name: "Tunggu konfirmasi" } });
    const date = "2028-04-30";
    const trading = createActivitySchema.parse({
      date,
      requestId: randomUUID(),
      kind: "TRADING",
      plan: "Evaluasi setup",
      strategyId: strategy.id,
      entryConditions: "Tunggu penutupan harga",
    });
    const { id } = await createActivity(owner, trading);
    await saveTaskReflection(owner, taskReflectionSchema.parse({ date, reflection: "Tinjau aturan lebih awal." }));
    const actual = updateActivitySchema.parse({
      section: "realization",
      status: "COMPLETED",
      actualNotes: "Tidak membuka posisi karena kondisi masuk belum terpenuhi.",
    });
    const edit = updateActivitySchema.parse({
      section: "plan",
      kind: "TRADING",
      plan: "Evaluasi setup sesi pagi",
      strategyId: strategy.id,
      entryConditions: trading.entryConditions,
    });

    await expect(createActivity(other, trading)).rejects.toMatchObject({ status: 404 });
    await expect(updateActivity(other, id, actual)).rejects.toMatchObject({ status: 404 });
    await expect(deleteActivity(other, id)).rejects.toMatchObject({ status: 404 });
    await expect(getTaskDay(other, date)).resolves.toEqual({
      activities: [], history: [], previousReflection: null, reflection: null,
    });
    await expect(getTaskDay(other, "2028-05-01")).resolves.toMatchObject({ previousReflection: null });

    await Promise.all([updateActivity(owner, id, actual), updateActivity(owner, id, edit)]);
    const [activity] = (await getTaskDay(owner, date)).activities;
    expect(activity).toMatchObject({
      plan: "Evaluasi setup sesi pagi",
      strategy: { id: strategy.id, name: strategy.name },
      status: "COMPLETED",
      actualNotes: actual.section === "realization" && actual.actualNotes,
    });

    await prisma.strategy.delete({ where: { id: strategy.id } });
    expect((await getTaskDay(owner, date)).activities[0]).toMatchObject({ strategy: null, status: "COMPLETED" });
    await deleteActivity(owner, id);
    expect((await getTaskDay(owner, date)).history).toEqual([{ date, count: 0 }]);
  });

  it("renames and archives default types without losing old activities or letting another user reassign them", async () => {
    const [owner, other] = await Promise.all([createUser(), createUser()]);
    const defaults = await listActivityTypes(owner);
    const general = defaults.find(({ kind }) => kind === "GENERAL")!;
    const trading = defaults.find(({ kind }) => kind === "TRADING")!;
    const work = await createActivityType(owner, { name: "Kerja", kind: "GENERAL" });
    await expect(renameActivityType(owner, general.id, "kerja")).rejects.toMatchObject({ status: 409 });
    await expect(renameActivityType(other, trading.id, "Milik pengguna lain")).rejects.toMatchObject({ status: 404 });
    await expect(archiveActivityType(other, trading.id)).rejects.toMatchObject({ status: 404 });
    await expect(createActivity(other, createActivitySchema.parse({
      date: "2028-02-01", requestId: randomUUID(), plan: "Rencana asing", typeId: trading.id,
    }))).rejects.toMatchObject({ status: 404 });

    const activity = createActivitySchema.parse({
      date: "2028-02-01", requestId: randomUUID(), plan: "Periksa kondisi", typeId: trading.id,
      entryConditions: "Tunggu konfirmasi.",
    });
    const { id } = await createActivity(owner, activity);
    await updateActivity(owner, id, updateActivitySchema.parse({
      section: "realization", status: "COMPLETED", actualNotes: "Lewatkan karena setup belum sesuai.",
    }));
    await renameActivityType(owner, trading.id, "Analisis pasar");
    await archiveActivityType(owner, trading.id);

    expect((await listActivityTypes(owner)).map(({ id }) => id)).not.toContain(trading.id);
    await expect(createActivity(owner, { ...activity, requestId: randomUUID() })).rejects.toMatchObject({ status: 404 });
    expect((await getTaskDay(owner, activity.date)).activities[0]).toMatchObject({
      type: { id: trading.id, name: "Analisis pasar", kind: "TRADING", archivedAt: expect.any(Date) },
      entryConditions: "Tunggu konfirmasi.",
      status: "COMPLETED",
    });
    await updateActivity(owner, id, updateActivitySchema.parse({
      section: "plan", typeId: trading.id, plan: "Periksa kondisi sesi pagi", entryConditions: "Tunggu konfirmasi.",
    }));
    await updateActivity(owner, id, updateActivitySchema.parse({
      section: "plan", typeId: work.id, plan: "Periksa kondisi sesi pagi",
    }));
    expect((await getTaskDay(owner, activity.date)).activities[0]).toMatchObject({
      type: { id: work.id, name: "Kerja" },
      kind: "GENERAL",
      entryConditions: "Tunggu konfirmasi.",
      actualNotes: "Lewatkan karena setup belum sesuai.",
      status: "COMPLETED",
    });

    await archiveActivityType(owner, general.id);
    await archiveActivityType(owner, work.id);
    await expect(listActivityTypes(owner)).resolves.toEqual([]);
    await expect(listActivityTypes(other)).resolves.toHaveLength(2);
    const uncategorized = await createActivity(owner, createActivitySchema.parse({
      date: activity.date, requestId: randomUUID(), plan: "Rencana tanpa jenis", typeId: null,
    }));
    expect((await getTaskDay(owner, activity.date)).activities.find(({ id }) => id === uncategorized.id)).toMatchObject({
      type: null, kind: "GENERAL",
    });
    await expect(createActivityType(owner, { name: "kerja", kind: "GENERAL" })).resolves.toMatchObject({ name: "kerja" });
  });
});
