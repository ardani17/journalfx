import { expect, it } from "vitest";
import { formatTarget, parseSimulationNumber } from "@/app/(app)/simulator/simulator-input";
import { runSimulationSchema } from "@/lib/validation/planning";

it("formats and recovers Indonesian targets without interpreting blanks as zero", () => {
  expect(formatTarget(1_000_000)).toBe("1.000.000");
  expect(formatTarget(1_250.75)).toBe("1.250,75");
  expect(parseSimulationNumber("1.250,75", true)).toBe(1_250.75);
  expect(parseSimulationNumber("1.250", true)).toBe(1_250);
  expect(parseSimulationNumber("1.25", true)).toBe(1.25);
  expect(parseSimulationNumber("-0,5")).toBe(-0.5);
  expect(parseSimulationNumber("0")).toBe(0);
  expect(parseSimulationNumber("")).toBeUndefined();
  expect(parseSimulationNumber("1.2.3", true)).toBeUndefined();
});

it("validates required numeric inputs and preserves explicit zero costs and return", () => {
  const base = { initialCapital: 200, targetAmount: 1_000_000 };
  expect(runSimulationSchema.safeParse({ ...base, returnPerCycle: "" }).success).toBe(false);
  expect(runSimulationSchema.safeParse({ ...base, returnPerCycle: 0, costPerCycle: null }).success).toBe(false);
  expect(runSimulationSchema.parse({ ...base, returnPerCycle: 0, costPerCycle: 0 }))
    .toMatchObject({ returnPerCycle: 0, costPerCycle: 0 });
});
