import { describe, expect, it } from "vitest";
import { parseStatementCsv } from "@/lib/finance/import-parsers";

const MT4_CSV = [
  "Ticket\tOpen Time\tType\tSize\tItem\tPrice\tS/L\tT/P\tClose Time\tPrice\tCommission\tTaxes\tSwap\tProfit",
  "1001\t2026.01.20 08:30\tbuy\t0.10\txauusd\t2025.40\t2020.00\t2045.00\t2026.01.20 12:00\t2041.10\t-0.50\t0.00\t0.00\t47.50",
  "1002\t2026.01.21 09:00\tsell\t0.10\tXAUUSD\t2040.00\t2050.00\t2030.00\t2026.01.21 11:30\t2046.00\t-0.50\t0.00\t-0.10\t-35.60",
  "1003\t2026.01.22 10:00\tbuy\t0.05\teurusd\t1.08500\t1.08300\t1.09000\t\t0.00000\t0.00\t0.00\t0.00\t0.00",
  "\t\tbalance\t\t\t\t\t\t\t\t\t\t\t500.00",
].join("\n");

const MT5_CSV = [
  "Time,Deal,Symbol,Type,Direction,Volume,Price,Order,Commission,Swap,Profit,Balance,Comment",
  "2026.01.20 10:15:32,70000123,XAUUSD,buy,in,0.10,2025.40,90000111,0.00,0.00,0.00,200.00,",
  "2026.01.20 14:02:11,70000124,XAUUSD,sell,out,0.10,2041.10,90000112,-0.70,0.00,54.70,254.70,",
].join("\n");

describe("parseStatementCsv", () => {
  it("parses MT4 history export with tab separator", () => {
    const r = parseStatementCsv(MT4_CSV);
    expect(r.platform).toBe("MT4");
    expect(r.rows).toHaveLength(3);
    expect(r.skipped).toBe(1); // balance row
    const t1 = r.rows[0]!;
    expect(t1.ticket).toBe("1001");
    expect(t1.symbol).toBe("XAUUSD");
    expect(t1.direction).toBe("LONG");
    expect(t1.lot).toBeCloseTo(0.1);
    expect(t1.openPrice).toBeCloseTo(2025.4);
    expect(t1.closePrice).toBeCloseTo(2041.1);
    expect(t1.stopLoss).toBeCloseTo(2020);
    expect(t1.commission).toBeCloseTo(-0.5);
    expect(t1.openTime.startsWith("2026-01-20T")).toBe(true);
    // open position has no close
    expect(r.rows[2]!.closeTime).toBeUndefined();
  });

  it("parses MT5 deals export and FIFO-pairs in/out into one complete trade", () => {
    const r = parseStatementCsv(MT5_CSV);
    expect(r.platform).toBe("MT5");
    expect(r.rows).toHaveLength(1); // in-deal + out-deal → one trade
    const t = r.rows[0]!;
    expect(t.direction).toBe("LONG");
    expect(t.openPrice).toBeCloseTo(2025.4);
    expect(t.closePrice).toBeCloseTo(2041.1); // price of the "out" deal
    expect(t.commission).toBeCloseTo(-0.7); // costs of both legs combined
    expect(t.profit).toBeCloseTo(54.7);
    expect(t.closeTime!.startsWith("2026-01-20T14")).toBe(true);
  });

  it("reports errors on garbage", () => {
    const r = parseStatementCsv("a,b,c\n1,2,3");
    expect(r.rows).toHaveLength(0);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
