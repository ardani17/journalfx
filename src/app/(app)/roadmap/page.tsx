import { requireUser } from "@/server/auth";
import { getRoadmap } from "@/server/services/roadmap";
import { describeProjection, frequencyDetails } from "@/lib/finance/compounding";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { ScenarioFacts } from "@/components/planning/scenario-facts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtUSD, fmtNum } from "@/lib/money";
import { DEFAULT_TZ, isValidTimezone } from "@/lib/dates";
import { CheckCircle2, Circle, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { ActiveScenarioForm } from "./active-scenario-form";

export const metadata = { title: "Target Project" };

export default async function RoadmapPage() {
  const user = await requireUser();
  const roadmap = await getRoadmap(user.id);
  const { balance, initial, target, parameters, milestones } = roadmap;
  const progressPct = target.gt(0) ? balance.div(target).times(100).toNumber() : 0;
  const progressLabel = fmtNum(progressPct, Math.abs(progressPct) < 1 ? 2 : 1);
  const next = milestones.find((milestone) => !milestone.achievedAt);
  const unit = frequencyDetails[parameters.frequency].unit;
  const achievementDate = new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "short", year: "numeric",
    timeZone: isValidTimezone(user.timezone) ? user.timezone : DEFAULT_TZ,
  });
  const phases = milestones.filter(({ amount }) =>
    amount.gt(initial) && (amount.eq(target) || [1_000, 10_000, 100_000].some((phaseEnd) => amount.eq(phaseEnd))),
  );

  return (
    <PageShell>
      <PageHeader
        title="Target Project"
        subtitle="Gambaran keseluruhan rencana, target, dan timeline project"
        actions={<Badge tone={progressPct > 0 ? "success" : "neutral"}>{progressLabel}% tercapai</Badge>}
      />

      <ActiveScenarioForm
        key={roadmap.scenario?.id ?? "default"}
        active={roadmap.scenario}
        options={roadmap.options}
      />

      {phases.length > 0 && (
        <Card>
          <CardContent className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
            {phases.map((phase, i) => (
              <div key={phase.amount.toString()} className="relative">
                {i < phases.length - 1 && (
                  <span className="absolute left-[calc(50%+28px)] top-4 hidden h-px w-[calc(100%-56px)] bg-line lg:block" aria-hidden />
                )}
                <div className="flex flex-col items-center gap-1.5 text-center">
                  <span className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border-2",
                    phase.achievedAt ? "border-primary bg-primary/20" : "border-line bg-panel-2",
                  )}>
                    {phase.achievedAt ? <CheckCircle2 className="h-4.5 w-4.5 text-primary" aria-hidden /> : <Circle className="h-4 w-4 text-faint" aria-hidden />}
                  </span>
                  <p className="text-xs font-bold">Fase {i + 1}</p>
                  <p className="tnum text-[11px] text-muted">{fmtUSD(phases[i - 1]?.amount ?? initial)} → {fmtUSD(phase.amount)}</p>
                  <p className="tnum text-[10px] text-faint">{milestoneEstimate(phase.cycle, unit)}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <Card>
            <CardHeader><CardTitle>Milestone Roadmap</CardTitle></CardHeader>
            <CardContent className="p-0">
              <TableWrap>
                <Table aria-label="Milestone Roadmap">
                  <THead>
                    <TR><TH>Milestone</TH><TH className="text-right">Target</TH><TH>Estimasi dari awal</TH><TH>Status Aktual</TH><TH>Tercapai</TH></TR>
                  </THead>
                  <TBody>
                    {milestones.map((milestone, i) => (
                      <TR key={milestone.amount.toString()} className={cn(milestone.achievedAt && "bg-primary/5")}>
                        <TD className="text-xs font-medium">#{i + 1}</TD>
                        <TD className="tnum text-right text-xs font-semibold">{fmtUSD(milestone.amount)}</TD>
                        <TD className="text-xs text-muted">{milestoneEstimate(milestone.cycle, unit)}</TD>
                        <TD className="text-xs">
                          {milestone.achievedAt ? (
                            <Badge tone="success"><CheckCircle2 className="h-3 w-3" aria-hidden /> Tercapai</Badge>
                          ) : <Badge tone="neutral">Belum tercapai</Badge>}
                        </TD>
                        <TD className="text-xs text-muted">{milestone.achievedAt ? achievementDate.format(milestone.achievedAt) : "—"}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            </CardContent>
          </Card>
          {roadmap.history.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Riwayat Milestone</CardTitle></CardHeader>
              <CardContent className="p-0">
                <TableWrap>
                  <Table aria-label="Riwayat Milestone">
                    <THead><TR><TH>Target tercapai</TH><TH className="text-right">Tanggal</TH></TR></THead>
                    <TBody>
                      {roadmap.history.map(({ amount, achievedAt }) => (
                        <TR key={amount.toString()}>
                          <TD className="tnum text-xs font-semibold">{fmtUSD(amount)}</TD>
                          <TD className="text-right text-xs text-muted">{achievementDate.format(achievedAt)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Card className="panel-gradient">
            <CardHeader><CardTitle>Estimasi Project</CardTitle></CardHeader>
            <CardContent>
              <ScenarioFacts scenario={parameters} estimate={describeProjection(roadmap.projection, parameters.frequency)} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-wrap items-center gap-4 p-4">
              <ProgressRing pct={progressPct} label={progressLabel} />
              <div className="min-w-0">
                <p className="text-xs text-muted">Progress Aktual</p>
                <p className="tnum text-lg font-bold text-primary">{progressLabel}%</p>
                <p className="tnum text-[11px] text-faint">{fmtUSD(balance)} / {fmtUSD(target)}</p>
                {next ? (
                  <p className="mt-1 text-[11px] text-muted">
                    Berikutnya <Flag className="inline h-3 w-3" aria-hidden /> {fmtUSD(next.amount)}
                  </p>
                ) : <p className="mt-1 text-[11px] text-primary">Semua milestone tercapai</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}

function milestoneEstimate(cycle: number | null, unit: string) {
  if (cycle === null) return "Belum tercapai di simulasi";
  if (cycle === 0) return "Sejak awal";
  return `${fmtNum(cycle, 0)} ${unit}`;
}

function ProgressRing({ pct, label }: { pct: number; label: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(pct, 100)) / 100) * c;
  return (
    <svg width="110" height="110" viewBox="0 0 110 110" role="img" aria-label={`Progress ${label} persen`}>
      <circle cx="55" cy="55" r={r} fill="none" stroke="#303b50" strokeWidth="10" />
      <circle
        cx="55" cy="55" r={r} fill="none" stroke="#22e69a" strokeWidth="10"
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
        transform="rotate(-90 55 55)"
      />
      <text x="55" y="52" textAnchor="middle" fill="#f8fafc" fontSize="15" fontWeight="700" className="tnum">
        {label}%
      </text>
      <text x="55" y="68" textAnchor="middle" fill="#6b7a93" fontSize="9">Progress</text>
    </svg>
  );
}
