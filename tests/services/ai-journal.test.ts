import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/analytics/journal-insights/route";
import { requireUser } from "@/server/auth";
import { reserveAiJournalRequest } from "@/server/services/ai-journal";
import { ApiError } from "@/lib/api";
import { buildInsights } from "@/server/services/economic-events";

vi.mock("@/server/services/ai-journal", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/services/ai-journal")>(),
  reserveAiJournalRequest: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/server/services/economic-events", () => ({ buildInsights: vi.fn() }));

const summary = {
  dataCoverage: { total: 4, withJournal: 3, complete: 2 },
  insights: [
    { id: "completeness", severity: "neutral" as const, title: "Kelengkapan 50%", detail: "Detail", evidence: "2/4 trade" },
    { id: "mistake-private tag", severity: "warning" as const, title: "Catatan privat", detail: "Detail", evidence: "2 kesalahan" },
  ],
};

async function request(withConfig = true, withData = true) {
  vi.stubEnv("AI_BASE_URL", withConfig ? "https://provider.example/v1/" : "");
  vi.stubEnv("AI_API_KEY", "private-test-key");
  vi.stubEnv("AI_MODEL", "test-model");
  vi.mocked(requireUser).mockResolvedValue({ id: "caller", email: "private@example.test", name: "Private Name", timezone: "UTC", locale: "id" });
  vi.mocked(buildInsights).mockResolvedValue(withData ? summary : {
    ...summary, dataCoverage: { ...summary.dataCoverage, withJournal: 2 },
  });
  return POST(new Request("https://journal.example/api/analytics/journal-insights", { method: "POST" }));
}

describe("AI Journal Insights endpoint", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("only sends allowlisted evidence for the signed-in user and renders server-owned evidence", async () => {
    const fetchMock = vi.fn(async () => Response.json({
      choices: [{ message: { content: JSON.stringify([{ finding: "Kelengkapan perlu ditinjau.", evidenceId: "completeness" }]) } }],
    }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await request();
    expect(response.status).toBe(200);
    expect(vi.mocked(buildInsights)).toHaveBeenCalledExactlyOnceWith("caller");
    expect(fetchMock).toHaveBeenCalledWith(new URL("https://provider.example/v1/chat/completions"), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer private-test-key" }),
      signal: expect.any(AbortSignal),
    }));
    const body = (fetchMock.mock.calls as unknown as [URL, RequestInit][])[0]?.[1].body;
    expect(body).toContain("2/4 trade");
    for (const excluded of ["Private Name", "private@example.test", "private tag", "Catatan privat", "private-test-key"]) {
      expect(body).not.toContain(excluded);
    }
    expect(await response.json()).toEqual({ ok: true, data: [{ finding: "Kelengkapan perlu ditinjau.", evidence: "2/4 trade" }] });
  });

  it("skips the provider when configuration or data is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await request(false)).status).toBe(503);
    expect((await request(true, false)).status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips the provider when the request quota is exhausted", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(reserveAiJournalRequest).mockRejectedValueOnce(new ApiError(429, "Batas permintaan tercapai."));
    expect((await request()).status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses a generic error for timeout, provider failure, or unsupported citations", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: '[{"finding":"Unsupported","evidenceId":"unknown"}]' } }] }));
    vi.stubGlobal("fetch", fetchMock);
    for (let i = 0; i < 3; i++) {
      const response = await request();
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ ok: false, error: "Insight AI gagal dibuat. Silakan coba lagi." });
    }
  });
});
