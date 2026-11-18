import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D } from "@/lib/money";
import { convertUsdIdr, formatFxEstimate, parseConversionAmount } from "@/lib/finance/exchange";

const db = vi.hoisted(() => ({ exchangeRate: { upsert: vi.fn(), findFirst: vi.fn() } }));
vi.mock("@/server/db", () => ({ prisma: db }));

const now = new Date("2026-11-21T08:00:00+07:00"); // Saturday in WIB

function row({ day, buy = "18252.00", sell = buy, currency = "USD  " }: {
  day: string; buy?: string; sell?: string; currency?: string;
}) {
  return `<Table><mts_subkursasing>${currency}</mts_subkursasing><nil_subkursasing>1.00</nil_subkursasing>
    <beli_subkursasing>${buy}</beli_subkursasing><jual_subkursasing>${sell}</jual_subkursasing>
    <tgl_subkursasing>${day}T00:00:00+07:00</tgl_subkursasing></Table>`;
}

function dataset(...rows: string[]) {
  return `<DataSet xmlns="http://tempuri.org/"><diffgr:diffgram xmlns:diffgr="urn:schemas-microsoft-com:xml-diffgram-v1">
    <NewDataSet xmlns="">${rows.join("")}</NewDataSet></diffgr:diffgram></DataSet>`;
}

describe("JISDOR reference rate", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("selects a valid USD publication and keeps Friday's date on the weekend", async () => {
    const { parseJisdorXml } = await import("@/server/services/jisdor");
    const rate = parseJisdorXml(dataset(
      row({ day: "2026-11-18", buy: "18220.35" }),
      row({ day: "2026-11-20" }),
      row({ day: "2026-11-21", buy: "50000", currency: "EUR" }),
      row({ day: "2026-11-21", buy: "18250", sell: "18999" }),
      row({ day: "2026-11-21", buy: "0" }),
      row({ day: "2026-11-22" }),
    ));
    expect(rate).toEqual({ rate: "18252", at: "2026-11-19T17:00:00.000Z" });
  });

  it("uses one request for concurrent readers and waits 15 minutes before checking again", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(dataset(row({ day: "2026-11-20" })))));
    const { getJisdorQuote } = await import("@/server/services/jisdor");
    const quotes = await Promise.all([getJisdorQuote(), getJisdorQuote(), getJisdorQuote()]);
    for (const quote of quotes) expect(quote).toMatchObject({ rate: "18252", source: "bi-jisdor", status: "latest" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.exchangeRate.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "bi-jisdor-usdidr-2026-11-20" },
      create: expect.objectContaining({ userId: null, rate: "18252", source: "bi-jisdor" }),
    }));

    vi.setSystemTime(now.getTime() + 899_999);
    await getJisdorQuote();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(now.getTime() + 900_000);
    await getJisdorQuote();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["empty data", () => Promise.resolve(new Response(dataset()))],
    ["malformed XML", () => Promise.resolve(new Response("<DataSet>"))],
    ["timeout", () => Promise.reject(new DOMException("Timed out", "TimeoutError"))],
  ])("uses only a stored official rate on %s", async (_reason, response) => {
    fetchMock.mockImplementation(response);
    const at = new Date("2026-11-14T00:00:00+07:00");
    db.exchangeRate.findFirst.mockResolvedValue({ rate: D(18252), at });
    const { getJisdorQuote } = await import("@/server/services/jisdor");
    await expect(getJisdorQuote()).resolves.toEqual({ rate: "18252", at: at.toISOString(), source: "bi-jisdor", status: "cached" });
    expect(db.exchangeRate.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: null, pair: "USDIDR", source: "bi-jisdor", at: { gte: at, lte: now }, rate: { gt: 0 } },
    }));
    expect(db.exchangeRate.upsert).not.toHaveBeenCalled();
  });

  it("stops serving the cached rate when it ages out at midnight WIB", async () => {
    vi.setSystemTime(new Date("2026-11-21T23:59:50+07:00"));
    fetchMock.mockRejectedValue(new Error("offline"));
    db.exchangeRate.findFirst.mockResolvedValueOnce({ rate: D(18252), at: new Date("2026-11-14T00:00:00+07:00") })
      .mockResolvedValue(null);
    const { getJisdorQuote } = await import("@/server/services/jisdor");
    await expect(getJisdorQuote()).resolves.toMatchObject({ status: "cached" });
    vi.setSystemTime(new Date("2026-11-22T00:00:00+07:00"));
    await expect(getJisdorQuote()).resolves.toBeNull();
    vi.setSystemTime(new Date("2026-11-22T00:01:00+07:00"));
    await expect(getJisdorQuote()).resolves.toBeNull();
  });
});

describe("USD and IDR conversion", () => {
  const quote = { rate: "18252", at: now.toISOString(), source: "bi-jisdor", status: "latest" } as const;

  it("uses exact decimal rates in both directions and handles losses and zero", () => {
    expect(convertUsdIdr("100", "USD", quote)?.toString()).toBe("1825200");
    expect(convertUsdIdr("1825200", "IDR", quote)?.toString()).toBe("100");
    expect(formatFxEstimate("-1.05", "USD", quote)).toBe("≈ −Rp19.165");
    expect(formatFxEstimate("0", "IDR", quote)).toBe("≈ $0,00");
    expect(formatFxEstimate("5", "USD", null)).toBeNull();
  });

  it("accepts a comma or a dot as the decimal separator", () => {
    expect(parseConversionAmount(" 12,34 ")?.toString()).toBe("12.34");
    expect(parseConversionAmount("12.34")?.toString()).toBe("12.34");
    for (const invalid of ["", "NaN", "1.000,00", "1,000", "10e2"]) {
      expect(parseConversionAmount(invalid)).toBeNull();
    }
  });
});
