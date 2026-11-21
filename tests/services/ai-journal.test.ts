import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/analytics/journal-insights/route";
import { ApiError } from "@/lib/api";
import { aiJournalConfig, reserveAiJournalRequest } from "@/server/services/ai-journal";
import { requireUser } from "@/server/auth";

const db = vi.hoisted(() => {
  const findTrades = vi.fn();
  const findExecutions = vi.fn();
  const findRisk = vi.fn();
  const client = { trade: { count: vi.fn(), findMany: findTrades },
    tradeExecution: { findMany: findExecutions }, riskSettings: { findUnique: findRisk } };
  return { ...client, findTrades, findExecutions, findRisk,
    $transaction: (callback: (tx: typeof client) => unknown) => callback(client) };
});
vi.mock("@/server/db", () => ({ prisma: db }));
vi.mock("@/server/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/server/services/ai-journal", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/services/ai-journal")>(),
  reserveAiJournalRequest: vi.fn(),
}));

function trade(pnl: string | null, overrides = {}) {
  return {
    id: "trade-private-id", accountId: "private-account-id", userId: "private-user-id", status: "CLOSED",
    direction: "LONG", lot: "1", entryPrice: "100", realizedPnl: pnl, initialRisk: null, actualR: null, exitPrice: null,
    initialStopLoss: "90", initialTakeProfit: null, session: null,
    entryAt: new Date("2026-01-01T10:00Z"), exitAt: new Date("2026-01-01T11:00Z"),
    account: { currency: "USD" }, strategy: null, journal: null,
    instrument: { id: "instrument-private-id", symbol: "PRIVATE-SYMBOL" },
    ...overrides,
  };
}

const summary = "Performa trade tertutup menunjukkan hasil positif dengan ruang untuk memperbaiki konsistensi.";
const finding = { text: "Tinjau kembali alasan entry dan exit.", evidenceIds: ["overview"] };
function providerResponse(overrides = {}) {
  return Response.json({ choices: [{ message: { content: JSON.stringify({
    summary, strengths: [], mistakes: [], actionPlan: [finding], ...overrides,
  }) } }] });
}

function request(headers?: HeadersInit) {
  return POST(new Request("https://journal.example/api/analytics/journal-insights", { method: "POST", headers }));
}

function captureProvider() {
  const provider = vi.fn<(url: URL, init: RequestInit) => Promise<Response>>(async () => providerResponse());
  vi.stubGlobal("fetch", provider);
  const sent = (index: number) => JSON.parse(String(provider.mock.calls[index]![1].body)).messages;
  return { provider, sent, payload: (index = 0) => JSON.parse(sent(index)[1].content) };
}

