import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createActivitySchema, taskDateSchema, taskReflectionSchema, updateActivitySchema } from "@/lib/validation/tasks";
import { prisma } from "@/server/db";
import { createActivity, deleteActivity, getTaskDay, saveTaskReflection, updateActivity } from "@/server/services/tasks";

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
});
