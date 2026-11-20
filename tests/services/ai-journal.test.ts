import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/analytics/journal-insights/route";
import { ApiError } from "@/lib/api";
import { aiJournalConfig, reserveAiJournalRequest } from "@/server/services/ai-journal";
import { requireUser } from "@/server/auth";

const { countTrades, findTrades } = vi.hoisted(() => ({ countTrades: vi.fn(), findTrades: vi.fn() }));
vi.mock("@/server/db", () => ({ prisma: { trade: { count: countTrades, findMany: findTrades } } }));
vi.mock("@/server/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/server/services/ai-journal", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/services/ai-journal")>(),
  reserveAiJournalRequest: vi.fn(),
}));

function trade(pnl: string | null, overrides = {}) {
  return {
    userId: "caller",
    status: "CLOSED",
    realizedPnl: pnl,
    actualR: null,
    initialStopLoss: "1",
    session: null,
    account: { currency: "USD" },
    strategy: null,
    instrument: { id: "instrument-one", symbol: "PRIVATE-SYMBOL" },
    journal: null,
    ...overrides,
  };
}

const gains = Array.from({ length: 3 }, () => trade("25", {
  session: "london",
  strategy: { id: "private-strategy-id", name: "Private strategy name" },
  journal: { compliant: true, fomo: false, emotionBefore: "calm", entryReason: "Private note" },
}));
const losses = Array.from({ length: 3 }, () => trade("-500", {
  session: "newyork",
  account: { currency: "USC" },
  strategy: { id: "strategy-two", name: "Private second strategy" },
  instrument: { id: "instrument-two", symbol: "OTHER-PRIVATE-SYMBOL" },
  journal: { compliant: false, fomo: true, emotionBefore: null },
}));

function providerResponse(...findings: { evidenceId: string; actionId: string }[]) {
  return Response.json({ choices: [{ message: { content: JSON.stringify(findings) } }] });
}

function request(headers?: HeadersInit) {
  return POST(new Request("https://journal.example/api/analytics/journal-insights", { method: "POST", headers }));
}