describe("AI journal report endpoint", () => {
  beforeEach(() => {
    vi.stubEnv("AI_BASE_URL", "https://provider.example/v1/");
    vi.stubEnv("AI_API_KEY", "private-test-key");
    vi.stubEnv("AI_MODEL", "test-model");
    vi.mocked(requireUser).mockResolvedValue({ id: "private-user-id", email: "private@example.test",
      name: "Private Name", timezone: "Asia/Jakarta", locale: "id" });
    db.trade.count.mockResolvedValue(3);
    db.findTrades.mockResolvedValue([trade("25"), trade("-5"), trade("0")]);
    db.findExecutions.mockResolvedValue([]);
    db.findRisk.mockResolvedValue(null);
    vi.mocked(reserveAiJournalRequest).mockResolvedValue(undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  it("sends the supplied prompt and exports fresh data for each analysis, including unchanged data", async () => {
    db.findTrades.mockResolvedValueOnce([trade("25"), trade("-5"), trade("0")])
      .mockResolvedValueOnce([trade("25"), trade("-5"), trade("0")])
      .mockResolvedValueOnce([trade("30"), trade("-5"), trade("0", { journal: { compliant: false, mistakes: [] } })]);
    const { provider, sent, payload } = captureProvider();
    for (const [i, total] of ["20", "20", "25"].entries()) {
      const response = await request();
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(payload(i).metrics.netPnlUsd).toBe(total);
      expect(payload(i).schemaVersion).toBe(1);
      expect((await response.json()).data).toMatchObject({ summary, metrics: { netPnlUsd: total } });
    }
    expect(payload(1).coverage.withJournal).toBe(0);
    expect(payload(2).coverage.withJournal).toBe(1);
    expect(sent(0)[0].content).toContain("Senior Quantitative Trading Analyst dan Trading Performance Coach");
    expect(sent(0)[0].content).toContain("Evaluasi & Rencana Perbaikan (Action Plan)");
    expect(provider).toHaveBeenCalledTimes(3);
    expect(db.findTrades).toHaveBeenCalledTimes(3);
    expect(provider).toHaveBeenCalledWith(new URL("https://provider.example/v1/chat/completions"),
      expect.objectContaining({ cache: "no-store", headers: expect.objectContaining({ Authorization: "Bearer private-test-key" }) }));
  });

  it("isolates the caller, normalizes USC and keeps private labels and notes out of the export", async () => {
    const allTrades = [
      trade("25", { initialStopLoss: null, actualR: "2", strategy: { id: "strategy-id-private", name: "Private strategy name" },
        journal: { compliant: false, mistakes: ["private mistake tag"], exitReason: "Private note" },
        entryAt: new Date("2026-01-01T20:00Z"), exitAt: new Date("2026-01-01T21:00Z") }),
      trade("-500", { account: { currency: "USC" }, actualR: "-1" }),
      trade("0"),
      trade("1000", { status: "PARTIAL" }), trade(null),
      trade("5000", { userId: "someone-else" }),
    ];
    db.findTrades.mockImplementation(async ({ where }) => allTrades.filter((row) =>
      row.userId === where.userId && row.status === where.status && row.realizedPnl !== where.realizedPnl.not));
    const { provider, sent, payload } = captureProvider();
    provider.mockImplementation(async () => providerResponse({
      strengths: [{ text: "Setup ini perlu ditinjau sebagai kandidat kekuatan.", evidenceIds: ["strategy-1"] }],
    }));
    const response = await request();
    expect(response.status).toBe(200);
    const report = (await response.json()).data;
    expect(report.metrics).toMatchObject({ closedTrades: 3, wins: 1, losses: 1, breakEven: 1,
      netPnlUsd: "20", profitFactor: 5, avgWinUsd: "25.0000", avgLossUsd: "5.0000",
      realizedRiskReward: 5, avgR: 0.5, winRate: 33.33, closedTradeDrawdownUsd: "5" });
    expect(report.coverage).toMatchObject({ withJournal: 1, withJournalDiscipline: 1, withRecordedStop: 2, withRecordedTarget: 0,
      withActualR: 2, withExitReason: 1 });
    expect(report.strengths[0].evidence[0]).toContain("Private strategy name · 1 trade · P/L $25,00");
    expect(payload().breakdowns.day.map(({ id }: { id: string }) => id)).toContain("day-2026-01-02");
    for (const excluded of ["private-user-id", "Private Name", "private@example.test", "Private note", "private mistake tag",
      "private-test-key", "strategy-id-private", "Private strategy name", "PRIVATE-SYMBOL", "instrument-private-id", "private-account-id"]) {
      expect(sent(0)[1].content).not.toContain(excluded);
    }
  });

  it("calculates timing and exit evidence without double-counting partial-close P&L", async () => {
    db.findTrades.mockResolvedValue([
      trade("-10", { id: "prior", initialRisk: "10", entryAt: new Date("2026-01-01T11:00Z") }),
      trade("25", { id: "next", lot: "2", initialRisk: "15", entryAt: new Date("2026-01-01T11:15Z"),
        exitAt: new Date("2026-01-01T11:45Z"), initialTakeProfit: "125", exitPrice: "120" }),
      trade("0", { id: "overlap", accountId: "another-account", initialRisk: "30", entryAt: new Date("2026-01-01T11:10Z") }),
    ]);
    db.findExecutions.mockResolvedValue([{ executedAt: new Date("2026-01-01T11:30Z"), price: "115", quantity: "1", realizedPnl: "9" }]);
    const { payload } = captureProvider();
    expect((await request()).status).toBe(200);
    expect(payload().metrics.netPnlUsd).toBe("15");
    expect(payload().evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "possible-revenge", kind: "indicator", trades: 1, netPnlWithoutTheseTradesUsd: "-10",
        examples: [expect.objectContaining({ details: expect.objectContaining({ minutesSinceClose: 15 }) })] }),
      expect.objectContaining({ id: "exit-below-target", examples: [expect.objectContaining({
        details: { priceGapToTarget: "5", exitReasonRecorded: false, entryPrice: "100", exitPrice: "120", targetPrice: "125" },
        partialCloses: [{ at: "2026-01-01T11:30:00.000Z", price: "115", lot: "1" }],
      })] }),
    ]));
    expect(db.findExecutions).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "private-user-id", tradeId: "next", kind: "PARTIAL_CLOSE" },
    }));
  });

  it("detects a frequency spike against five other local days in the same session", async () => {
    const baseline = Array.from({ length: 5 }, (_, i) => trade("10", { id: "base-" + i, session: "london",
      entryAt: new Date(Date.UTC(2026, 0, i + 1, 10)), exitAt: new Date(Date.UTC(2026, 0, i + 1, 11)) }));
    const lossDay = Array.from({ length: 3 }, (_, i) => trade("-5", { id: "spike-" + i, session: "london",
      entryAt: new Date(Date.UTC(2026, 0, 6, 10, i)), exitAt: new Date(Date.UTC(2026, 0, 6, 11, i)) }));
    db.findTrades.mockResolvedValue([...baseline, ...lossDay]);
    const { payload } = captureProvider();
    expect((await request()).status).toBe(200);
    expect(payload().evidence).toContainEqual(expect.objectContaining({
      id: "possible-overtrading", trades: 3, netPnlUsd: "-15", netPnlWithoutTheseTradesUsd: "50",
      examples: Array.from({ length: 3 }, () => expect.objectContaining({ details: expect.objectContaining({
        day: "2026-01-06", session: "London", baselineDays: 5, baselineMedianTrades: 1, baselineWinRate: 100, winRate: 0,
      }) })),
    }));
  });

  it("bounds examples and groups while keeping totals from all trades", async () => {
    db.findTrades.mockResolvedValue(Array.from({ length: 500 }, (_, i) => trade("1", {
      id: "bulk-" + i, initialStopLoss: null, instrument: { id: "instrument-" + i, symbol: "Q" + i },
      strategy: { id: "strategy-" + i, name: "private name " + i },
    })));
    const { sent, payload } = captureProvider();
    const response = await request();
    expect(response.status).toBe(200);
    expect(Buffer.byteLength(sent(0)[1].content)).toBeLessThanOrEqual(24 * 1024);
    expect(payload().metrics).toMatchObject({ closedTrades: 500, netPnlUsd: "500", profitFactor: null, avgLossUsd: null });
    expect(payload().coverage.breakdownGroupsOmitted).toBeGreaterThan(0);
    expect(payload().evidence.find(({ id }: { id: string }) => id === "missing-stop").examples).toHaveLength(3);
    expect(payload().coverage.examplesOmitted).toBeGreaterThan(0);
  });

  it("keeps origin, authentication, configuration, quota and minimum sample checks", async () => {
    const { provider } = captureProvider();
    expect((await request({ "sec-fetch-site": "cross-site" })).status).toBe(403);
    vi.mocked(requireUser).mockRejectedValueOnce(new ApiError(401, "Tidak terautentikasi"));
    expect((await request()).status).toBe(401);
    vi.stubEnv("AI_BASE_URL", "");
    expect((await request()).status).toBe(503);
    vi.stubEnv("AI_BASE_URL", "https://provider.example/v1/chat/completions/");
    expect(aiJournalConfig()?.url.href).toBe("https://provider.example/v1/chat/completions");
    db.trade.count.mockResolvedValueOnce(2);
    expect((await request()).status).toBe(422);
    expect(reserveAiJournalRequest).not.toHaveBeenCalled();
    vi.mocked(reserveAiJournalRequest).mockRejectedValueOnce(new ApiError(429, "Batas permintaan tercapai."));
    expect((await request()).status).toBe(429);
    vi.mocked(reserveAiJournalRequest).mockRejectedValueOnce(new Error("private quota details"));
    expect(await (await request()).text()).not.toContain("private quota details");
    expect(db.findTrades).not.toHaveBeenCalled();
    db.findTrades.mockResolvedValueOnce([trade("1"), trade("2")]);
    expect((await request()).status).toBe(422);
    expect(provider).not.toHaveBeenCalled();
  });

  it("rejects unknown references, malformed reports and oversized responses, and distinguishes provider failures", async () => {
    const { provider } = captureProvider();
    provider.mockImplementationOnce(async () => providerResponse({ actionPlan: [{ ...finding, evidenceIds: ["invented"] }] }))
      .mockImplementationOnce(async () => providerResponse({ actionPlan: [{ ...finding, evidenceIds: ["overview", "overview"] }] }))
      .mockResolvedValueOnce(new Response("<html>Invalid provider page</html>"))
      .mockResolvedValueOnce(Response.json({ metadata: " ".repeat(128 * 1024) }))
      .mockRejectedValueOnce(new DOMException("Private timeout detail", "TimeoutError"))
      .mockResolvedValueOnce(new Response("Private provider detail", { status: 401 }));
    for (const expected of [502, 502, 502, 502, 504, 502]) {
      const error = await request();
      expect(error.status).toBe(expected);
      expect(error.headers.get("cache-control")).toBe("private, no-store");
      expect(await error.text()).not.toContain("Private");
    }
    expect(console.warn).toHaveBeenCalledWith("[ai-journal]", { stage: "provider_response" });
    expect(console.warn).toHaveBeenCalledWith("[ai-journal]", { stage: "provider_timeout" });
    expect(console.warn).toHaveBeenCalledWith("[ai-journal]", { stage: "provider_http", status: 401 });
  });
});
