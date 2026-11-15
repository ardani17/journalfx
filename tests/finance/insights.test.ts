import { describe, expect, it } from "vitest";
import { journalInsights, type InsightTrade } from "@/lib/finance/insights";

function t(partial: Partial<InsightTrade>): InsightTrade {
  return {
    session: "london",
    timeframe: "M15",
    direction: "LONG",
    realizedPnl: 10,
    actualR: 1,
    initialStopLoss: 1,
    entryAt: "2026-01-01T00:00:00Z",
    emotionBefore: "calm",
    fomo: false,
    revenge: false,
    overtrading: false,
    mistakes: [],
    journalComplete: true,
    prevTradeLoss: false,
    ...partial,
  };
}

describe("journalInsights — explainable, evidence-backed", () => {
  it("flags sessions with big win-rate gaps", () => {
    const trades: InsightTrade[] = [
      ...Array.from({ length: 4 }, () => t({ session: "london", realizedPnl: 10 })),
      ...Array.from({ length: 4 }, () => t({ session: "asian", realizedPnl: -8 })),
    ];
    const r = journalInsights(trades);
    const s = r.insights.find((i) => i.id.startsWith("session-"));
    expect(s?.severity).toBe("positive"); // london 100% vs asian 0%
    expect(s?.evidence).toContain("4 trade");
  });

  it("fomo impact surfaces when both groups ≥3", () => {
    const trades: InsightTrade[] = [
      ...Array.from({ length: 3 }, () => t({ fomo: true, realizedPnl: -5 })),
      ...Array.from({ length: 3 }, () => t({ fomo: false, realizedPnl: 15 })),
    ];
    const r = journalInsights(trades);
    const f = r.insights.find((i) => i.id === "fomo-impact");
    expect(f?.severity).toBe("warning");
    expect(f?.title).toContain("−$5,00");
  });

  it("missing SL flagged", () => {
    const r = journalInsights([t({ initialStopLoss: null }), t({}), t({})]);
    expect(r.insights.some((i) => i.id === "missing-sl")).toBe(true);
  });

  it("revenge pattern needs prev loss + flag", () => {
    const r = journalInsights([t({ revenge: true, prevTradeLoss: true, realizedPnl: -10 }), t({}), t({})]);
    expect(r.insights.some((i) => i.id === "revenge-pattern")).toBe(true);
  });

  it("no insight fabricated from tiny/no data; coverage reported", () => {
    const r = journalInsights([t({})]);
    expect(r.insights.filter((i) => i.id !== "missing-sl").length).toBe(0);
    expect(r.dataCoverage).toEqual({ total: 1, withJournal: 1, complete: 1 });
  });
});
