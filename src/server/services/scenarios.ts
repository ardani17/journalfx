import type { CompoundingScenario } from "@prisma/client";
import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/server/audit";
import { getDefaultProject } from "./projects";
import { simulate, type SimulateInput, type SimulateResult } from "@/lib/finance/compounding";
import { D, Decimal } from "@/lib/money";
import { scenarioSchema } from "@/lib/validation/planning";

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

type ScenarioNumbers = "initialCapital" | "targetAmount" | "returnPerCycle" | "fixedWdAmount" | "wdRatio" | "costPerCycle";
type SimulationParameters = Omit<ScenarioInput, ScenarioNumbers | "name"> & {
  initialCapital: Decimal.Value;
  targetAmount: Decimal.Value;
  returnPerCycle: Decimal.Value;
  fixedWdAmount?: Decimal.Value;
  wdRatio?: Decimal.Value;
  costPerCycle?: Decimal.Value;
  name?: string;
};

export async function listScenarios(userId: string) {
  return prisma.compoundingScenario.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
}

export function getScenario(userId: string, id: string) {
  return prisma.compoundingScenario.findFirst({ where: { id, userId } });
}

export function savedScenarioParameters(scenario: CompoundingScenario) {
  return {
    initialCapital: scenario.initialCapital.toString(),
    targetAmount: scenario.targetAmount.toString(),
    returnPerCycle: scenario.returnPerCycle.toString(),
    frequency: scenario.frequency,
    wdMode: scenario.wdMode,
    fixedWdAmount: scenario.fixedWdAmount?.toString(),
    wdRatio: scenario.wdRatio?.toString(),
    costPerCycle: scenario.costPerCycle.toString(),
    deposits: scenarioSchema.shape.deposits.safeParse(scenario.deposits).data,
    stressReturns: scenarioSchema.shape.stressReturns.safeParse(scenario.stressReturns).data,
  };
}

function scenarioDecimals(input: SimulationParameters) {
  return {
    initialCapital: D(input.initialCapital).toDecimalPlaces(2),
    targetAmount: D(input.targetAmount).toDecimalPlaces(2),
    returnPerCycle: D(input.returnPerCycle).toDecimalPlaces(4),
    fixedWdAmount: input.fixedWdAmount === undefined ? null : D(input.fixedWdAmount).toDecimalPlaces(2),
    wdRatio: input.wdRatio === undefined ? null : D(input.wdRatio).toDecimalPlaces(4),
    costPerCycle: D(input.costPerCycle).toDecimalPlaces(2),
  };
}

function cycleSchedule(schedule?: Record<string, number>) {
  if (schedule) return Object.fromEntries(Object.entries(schedule).map(([cycle, value]) => [Number(cycle), value]));
}

export async function createScenario(userId: string, input: ScenarioInput, req?: Request) {
  const project = await getDefaultProject(userId);
  const s = await prisma.compoundingScenario.create({
    data: {
      userId,
      projectId: project.id,
      name: input.name,
      ...scenarioDecimals(input),
      frequency: input.frequency,
      wdMode: input.wdMode,
      deposits: input.deposits,
      stressReturns: input.stressReturns,
      notes: input.notes ?? null,
    },
  });
  await audit({ userId, action: "create", entity: "CompoundingScenario", entityId: s.id, after: input, req });
  return s;
}

/** Run any scenario-shaped input through the deterministic engine. */
export function runSimulation(
  input: SimulationParameters,
): {
  input: SimulateInput;
  result: SimulateResult;
} {
  const amounts = scenarioDecimals(input);
  const simInput: SimulateInput = {
    initialCapital: amounts.initialCapital,
    target: amounts.targetAmount,
    returnPerCyclePct: amounts.returnPerCycle,
    wdMode: input.wdMode,
    wdRatioPct: amounts.wdRatio ?? undefined,
    fixedWdAmount: amounts.fixedWdAmount ?? undefined,
    costPerCycle: amounts.costPerCycle,
    deposits: cycleSchedule(input.deposits),
    stressReturns: cycleSchedule(input.stressReturns),
    maxCycles: 2000,
  };
  return { input: simInput, result: simulate(simInput) };
}

export async function runSavedSimulation(userId: string, id: string) {
  const scenario = await getScenario(userId, id);
  if (!scenario) throw new ApiError(404, "Skenario tidak ditemukan");
  return runSimulation(savedScenarioParameters(scenario)).result;
}

export function simulationResponse(result: SimulateResult) {
  return {
    cyclesCount: result.cyclesCount,
    reached: result.reached,
    targetNotReached: result.targetNotReached,
    finalBalance: result.finalBalance.toString(),
    totalWd: result.totalWd.toString(),
    totalProfit: result.totalProfit.toString(),
    totalDeposits: result.totalDeposits.toString(),
    series: result.cycles.slice(0, 400).map((c) => ({
      cycle: c.cycle,
      opening: Number(c.opening.toFixed(2)),
      closing: Number(c.closing.toFixed(2)),
      wd: Number(c.wd.toFixed(2)),
    })),
    cycles: result.cycles,
    firstCycles: result.cycles.slice(0, 12),
    lastCycle: result.cycles.at(-1) ?? null,
  };
}
