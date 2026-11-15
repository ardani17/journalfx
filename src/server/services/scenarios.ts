import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/server/audit";
import { getDefaultProject } from "./projects";
import { simulate, type SimulateInput, type SimulateResult } from "@/lib/finance/compounding";
import { D, Decimal } from "@/lib/money";

export interface ScenarioInput {
  name: string;
  initialCapital: number;
  targetAmount: number;
  returnPerCycle: number;
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  wdMode: "NONE" | "FIXED" | "DYNAMIC";
  fixedWdAmount?: number;
  wdRatio?: number;
  costPerCycle?: number;
  deposits?: Record<string, number>;
  stressReturns?: Record<string, number>;
  notes?: string;
}

export async function listScenarios(userId: string) {
  return prisma.compoundingScenario.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createScenario(userId: string, input: ScenarioInput, req?: Request) {
  const project = await getDefaultProject(userId);
  const s = await prisma.compoundingScenario.create({
    data: {
      userId,
      projectId: project.id,
      name: input.name,
      initialCapital: new Decimal(input.initialCapital),
      targetAmount: new Decimal(input.targetAmount),
      returnPerCycle: new Decimal(input.returnPerCycle),
      frequency: input.frequency,
      wdMode: input.wdMode,
      fixedWdAmount: input.fixedWdAmount !== undefined ? new Decimal(input.fixedWdAmount) : null,
      wdRatio: input.wdRatio !== undefined ? new Decimal(input.wdRatio) : null,
      costPerCycle: new Decimal(input.costPerCycle ?? 0),
      deposits: (input.deposits ?? undefined) as object | undefined,
      stressReturns: (input.stressReturns ?? undefined) as object | undefined,
      notes: input.notes ?? null,
    },
  });
  await audit({ userId, action: "create", entity: "CompoundingScenario", entityId: s.id, after: input, req });
  return s;
}

export async function deleteScenario(userId: string, id: string, req?: Request) {
  const s = await prisma.compoundingScenario.findFirst({ where: { id, userId } });
  if (!s) throw new ApiError(404, "Skenario tidak ditemukan");
  await prisma.compoundingScenario.delete({ where: { id } });
  await audit({ userId, action: "delete", entity: "CompoundingScenario", entityId: id, req });
}

/** Run any scenario-shaped input through the deterministic engine. */
export function runSimulation(
  input: Omit<ScenarioInput, "name"> & { name?: string },
): {
  input: SimulateInput;
  result: SimulateResult;
} {
  const sc = input;
  const simInput: SimulateInput = {
    initialCapital: sc.initialCapital,
    target: sc.targetAmount,
    returnPerCyclePct: sc.returnPerCycle,
    wdMode: sc.wdMode,
    ...(sc.wdRatio !== undefined ? { wdRatioPct: sc.wdRatio } : {}),
    ...(sc.fixedWdAmount !== undefined ? { fixedWdAmount: sc.fixedWdAmount } : {}),
    costPerCycle: sc.costPerCycle ?? 0,
    ...(sc.deposits
      ? { deposits: Object.fromEntries(Object.entries(sc.deposits).map(([k, v]) => [Number(k), v])) }
      : {}),
    ...(sc.stressReturns
      ? {
          stressReturns: Object.fromEntries(
            Object.entries(sc.stressReturns).map(([k, v]) => [Number(k), v]),
          ),
        }
      : {}),
    maxCycles: 2000,
  };
  return { input: simInput, result: simulate(simInput) };
}

export async function getRoadmap(userId: string) {
  const project = await getDefaultProject(userId);
  return {
    project: {
      name: project.name,
      initialCapital: D(project.initialCapital),
      targetAmount: D(project.targetAmount),
    },
    milestones: project.milestones.map((m) => ({
      id: m.id,
      order: m.order,
      amount: D(m.amount),
      label: m.label,
      achievedAt: m.achievedAt,
      balanceAtHit: m.balanceAtHit ? D(m.balanceAtHit) : null,
    })),
  };
}
