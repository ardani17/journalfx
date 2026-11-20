import { frequencyDetails, type CompoundingFrequency, type WdModeSim } from "@/lib/finance/compounding";
import { fmtDecimal, fmtUSD, type Decimal } from "@/lib/money";

export interface ScenarioFactsData {
  initialCapital: Decimal.Value;
  targetAmount: Decimal.Value;
  returnPerCycle: Decimal.Value;
  frequency: CompoundingFrequency;
  wdMode: WdModeSim;
  fixedWdAmount?: Decimal.Value;
  wdRatio?: Decimal.Value;
  costPerCycle?: Decimal.Value;
}

export function ScenarioFacts({ scenario, estimate }: { scenario: ScenarioFactsData; estimate?: string }) {
  const wd = {
    NONE: "Tanpa WD",
    FIXED: `Nominal tetap · ${fmtUSD(scenario.fixedWdAmount)} / siklus`,
    DYNAMIC: `Dinamis · ${fmtDecimal(scenario.wdRatio ?? 0, 0)}% dari profit`,
  }[scenario.wdMode];
  const rows = [
    ["Modal Awal", fmtUSD(scenario.initialCapital)],
    ["Target Akhir", fmtUSD(scenario.targetAmount)],
    ["Return / Siklus", `${fmtDecimal(scenario.returnPerCycle, 0)}%`],
    ["Frekuensi", frequencyDetails[scenario.frequency].name],
    ["Mode Penarikan", wd],
    ["Biaya / Siklus", fmtUSD(scenario.costPerCycle)],
    ...(estimate === undefined ? [] : [["Estimasi Waktu", estimate]]),
  ];
  return (
    <dl className="space-y-2 text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3 border-b border-line-soft py-1.5">
          <dt className="text-faint">{label}</dt>
          <dd className="tnum break-words text-right font-semibold text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
