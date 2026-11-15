import { requireUser } from "@/server/auth";
import { getRoadmap } from "@/server/services/scenarios";
import { computeBalance } from "@/server/services/ledger";
import { simulate } from "@/lib/finance/compounding";
import { describeDuration } from "@/lib/finance/compounding";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { fmtUSD, fmtUSD0, fmtNum } from "@/lib/money";
import { fmtDateID } from "@/lib/dates";
import { CheckCircle2, Circle, Flag } from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata = { title: "Target Project" };

export default async function RoadmapPage() {
  const user = await requireUser();
  const [roadmap, balances] = await Promise.all([
    getRoadmap(user.id),
    computeBalance(user.id),
  ]);
  const balance = balances.balance;
  const target = roadmap.project.targetAmount;
  const progressPct = target.isZero() ? 0 : Number(balance.div(target).times(100).toFixed(4));

  // reference projection at 5%/week (illustrative)
  const sim = simulate({
    initialCapital: roadmap.project.initialCapital,
    target: target,
    returnPerCyclePct: 5,
    wdMode: "NONE",
    maxCycles: 2000,
  });
  const duration = describeDuration(sim.cyclesCount, "WEEKLY");

  const achieved = roadmap.milestones.filter((m) => m.achievedAt);
  const next = roadmap.milestones.find((m) => !m.achievedAt) ?? null;

  // group into phases for the horizontal timeline
  const phaseDefs = [
    { label: "Fase 1", from: 200, to: 1_000 },
    { label: "Fase 2", from: 1_000, to: 10_000 },
    { label: "Fase 3", from: 10_000, to: 100_000 },
    { label: "Fase 4", from: 100_000, to: 1_000_000 },
  ];
  const phases = phaseDefs.map((p) => {
    const relevant = roadmap.milestones.filter((m) => Number(m.amount) >= p.from && Number(m.amount) <= p.to);
    const done = relevant.length > 0 && relevant.every((m) => m.achievedAt);
    const weeks = Math.log(p.to / p.from) / Math.log(1.05);
    return { ...p, done, weeks: Math.round(weeks) };
  });

  return (
    <PageShell>
      <PageHeader
        title="Target Project"
        subtitle="Gambaran keseluruhan rencana, target, dan timeline project"
        actions={<Badge tone={progressPct > 0 ? "success" : "neutral"}>{fmtNum(progressPct, progressPct < 1 ? 2 : 1)}% tercapai</Badge>}
      />

      {/* Horizontal phase timeline */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {phases.map((p, i) => (
              <div key={p.label} className="relative">
                {i < phases.length - 1 ? (
                  <span className="absolute left-[calc(50%+28px)] top-4 hidden h-px w-[calc(100%-56px)] bg-line lg:block" aria-hidden />
                ) : null}
                <div className="flex flex-col items-center gap-1.5 text-center">
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border-2",
                      p.done ? "border-primary bg-primary/20" : "border-line bg-panel-2",
                    )}
                  >
                    {p.done ? <CheckCircle2 className="h-4.5 w-4.5 text-primary" aria-hidden /> : <Circle className="h-4 w-4 text-faint" aria-hidden />}
                  </span>
                  <p className="text-xs font-bold">{p.label}</p>
                  <p className="tnum text-[11px] text-muted">{fmtUSD0(p.from)} → {fmtUSD0(p.to)}</p>
                  <p className="tnum text-[10px] text-faint">± {p.weeks} minggu @5%</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-[68fr_32fr]">
        {/* Milestone table */}
        <Card>
          <CardHeader><CardTitle>Milestone Roadmap</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-panel-2/60 text-[11px] uppercase tracking-wide text-faint">
                <tr>
                  <th className="px-3 py-2 font-medium">Milestone</th>
                  <th className="px-3 py-2 text-right font-medium">Target</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Tercapai</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {roadmap.milestones.map((m) => {
                  const hit = balance.gte(m.amount);
                  return (
                    <tr key={m.id} className={cn("hover:bg-panel-2/40", m.achievedAt && "bg-primary/5")}>
                      <td className="px-3 py-2 text-xs font-medium">#{m.order}</td>
                      <td className="tnum px-3 py-2 text-right text-xs font-semibold">{fmtUSD0(m.amount)}</td>
                      <td className="px-3 py-2">
                        {m.achievedAt ? (
                          <Badge tone="success"><CheckCircle2 className="h-3 w-3" /> Tercapai</Badge>
                        ) : hit ? (
                          <Badge tone="warn">Balance sudah melampaui</Badge>
                        ) : (
                          <Badge tone="neutral">Berikutnya</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted">
                        {m.achievedAt ? fmtDateID(m.achievedAt, "d MMM yyyy") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Summary + progress ring */}
        <div className="flex flex-col gap-3">
          <Card className="panel-gradient">
            <CardHeader><CardTitle>Estimasi Project (Compounding 5%/minggu)</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs">
              <Row label="Modal Awal" value={fmtUSD(roadmap.project.initialCapital)} />
              <Row label="Target Akhir" value={fmtUSD0(target)} />
              <Row label="Target Return" value="5,00% / minggu" />
              <Row label="Estimasi Waktu" value={sim.reached ? duration.label : "—"} />
              <p className="pt-1 text-[10px] leading-relaxed text-faint">
                Estimasi bersifat ilustratif (asumsi 5%/minggu tanpa WD). Milestone ditandai tercapai
                hanya ketika balance aktual dari ledger melewati jumlah tersebut.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <ProgressRing pct={Math.min(progressPct, 100)} />
              <div className="min-w-0">
                <p className="text-xs text-muted">Progress Aktual</p>
                <p className="tnum text-lg font-bold text-primary">{fmtNum(progressPct, progressPct < 1 ? 2 : 1)}%</p>
                <p className="tnum text-[11px] text-faint">{fmtUSD(balance)} / {fmtUSD0(target)}</p>
                {next ? (
                  <p className="mt-1 text-[11px] text-muted">
                    Berikutnya: <Flag className="inline h-3 w-3" aria-hidden /> {fmtUSD0(next.amount)}
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-primary">Semua milestone tercapai 🎉</p>
                )}
                {achieved.length > 0 ? (
                  <p className="mt-1 text-[10px] text-faint">{achieved.length} milestone tercapai (riwayat tersimpan)</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line-soft py-1.5">
      <span className="text-faint">{label}</span>
      <span className="tnum font-semibold text-ink">{value}</span>
    </div>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const off = c - (Math.min(pct, 100) / 100) * c;
  return (
    <svg width="110" height="110" viewBox="0 0 110 110" role="img" aria-label={`Progress ${pct.toFixed(2)} persen`}>
      <circle cx="55" cy="55" r={r} fill="none" stroke="#19223" strokeWidth="10" />
      <circle cx="55" cy="55" r={r} fill="none" stroke="#131b2e" strokeWidth="10" />
      <circle cx="55" cy="55" r={r} fill="none" stroke="#303b50" strokeWidth="10" />
      <circle
        cx="55" cy="55" r={r} fill="none" stroke="#22e69a" strokeWidth="10"
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
        transform="rotate(-90 55 55)"
      />
      <text x="55" y="52" textAnchor="middle" fill="#f8fafc" fontSize="15" fontWeight="700" className="tnum">
        {pct < 1 ? pct.toFixed(2) : pct.toFixed(1)}%
      </text>
      <text x="55" y="68" textAnchor="middle" fill="#6b7a93" fontSize="9">Progress</text>
    </svg>
  );
}
