import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMt5Report, readMt5Upload } from "@/server/mt5-report";

const report = readFileSync(new URL("../fixtures/mt5-history.xlsx", import.meta.url));
const cashflowReport = readFileSync(new URL("../fixtures/mt5-cashflows.xlsx", import.meta.url));

describe("MT5 history workbook", () => {
  it("reads UTF-16 positions and preserves ticket, fractional lot, and broker P&L", async () => {
    const { positions, cashflows, errors } = await parseMt5Report(report);
    expect(positions).toHaveLength(2);
    expect(cashflows).toEqual([]);
    expect(errors).toEqual([
      "Baris 10 · Waktu buka atau tutup tidak valid",
      "Baris 11 · Volume atau harga posisi tertutup tidak valid",
    ]);
    const [index, crypto] = positions;
    expect(index).toMatchObject({
      ticket: "9012345678901234567",
      symbol: "US100.DEMO",
      direction: "LONG",
      openAt: new Date("2026-11-01T08:00:00Z"),
      closeAt: new Date("2026-11-01T09:01:02Z"),
      takeProfit: null,
    });
    expect(index!.lot.toString()).toBe("0.001");
    expect(index!.openPrice.toString()).toBe("20250.123");
    expect(index!.closePrice.toString()).toBe("20251");
    expect(index!.netPnl.toString()).toBe("9.4");
    expect(crypto).toMatchObject({ symbol: "BTCUSD.TEST", direction: "SHORT", stopLoss: null });
    expect(crypto!.swap.toString()).toBe("-0.1");
    expect(crypto!.netPnl.toString()).toBe("-8.2");
  });

  it("reads signed balance deals from a cashflow-only workbook and reports invalid deposit or withdrawal rows", async () => {
    const { positions, cashflows, fees, errors } = await parseMt5Report(cashflowReport);
    expect(fees.map((fee) => ({ ...fee, amount: fee.amount.toString() }))).toEqual([{
      rowNumber: 12, dealId: "9900000000000000005", type: "FEE", amount: "-1.25",
      occurredAt: new Date("2026-11-02T22:48:58Z"), comment: "Fee deal 9900000000000000005",
    }]);
    expect(positions).toEqual([]);
    expect(errors).toEqual([
      "Baris 10 · Nominal atau tanda arus kas tidak valid",
      "Baris 13 · Nomor deal atau waktu arus kas tidak valid",
      "Baris 14 · Nominal atau tanda arus kas tidak valid",
    ]);
    expect(cashflows.map((cashflow) => ({ ...cashflow, amount: cashflow.amount.toString() }))).toEqual([
      {
        rowNumber: 8, dealId: "9900000000000000001", type: "DEPOSIT", amount: "100",
        occurredAt: new Date("2026-11-02T22:48:58Z"), comment: "DP tr#demo",
      },
      {
        rowNumber: 9, dealId: "9900000000000000002", type: "WITHDRAWAL", amount: "-15",
        occurredAt: new Date("2026-11-02T22:48:58Z"), comment: "wd tr#demo",
      },
    ]);
  });

  it("returns a validation error for a damaged workbook", async () => {
    await expect(parseMt5Report(report.subarray(0, 256))).rejects.toMatchObject({ status: 400 });
  });

  it("requires an XLSX upload and enforces the file size limit", async () => {
    function request(file: File) {
      const form = new FormData();
      form.set("accountId", "test-account");
      form.set("file", file);
      return new Request("http://localhost/api/trades/import", { method: "POST", body: form });
    }
    await expect(readMt5Upload(request(new File([new Uint8Array(report)], "history.XLSX"))))
      .resolves.toEqual({ accountId: "test-account", bytes: report });
    await expect(readMt5Upload(request(new File(["ticket,profit"], "history.csv"))))
      .rejects.toMatchObject({ status: 400 });
    await expect(readMt5Upload(request(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "history.xlsx"))))
      .rejects.toMatchObject({ status: 400, message: "File maksimal 5 MB" });
  });
});
