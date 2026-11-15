import { CreditCard, PiggyBank, Target, Wallet } from "lucide-react";
import { fmtIDR, fmtUSD, fmtUSD0 } from "@/lib/money";
import type { Decimal } from "@/lib/money";

export interface PlanCardsData {
  nextMilestone: { amount: Decimal } | null;
  wdRecommended: Decimal | null;
  monthlyNeedsIdr: Decimal | null;
  debtRemainingIdr: Decimal | null;
  debtPaidPct: number | null;
}

/** Bottom "Rencana & Target" section — four gradient cards per mockup. */
export function PlanCards({ data }: { data: PlanCardsData }) {
  return (
    <section aria-labelledby="rencana-target" className="flex flex-col gap-3">
      <h2 id="rencana-target" className="text-sm font-semibold text-ink">
        Rencana &amp; Target
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="plan-green rounded-[14px] border border-primary/20 p-4">
          <div className="flex items-center gap-2 text-primary">
            <Target className="h-4 w-4" aria-hidden />
            <span className="text-xs font-medium">Target Balance Berikutnya</span>
          </div>
          <p className="tnum mt-2 text-xl font-bold text-white">
            {data.nextMilestone ? fmtUSD(data.nextMilestone.amount) : "—"}
          </p>
          <p className="mt-1 text-[11px] text-primary/80">
            {data.nextMilestone ? `Milestone ${fmtUSD0(data.nextMilestone.amount)}` : "Belum ada milestone"}
          </p>
        </div>

        <div className="plan-purple rounded-[14px] border border-indigo-soft/25 p-4">
          <div className="flex items-center gap-2 text-indigo-soft">
            <Wallet className="h-4 w-4" aria-hidden />
            <span className="text-xs font-medium">Rencana WD Minggu Ini</span>
          </div>
          <p className="tnum mt-2 text-xl font-bold text-white">
            {data.wdRecommended !== null ? fmtUSD(data.wdRecommended) : "—"}
          </p>
          <p className="mt-1 text-[11px] text-indigo-soft/80">
            {data.wdRecommended !== null ? "Rekomendasi profit-only" : "Mesin WD aktif di v0.4.0"}
          </p>
        </div>

        <div className="plan-blue rounded-[14px] border border-info/25 p-4">
          <div className="flex items-center gap-2 text-info">
            <PiggyBank className="h-4 w-4" aria-hidden />
            <span className="text-xs font-medium">Kebutuhan Bulanan</span>
          </div>
          <p className="tnum mt-2 text-xl font-bold text-white">
            {data.monthlyNeedsIdr !== null ? fmtIDR(data.monthlyNeedsIdr) : "—"}
          </p>
          <p className="mt-1 text-[11px] text-info/80">
            {data.monthlyNeedsIdr !== null ? "≈ " + fmtIDR(data.monthlyNeedsIdr.div(4)) + " / minggu" : "Atur di menu Keuangan Pribadi"}
          </p>
        </div>

        <div className="plan-rose rounded-[14px] border border-loss/25 p-4">
          <div className="flex items-center gap-2 text-loss">
            <CreditCard className="h-4 w-4" aria-hidden />
            <span className="text-xs font-medium">Sisa Hutang</span>
          </div>
          <p className="tnum mt-2 text-xl font-bold text-white">
            {data.debtRemainingIdr !== null ? fmtIDR(data.debtRemainingIdr) : "—"}
          </p>
          <p className="mt-1 text-[11px] text-loss/80">
            {data.debtPaidPct !== null ? `${data.debtPaidPct.toFixed(1)}% lunas` : "Catat hutang di menu Hutang"}
          </p>
        </div>
      </div>
    </section>
  );
}
