import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { addUTCDays } from "@/lib/dates";
import type { CreateActivity, TaskReflection, UpdateActivity } from "@/lib/validation/tasks";
import { prisma } from "@/server/db";
import { activityTypeSelect, defaultActivityTypeId, ensureDefaultActivityTypes } from "./task-types";

const activitySelect = {
  id: true,
  plan: true,
  kind: true,
  type: { select: activityTypeSelect },
  status: true,
  entryConditions: true,
  actualNotes: true,
  strategy: { select: { id: true, name: true } },
} satisfies Prisma.DailyActivitySelect;

export type TaskActivity = Prisma.DailyActivityGetPayload<{ select: typeof activitySelect }>;

export async function getTaskDay(userId: string, dateKey: string) {
  const date = new Date(dateKey);
  const start = new Date(date);
  start.setUTCDate(1);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const [day, previousDay, history] = await Promise.all([
    prisma.dailyPlan.findUnique({
      where: { userId_date: { userId, date } },
      select: {
        reflection: true,
        activities: { select: activitySelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
    }),
    dateKey === "0001-01-01" ? null : prisma.dailyPlan.findUnique({
      where: { userId_date: { userId, date: addUTCDays(date, -1) } },
      select: { reflection: true },
    }),
    prisma.dailyPlan.findMany({
      where: {
        userId,
        date: { gte: start, lt: end },
        OR: [{ activities: { some: {} } }, { reflection: { not: null } }],
      },
      orderBy: { date: "desc" },
      select: { date: true, _count: { select: { activities: true } } },
    }),
  ]);
  return {
    activities: day?.activities ?? [],
    reflection: day?.reflection ?? null,
    previousReflection: previousDay?.reflection ?? null,
    history: history.map((entry) => ({
      date: entry.date.toISOString().slice(0, 10),
      count: entry._count.activities,
    })),
  };
}

async function validatePlanFields(
  db: Prisma.TransactionClient,
  userId: string,
  input: Pick<CreateActivity, "plan" | "typeId" | "kind" | "strategyId" | "entryConditions">,
  current?: { typeId: string | null; kind: TaskActivity["kind"] },
) {
  let typeId = input.typeId;
  if (typeId === undefined) {
    const kind = input.kind ?? "GENERAL";
    if (current?.kind === kind) {
      typeId = current.typeId;
    } else {
      await ensureDefaultActivityTypes(db, userId);
      typeId = defaultActivityTypeId(userId, kind);
    }
  }
  const type = typeId ? await db.dailyActivityType.findUnique({
    where: { id: typeId, userId },
    select: { kind: true, archivedAt: true },
  }) : null;
  if (typeId && (!type || (type.archivedAt && current?.typeId !== typeId))) {
    throw new ApiError(404, "Jenis kegiatan tidak ditemukan");
  }
  const kind = type?.kind ?? (input.typeId === undefined ? input.kind : undefined) ?? "GENERAL";
  const fields = { plan: input.plan, kind, typeId };
  if (kind !== "TRADING") return fields;

  const strategyId = input.strategyId ?? null;
  if (strategyId && !await db.strategy.findUnique({ where: { id: strategyId, userId }, select: { id: true } })) {
    throw new ApiError(404, "Strategi tidak ditemukan");
  }
  return {
    ...fields,
    strategyId,
    entryConditions: input.entryConditions,
  };
}

async function findOrCreateDay(tx: Prisma.TransactionClient, userId: string, date: Date) {
  await tx.dailyPlan.createMany({ data: { userId, date }, skipDuplicates: true });
  return tx.dailyPlan.findUniqueOrThrow({
    where: { userId_date: { userId, date } },
    select: { id: true },
  });
}

export async function createActivity(userId: string, input: CreateActivity) {
  const date = new Date(input.date);
  return prisma.$transaction(async (tx) => {
    const day = await findOrCreateDay(tx, userId, date);
    const key = { dailyPlanId: day.id, requestId: input.requestId };
    const where = { dailyPlanId_requestId: key };
    const select = { id: true };
    const existing = await tx.dailyActivity.findUnique({ where, select });
    if (existing) return { id: existing.id, created: false };

    const fields = await validatePlanFields(tx, userId, input);
    const { count } = await tx.dailyActivity.createMany({
      data: { ...key, ...fields },
      skipDuplicates: true,
    });
    const { id } = await tx.dailyActivity.findUniqueOrThrow({ where, select });
    return { id, created: count === 1 };
  });
}

export async function updateActivity(userId: string, id: string, input: UpdateActivity) {
  return prisma.$transaction(async (tx) => {
    const where = { id, dailyPlan: { userId } };
    let data: Prisma.DailyActivityUncheckedUpdateManyInput;
    if (input.section === "plan") {
      const current = await tx.dailyActivity.findUnique({ where, select: { typeId: true, kind: true } });
      if (!current) throw new ApiError(404, "Kegiatan tidak ditemukan");
      data = await validatePlanFields(tx, userId, input, current);
    } else {
      data = { status: input.status, actualNotes: input.actualNotes };
    }
    const { count } = await tx.dailyActivity.updateMany({
      where,
      data,
    });
    if (!count) throw new ApiError(404, "Kegiatan tidak ditemukan");
    return { id };
  });
}

export async function deleteActivity(userId: string, id: string) {
  const { count } = await prisma.dailyActivity.deleteMany({ where: { id, dailyPlan: { userId } } });
  if (!count) throw new ApiError(404, "Kegiatan tidak ditemukan");
}

export async function saveTaskReflection(userId: string, input: TaskReflection) {
  const date = new Date(input.date);
  if (input.reflection === null) {
    await prisma.dailyPlan.updateMany({ where: { userId, date }, data: { reflection: null } });
    return;
  }
  await prisma.$transaction(async (tx) => {
    const day = await findOrCreateDay(tx, userId, date);
    await tx.dailyPlan.update({
      where: { id: day.id },
      data: { reflection: input.reflection },
    });
  });
}
