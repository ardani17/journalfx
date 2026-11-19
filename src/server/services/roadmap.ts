import type { CompoundingScenario, Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { ledgerMilestones, projectedMilestones, roadmapAmounts } from "@/lib/finance/roadmap";
import { D, type Decimal } from "@/lib/money";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { getDefaultProject } from "./projects";
import { getScenario, runSimulation, savedScenarioParameters } from "./scenarios";
import { ROADMAP_AMOUNTS } from "./users";

type RoadmapProject = Pick<Awaited<ReturnType<typeof getDefaultProject>>, "id" | "initialCapital" | "targetAmount" | "milestones" | "activeScenarioId">;
type RoadmapReader = Pick<Prisma.TransactionClient, "compoundingScenario" | "accountTransaction" | "roadmapMilestoneAchievement">;

function projectScenario(db: RoadmapReader, userId: string, projectId: string, id: string | null) {
  return id ? db.compoundingScenario.findFirst({ where: { id, userId, projectId } }) : null;
}

function roadmapPlan(project: RoadmapProject, scenario: CompoundingScenario | null) {
  const parameters = scenario ? savedScenarioParameters(scenario) : {
    initialCapital: project.initialCapital.toString(),
    targetAmount: project.targetAmount.toString(),
    returnPerCycle: 5,
    frequency: "WEEKLY" as const,
    wdMode: "NONE" as const,
    costPerCycle: 0,
  };
  const target = D(parameters.targetAmount);
  const initial = D(parameters.initialCapital);
  const milestones = scenario
    ? roadmapAmounts(target, ROADMAP_AMOUNTS, initial)
    : roadmapAmounts(target, project.milestones.map((milestone) => milestone.amount.toString()));
  return { parameters, target, initial, milestones };
}

async function projectProgress(db: RoadmapReader, userId: string, projectId: string, amounts: Decimal[]) {
  const [entries, history] = await Promise.all([
    db.accountTransaction.findMany({
      where: { userId, account: { projectId, userId }, occurredAt: { lte: new Date() } },
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { amount: true, occurredAt: true },
    }),
    db.roadmapMilestoneAchievement.findMany({
      where: { projectId },
      select: { amount: true, achievedAt: true },
    }),
  ]);
  const achieved = new Map(history.map((hit) => [hit.amount.toString(), hit.achievedAt]));
  const pending = amounts.filter((amount) => !achieved.has(amount.toString()));
  const { balance, hits } = ledgerMilestones(pending, entries);
  if (hits.length > 0) {
    await db.roadmapMilestoneAchievement.createMany({
      data: hits.map((hit) => ({ ...hit, projectId })),
      skipDuplicates: true,
    });
    for (const hit of hits) achieved.set(hit.amount.toString(), hit.achievedAt);
  }
  return { balance, achieved };
}

async function lockRoadmap(tx: Prisma.TransactionClient, projectId: string) {
  const key = `roadmap:${projectId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

export async function setActiveScenario(userId: string, scenarioId: string | null) {
  const { id: projectId } = await getDefaultProject(userId);
  return prisma.$transaction(async (tx) => {
    await lockRoadmap(tx, projectId);
    const project = await tx.project.findFirst({
      where: { id: projectId, userId, isDefault: true, isActive: true },
      include: { milestones: true },
    });
    if (!project) throw new ApiError(404, "Project tidak ditemukan");
    const scenario = await projectScenario(tx, userId, projectId, scenarioId);
    if (scenarioId && !scenario) throw new ApiError(404, "Skenario tidak ditemukan");
    if (project.activeScenarioId !== scenarioId) {
      const outgoing = await projectScenario(tx, userId, projectId, project.activeScenarioId);
      await projectProgress(tx, userId, projectId, roadmapPlan(project, outgoing).milestones);
      await tx.project.update({ where: { id: projectId }, data: { activeScenarioId: scenarioId } });
    }
    return { activeScenarioId: scenarioId };
  });
}

export async function deleteScenario(userId: string, id: string, req?: Request) {
  const scenario = await getScenario(userId, id);
  if (!scenario) throw new ApiError(404, "Skenario tidak ditemukan");
  await prisma.$transaction(async (tx) => {
    await lockRoadmap(tx, scenario.projectId);
    const project = await tx.project.findFirst({
      where: { id: scenario.projectId, userId, activeScenarioId: id },
      include: { milestones: true },
    });
    if (project) await projectProgress(tx, userId, project.id, roadmapPlan(project, scenario).milestones);
    const deleted = await tx.compoundingScenario.deleteMany({ where: { id, userId } });
    if (deleted.count === 0) throw new ApiError(404, "Skenario tidak ditemukan");
  });
  await audit({ userId, action: "delete", entity: "CompoundingScenario", entityId: id, req });
}

export async function getRoadmap(userId: string) {
  const project = await getDefaultProject(userId);
  const [scenario, options] = await Promise.all([
    projectScenario(prisma, userId, project.id, project.activeScenarioId),
    prisma.compoundingScenario.findMany({
      where: { userId, projectId: project.id },
      select: { id: true, name: true },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    }),
  ]);
  const plan = roadmapPlan(project, scenario);
  const { balance, achieved } = await projectProgress(prisma, userId, project.id, plan.milestones);
  for (const milestone of project.milestones) {
    const key = milestone.amount.toString();
    if (milestone.achievedAt && !achieved.has(key)) achieved.set(key, milestone.achievedAt);
  }
  const { result } = runSimulation(plan.parameters);
  const milestones = projectedMilestones(plan.milestones, plan.initial, result)
    .map((milestone) => ({ ...milestone, achievedAt: achieved.get(milestone.amount.toString()) ?? null }));
  return {
    scenario: scenario && { id: scenario.id, name: scenario.name },
    options,
    parameters: plan.parameters,
    target: plan.target,
    initial: plan.initial,
    projection: { reached: result.reached, cyclesCount: result.cyclesCount },
    balance,
    milestones,
    history: [...achieved].map(([amount, achievedAt]) => ({ amount: D(amount), achievedAt }))
      .sort((left, right) => right.achievedAt.getTime() - left.achievedAt.getTime() || left.amount.cmp(right.amount)),
  };
}