describe("AI Journal Insights endpoint", () => {
  beforeEach(() => {
    vi.stubEnv("AI_BASE_URL", "https://provider.example/v1/");
    vi.stubEnv("AI_API_KEY", "private-test-key");
    vi.stubEnv("AI_MODEL", "test-model");
    vi.mocked(requireUser).mockResolvedValue({ id: "caller", email: "private@example.test", name: "Private Name", timezone: "UTC", locale: "id" });
    countTrades.mockResolvedValue(3);
    findTrades.mockResolvedValue([trade("25"), trade("-5"), trade("0")]);
    vi.mocked(reserveAiJournalRequest).mockResolvedValue(undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  it("uses only the caller's closed trades, including when no trades have journals", async () => {
    const allTrades = [
      trade("25", { actualR: "2" }),
      trade("-500", { actualR: "-1", account: { currency: "USC" } }),
      trade("0"), trade("1000", { status: "PARTIAL" }), trade(null),
      trade("5000", { userId: "another-user" }),
    ];
    findTrades.mockImplementation(async ({ where }) => allTrades.filter((row) =>
      row.userId === where.userId && row.status === where.status && row.realizedPnl !== where.realizedPnl.not));
    const fetchMock = vi.fn(async () => providerResponse({ evidenceId: "overview", actionId: "review-exits" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(findTrades).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      where: { userId: "caller", status: "CLOSED", realizedPnl: { not: null } },
    }));
    const { data } = await response.json();
    expect(data.coverage).toEqual({ closedTrades: 3, disciplineTrades: 0 });
    expect(data.findings[0].evidence[0]).toContain("P/L trade tertutup $20,00");
    expect(data.findings[0].evidence[0]).toContain("win rate 33,33%");
    expect(data.findings[0].evidence[0]).toContain("rata-rata R 0,50R (2/3 trade)");
    expect(data.findings[0].evidence[0]).toContain("sampel kecil");
    expect(data.findings[0].reviewAction).toContain("entry dan exit");
  });

  it("uses aliased comparisons at the provider and renders the real labels and statistics locally", async () => {
    findTrades.mockResolvedValue([...gains, ...losses, trade("1000", { session: "asian" })]);
    const fetchMock = vi.fn(async (_url: URL, init: RequestInit) => {
      expect(init.headers).toMatchObject({ Authorization: "Bearer private-test-key" });
      expect(init.signal).toBeInstanceOf(AbortSignal);
      const body = String(init.body);
      for (const excluded of [
        "Private Name", "private@example.test", "Private note", "private-test-key", "caller",
        "private-strategy-id", "Private strategy name", "Private second strategy", "PRIVATE-SYMBOL", "instrument-one",
      ]) {
        expect(body).not.toContain(excluded);
      }
      const input = JSON.parse(body);
      expect(input.stream).toBe(false);
      const payload = JSON.parse(input.messages[1].content);
      expect(payload.coverage).toEqual({ closedTrades: 7, disciplineTrades: 6 });
      expect(payload.evidence).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "strategy",
          groups: [
            expect.objectContaining({ label: "A", closedTrades: 3, avgPnlUsd: "25.00" }),
            expect.objectContaining({ label: "B", closedTrades: 3, avgPnlUsd: "-5.00" }),
          ],
        }),
        expect.objectContaining({ id: "instrument" }),
        expect.objectContaining({ id: "compliance" }),
        expect.objectContaining({ id: "fomo" }),
      ]));
      return providerResponse(
        { evidenceId: "strategy", actionId: "review-exits" },
        { evidenceId: "session", actionId: "review-outliers" },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await request();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(new URL("https://provider.example/v1/chat/completions"), expect.anything());
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.findings[0].finding).toContain("Strategi Private strategy name");
    expect(data.findings[1].finding).toMatch(/London.*lebih tinggi.*New York/);
    expect(data.findings[1].evidence).toHaveLength(2);
    expect(data.findings[1].evidence[0]).toContain("3 trade");
    expect(data.findings[1].evidence[0]).toContain("$75,00");
    expect(data.findings[1].evidence[1]).toContain("R tidak tersedia");
  });

  it("does not compare tied groups or treat missing journal status as an unchecked flag", async () => {
    const tied = Array.from({ length: 3 }, () => trade("25", {
      session: "newyork", journal: { compliant: null, fomo: false, emotionBefore: null },
    }));
    findTrades.mockResolvedValue([...gains, ...tied, ...losses.map((row) => ({ ...row, session: null, journal: { compliant: null, fomo: true, emotionBefore: null } }))]);
    vi.stubGlobal("fetch", vi.fn(async (_url: URL, init: RequestInit) => {
      const payload = JSON.parse(JSON.parse(String(init.body)).messages[1].content);
      expect(payload.evidence.map((row: { id: string }) => row.id)).toEqual(["overview", "strategy", "instrument", "fomo"]);
      const fomo = payload.evidence.find((row: { id: string }) => row.id === "fomo");
      expect(fomo.groups.map((group: { closedTrades: number }) => group.closedTrades)).toEqual([3, 3]);
      return providerResponse({ evidenceId: "fomo", actionId: "review-decisions" });
    }));
    const response = await request();
    expect(response.status).toBe(200);
  });

  it.each([1, 2, 3])("requires three trades to share missing-SL performance (sample: %i)", async (missingStops) => {
    findTrades.mockResolvedValue(Array.from({ length: 5 }, (_, index) => trade(String(index), {
      initialStopLoss: index < missingStops ? null : "1",
    })));
    vi.stubGlobal("fetch", vi.fn(async (_url: URL, init: RequestInit) => {
      const payload = JSON.parse(JSON.parse(String(init.body)).messages[1].content);
      expect(payload.evidence.map((item: { id: string }) => item.id)).toEqual(
        missingStops === 3 ? ["overview", "stop-loss"] : ["overview"],
      );
      return providerResponse({ evidenceId: "overview", actionId: "review-exits" });
    }));

    expect((await request()).status).toBe(200);
  });

  it("supports a configured full endpoint and fenced JSON without accepting other response text", async () => {
    vi.stubEnv("AI_BASE_URL", "https://provider.example/v1/chat/completions/");
    expect(aiJournalConfig()?.url.href).toBe("https://provider.example/v1/chat/completions");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      choices: [{ message: { content: '```json\n[{"evidenceId":"overview","actionId":"review-exits"}]\n```' } }],
    })));
    expect((await request()).status).toBe(200);
  });

  it("skips the provider when configuration, quota, session, origin, or data is invalid", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await request({ "sec-fetch-site": "cross-site" })).status).toBe(403);
    vi.mocked(requireUser).mockRejectedValueOnce(new ApiError(401, "Tidak terautentikasi"));
    expect((await request()).status).toBe(401);
    vi.stubEnv("AI_BASE_URL", "");
    expect((await request()).status).toBe(503);
    vi.stubEnv("AI_BASE_URL", "https://provider.example/v1");
    countTrades.mockResolvedValueOnce(2);
    expect((await request()).status).toBe(422);
    expect(reserveAiJournalRequest).not.toHaveBeenCalled();
    vi.mocked(reserveAiJournalRequest).mockRejectedValueOnce(new ApiError(429, "Batas permintaan tercapai."));
    expect((await request()).status).toBe(429);
    vi.mocked(reserveAiJournalRequest).mockRejectedValueOnce(new Error("Private error details"));
    const unavailable = await request();
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).not.toContain("Private error details");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(findTrades).not.toHaveBeenCalled();
    expect(countTrades).toHaveBeenCalledWith({
      where: { userId: "caller", status: "CLOSED", realizedPnl: { not: null } },
      take: 3,
    });
    expect(console.warn).toHaveBeenCalledWith("[ai-journal]", { stage: "configuration" });
    expect(console.warn).toHaveBeenCalledWith("[ai-journal]", { stage: "quota" });
    expect(console.warn).toHaveBeenCalledWith("[ai-journal]", { stage: "quota_store" });
  });

  it("rejects missing, incompatible, duplicate, or malformed selections", async () => {
    const selection = { evidenceId: "overview", actionId: "review-exits" };
    const mock = vi.fn()
      .mockResolvedValueOnce(providerResponse({ ...selection, evidenceId: "missing" }))
      .mockResolvedValueOnce(providerResponse({ ...selection, actionId: "review-decisions" }))
      .mockResolvedValueOnce(providerResponse(selection, selection))
      .mockResolvedValueOnce(providerResponse({ ...selection, finding: "An unverified claim" } as typeof selection))
      .mockResolvedValueOnce(new Response("<html>Invalid provider page</html>", { status: 200 }));
    vi.stubGlobal("fetch", mock);
    for (let i = 0; i < 5; i++) {
      const response = await request();
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ ok: false, error: "Insight AI gagal dibuat. Silakan coba lagi." });
    }
    expect(console.warn).toHaveBeenCalledTimes(5);
    expect(console.warn).toHaveBeenCalledWith("[ai-journal]", { stage: "provider_response" });
  });

  it("includes an available performance comparison when the provider returns only an overview", async () => {
    findTrades.mockResolvedValue([
      ...Array.from({ length: 3 }, () => trade("30", { session: "london" })),
      ...Array.from({ length: 3 }, () => trade("-10", { session: "newyork" })),
    ]);
    vi.stubGlobal("fetch", vi.fn(async () => providerResponse({ evidenceId: "overview", actionId: "review-exits" })));
    const response = await request();
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.findings.map(({ id }: { id: string }) => id)).toEqual(["overview", "session"]);
    expect(data.findings[1].finding).toMatch(/London.*lebih tinggi.*New York/);
  });

  it("treats an oversized provider response as a temporary provider error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      choices: [{ message: { content: '[{"evidenceId":"overview","actionId":"review-exits"}]' } }],
      metadata: " ".repeat(128 * 1024),
    })));

    expect((await request()).status).toBe(502);
    expect(console.warn).toHaveBeenCalledWith("[ai-journal]", { stage: "provider_response" });
  });

  it("distinguishes timeout and HTTP failures without leaking provider details", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new DOMException("Private timeout detail", "TimeoutError"))
      .mockResolvedValueOnce(new Response("Private provider detail", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const timeout = await request();
    expect(timeout.status).toBe(504);
    expect(await timeout.text()).not.toContain("Private timeout detail");
    const providerError = await request();
    expect(providerError.status).toBe(502);
    expect(await providerError.text()).not.toContain("Private provider detail");
    expect(console.warn).toHaveBeenCalledWith("[ai-journal]", { stage: "provider_timeout" });
    expect(console.warn).toHaveBeenCalledWith("[ai-journal]", { stage: "provider_http", status: 401 });
  });
});
