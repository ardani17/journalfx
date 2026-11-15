import { describe, expect, it } from "vitest";
import {
  actualR,
  avgEntryPrice,
  closePnl,
  deriveStatus,
  initialRiskUsd,
  plannedRR,
  rollupExecutions,
  type ExecutionLike,
} from "@/lib/finance/trades";
import { D } from "@/lib/money";

// XAUUSD: contractSize 100 (1 lot = 100 oz)
const XAU = { contractSize: 100 };

describe("avgEntryPrice", () => {
  it("weights fills by quantity", () => {
    const p = avgEntryPrice([
      { kind: "ENTRY", quantity: 0.1, price: 2025.4 },
      { kind: "PARTIAL_ENTRY", quantity: 0.1, price: 2027.4 },
    ]);
    expect(p.toFixed(2)).toBe("2026.40");
  });
});

describe("closePnl", () => {
  it("LONG profits when exit > entry", () => {
    const pnl = closePnl(
      "LONG",
      D("2025.40"),
      { kind: "CLOSE", quantity: 0.1, price: "2041.10" },
      XAU,
    );
    // (2041.10 − 2025.40) × 100 × 0.10 = 157.00
    expect(pnl.toFixed(2)).toBe("157.00");
  });

  it("SHORT profits when exit < entry", () => {
    const pnl = closePnl(
      "SHORT",
      D("2041.10"),
      { kind: "CLOSE", quantity: 0.1, price: "2035.10" },
      XAU,
    );
    // (2041.10 − 2035.10) × 100 × 0.10 = 60.00
    expect(pnl.toFixed(2)).toBe("60.00");
  });

  it("subtracts commission, swap, fees", () => {
    const pnl = closePnl(
      "LONG",
      D("2000"),
      { kind: "CLOSE", quantity: 1, price: "2010", commission: 2, swap: 1, fees: 0.5 },
      XAU,
    );
    // 10 × 100 × 1 − 3.5 = 996.50
    expect(pnl.toFixed(2)).toBe("996.50");
  });
});

describe("rollupExecutions — partial closes (PRD acceptance)", () => {
  it("recognizes only the closed portion, leaves the rest open", () => {
    const ex: ExecutionLike[] = [
      { kind: "ENTRY", quantity: 0.2, price: 2020 },
      { kind: "PARTIAL_CLOSE", quantity: 0.1, price: 2030 }, // +0.1×100×10 = 100
    ];
    const r = rollupExecutions("LONG", ex, XAU);
    expect(r.realizedPnl.toFixed(2)).toBe("100.00");
    expect(r.openQty.toFixed(2)).toBe("0.10");
    expect(r.isFullyClosed).toBe(false);
  });

  it("aggregates multiple partial closes with weighted entry", () => {
    const ex: ExecutionLike[] = [
      { kind: "ENTRY", quantity: 0.1, price: 2000 },
      { kind: "PARTIAL_ENTRY", quantity: 0.1, price: 2010 }, // avg 2005
      { kind: "PARTIAL_CLOSE", quantity: 0.1, price: 2015 }, // +100
      { kind: "CLOSE", quantity: 0.1, price: 2025, commission: 1 }, // +200−1
    ];
    const r = rollupExecutions("LONG", ex, XAU);
    expect(r.avgEntry.toFixed(2)).toBe("2005.00");
    expect(r.realizedPnl.toFixed(2)).toBe("299.00");
    expect(r.isFullyClosed).toBe(true);
    expect(r.openQty.toFixed(2)).toBe("0.00");
  });

  it("losing SHORT partial close is negative", () => {
    const ex: ExecutionLike[] = [
      { kind: "ENTRY", quantity: 0.05, price: 2050 },
      { kind: "PARTIAL_CLOSE", quantity: 0.05, price: 2062, commission: 0.2 },
    ];
    const r = rollupExecutions("SHORT", ex, XAU);
    // −(2062−2050)×100×0.05 − 0.2 = −60.20
    expect(r.realizedPnl.toFixed(2)).toBe("-60.20");
  });
});

describe("risk helpers", () => {
  it("initialRiskUsd from entry/SL", () => {
    const risk = initialRiskUsd("LONG", D("2020"), D("2015"), XAU, D("0.2"));
    expect(risk?.toFixed(2)).toBe("100.00"); // 5 × 100 × 0.2
  });

  it("plannedRR 1:2", () => {
    const rr = plannedRR("LONG", D("2020"), D("2015"), D("2030"), XAU, D("0.2"));
    expect(rr?.toFixed(1)).toBe("2.0");
  });

  it("actualR divides realized by initial risk", () => {
    expect(actualR(D("200"), D("100"))?.toFixed(1)).toBe("2.0");
    expect(actualR(D("200"), null)).toBeNull();
    expect(actualR(D("200"), D(0))).toBeNull();
  });
});

describe("deriveStatus", () => {
  it("walks the state machine", () => {
    expect(deriveStatus(false, D(0), D(0))).toBe("PLANNED");
    expect(deriveStatus(false, D("0.1"), D(0))).toBe("OPEN");
    expect(deriveStatus(false, D("0.2"), D("0.1"))).toBe("PARTIAL");
    expect(deriveStatus(false, D("0.1"), D("0.1"))).toBe("CLOSED");
    expect(deriveStatus(true, D("0.1"), D(0))).toBe("CANCELLED");
  });
});
