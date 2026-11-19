import { D, type Decimal } from "@/lib/money";
import { ApiError } from "@/lib/api";
import { readWorkbookSheets, type WorkbookRow } from "./mt5-workbook";

const POSITION_HEADERS = ["time", "position", "symbol", "type", "volume", "price", "sl", "tp", "time", "price", "commission", "swap", "profit"];
const DEAL_HEADERS = ["time", "deal", "symbol", "type", "direction", "volume", "price", "order", "commission", "fee", "swap", "profit", "balance", "comment"];
const SECTIONS = new Set(["positions", "orders", "deals", "open positions", "working orders", "results", "summary"]);
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

interface Mt5Position {
  rowNumber: number;
  ticket: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  lot: Decimal;
  openAt: Date;
  openPrice: Decimal;
  closeAt: Date;
  closePrice: Decimal;
  stopLoss: Decimal | null;
  takeProfit: Decimal | null;
  commission: Decimal;
  swap: Decimal;
  netPnl: Decimal;
}

interface Mt5Cashflow {
  rowNumber: number;
  dealId: string;
  type: "DEPOSIT" | "WITHDRAWAL";
  amount: Decimal;
  occurredAt: Date;
  comment: string;
}

function normalize(text = "") {
  return text.toLowerCase().replace(/[\s/]/g, "");
}

function decimal(text: string, scale: number, integerDigits: number) {
  let compact = text.replace(/\s/g, "");
  if (compact.includes(",") && compact.includes(".")) {
    compact = compact.lastIndexOf(",") > compact.lastIndexOf(".")
      ? compact.replace(/\./g, "").replace(",", ".") : compact.replace(/,/g, "");
  } else {
    compact = compact.replace(",", ".");
  }
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(compact)) return null;
  const amount = D(compact);
  return amount.isFinite() && amount.decimalPlaces() <= scale && amount.abs().lt(`1e${integerDigits}`) ? amount : null;
}

function reportTime(text: string, date1904: boolean) {
  const parts = /^(\d{4})[.-](\d{2})[.-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?Z?$/.exec(text);
  if (parts) {
    const [year, month, day, hour, minute, second] = parts.slice(1).map((part) => Number(part ?? 0));
    const at = new Date(Date.UTC(year!, month! - 1, day!, hour!, minute!, second!));
    if (at.getUTCFullYear() === year && at.getUTCMonth() + 1 === month && at.getUTCDate() === day &&
        at.getUTCHours() === hour && at.getUTCMinutes() === minute && at.getUTCSeconds() === second) return at;
    return null;
  }
  // Excel may store the displayed MT5 timestamp as a serial date after resaving.
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const serial = Number(text);
  if (serial < (date1904 ? 0 : 61) || serial >= 2_958_466 - (date1904 ? 1462 : 0)) return null;
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  return new Date(epoch + Math.round(serial * 86400) * 1000);
}

function brokerTicket(text = "") {
  const ticket = text.replace(/^0+/, "");
  return /^\d{1,20}$/.test(ticket) ? ticket : null;
}

function parsePosition(cells: Map<string, string>, rowNumber: number, date1904: boolean): Mt5Position {
  const cell = (column: string) => cells.get(column) ?? "";
  const ticket = brokerTicket(cell("B"));
  const symbol = cell("C").toUpperCase();
  const side = cell("D").toLowerCase();
  if (!ticket || !symbol || symbol.length > 64 || /[\p{C}\s]/u.test(symbol) || !["buy", "sell"].includes(side)) {
    throw new Error("Nomor posisi, simbol, atau arah transaksi tidak valid");
  }

  const lot = decimal(cell("E"), 8, 16);
  const openPrice = decimal(cell("F"), 6, 12);
  const closePrice = decimal(cell("J"), 6, 12);
  if (!lot?.gt(0) || !openPrice?.gt(0) || !closePrice?.gt(0)) {
    throw new Error("Volume atau harga posisi tertutup tidak valid");
  }
  const openAt = reportTime(cell("A"), date1904);
  const closeAt = reportTime(cell("I"), date1904);
  if (!openAt || !closeAt || closeAt < openAt) throw new Error("Waktu buka atau tutup tidak valid");

  const stopLoss = decimal(cell("G") || "0", 6, 12);
  const takeProfit = decimal(cell("H") || "0", 6, 12);
  if (!stopLoss?.gte(0) || !takeProfit?.gte(0)) throw new Error("SL atau TP tidak valid");

  const commission = decimal(cell("K") || "0", 2, 16);
  const swap = decimal(cell("L") || "0", 2, 16);
  const profit = decimal(cell("M"), 2, 16);
  if (!commission || !swap || !profit) throw new Error("Profit, komisi, atau swap tidak valid");
  const netPnl = profit.plus(commission).plus(swap);
  if (netPnl.abs().gte("1e16")) throw new Error("P&L di luar rentang yang didukung");

  return {
    rowNumber, ticket, symbol, direction: side === "buy" ? "LONG" : "SHORT", lot, openAt, openPrice, closeAt, closePrice,
    stopLoss: stopLoss.gt(0) ? stopLoss : null,
    takeProfit: takeProfit.gt(0) ? takeProfit : null,
    commission: commission.negated(), swap: swap.negated(), netPnl,
  };
}

function parseCashflow(row: WorkbookRow, date1904: boolean): Mt5Cashflow | null {
  if (normalize(row.cells.get("D")) !== "balance") return null;
  const comment = row.cells.get("N") ?? "";
  const marker = /^(dp|deposit|wd|withdrawal)\b/i.exec(comment)?.[1]?.toLowerCase();
  if (!marker) return null;
  const type = marker === "dp" || marker === "deposit" ? "DEPOSIT" : "WITHDRAWAL";
  const dealId = brokerTicket(row.cells.get("B"));
  const occurredAt = reportTime(row.cells.get("A") ?? "", date1904);
  const amount = decimal(row.cells.get("L") ?? "", 2, 16);
  if (!dealId || !occurredAt) throw new Error("Nomor deal atau waktu arus kas tidak valid");
  if (!amount || (type === "DEPOSIT" ? !amount.gt(0) : !amount.lt(0))) {
    throw new Error("Nominal atau tanda arus kas tidak valid");
  }
  return { rowNumber: row.number, dealId, type, amount, occurredAt, comment };
}

function parseDealFee(row: WorkbookRow, date1904: boolean): (Omit<Mt5Cashflow, "type"> & { type: "FEE" }) | null {
  const side = normalize(row.cells.get("D"));
  if (side !== "buy" && side !== "sell") return null;
  const amount = decimal(row.cells.get("J") ?? "0", 2, 16);
  if (!amount) throw new Error("Fee deal tidak valid");
  if (amount.isZero()) return null;
  const dealId = brokerTicket(row.cells.get("B"));
  const occurredAt = reportTime(row.cells.get("A") ?? "", date1904);
  if (!dealId || !occurredAt) throw new Error("Nomor deal atau waktu fee tidak valid");
  return { rowNumber: row.number, dealId, type: "FEE", amount, occurredAt, comment: "Fee deal " + dealId };
}

function reportSection(rows: WorkbookRow[], name: string, headers: string[]) {
  const marker = rows.findIndex((row) => row.cells.get("A")?.toLowerCase() === name);
  if (marker < 0) return null;
  const end = rows.findIndex((row, index) => index > marker && SECTIONS.has(row.cells.get("A")?.toLowerCase() ?? ""));
  const [header, ...data] = rows.slice(marker + 1, end < 0 ? undefined : end).filter((row) => row.cells.size > 0);
  const valid = header && headers.every((heading, index) => heading === normalize(header.cells.get(String.fromCharCode(65 + index))));
  return { marker, headerRow: header?.number ?? rows[marker]!.number, rows: valid ? data : null };
}

export async function parseMt5Report(bytes: Buffer) {
  try {
    for await (const { rows, date1904 } of readWorkbookSheets(bytes)) {
      const positionSection = reportSection(rows, "positions", POSITION_HEADERS);
      const dealSection = reportSection(rows, "deals", DEAL_HEADERS);
      if (!positionSection?.rows && !dealSection?.rows) continue;

      const firstSection = Math.min(positionSection?.marker ?? rows.length, dealSection?.marker ?? rows.length);
      const account = rows.slice(0, firstSection).find((row) => normalize(row.cells.get("A")) === "account:");
      const currency = [...account?.cells.values() ?? []]
        .map((value) => /\(([a-z]{3})\s*[,)]/i.exec(value)?.[1]?.toUpperCase())
        .find(Boolean);
      if (currency !== "USD" && currency !== "USC") {
        throw new ApiError(400, `Mata uang laporan MT5 ${currency ?? "tidak tercantum"}. Mata uang yang didukung adalah USD dan USC.`);
      }

      const positions: Mt5Position[] = [];
      const cashflows: Mt5Cashflow[] = [];
      const fees: NonNullable<ReturnType<typeof parseDealFee>>[] = [];
      const errors: string[] = [];
      if (positionSection && !positionSection.rows) errors.push("Baris " + positionSection.headerRow + " · Header Positions tidak dikenali");
      if (dealSection && !dealSection.rows) errors.push("Baris " + dealSection.headerRow + " · Header Deals tidak dikenali");
      for (const row of positionSection?.rows ?? []) {
        try {
          positions.push(parsePosition(row.cells, row.number, date1904));
        } catch (error) {
          errors.push(`Baris ${row.number} · ${error instanceof Error ? error.message : "Posisi tidak valid"}`);
        }
      }
      for (const row of dealSection?.rows ?? []) {
        try {
          const cashflow = parseCashflow(row, date1904);
          if (cashflow) cashflows.push(cashflow);
          const fee = parseDealFee(row, date1904);
          if (fee) fees.push(fee);
        } catch (error) {
          errors.push("Baris " + row.number + " · " + (error instanceof Error ? error.message : "Arus kas tidak valid"));
        }
      }
      return { currency, positions, cashflows, fees, errors };
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "File XLSX tidak bisa dibaca");
  }
  throw new ApiError(400, "Bagian Positions atau Deals pada laporan Trade History MT5 tidak ditemukan");
}

export async function readMt5Upload(req: Request) {
  const form = await req.formData().catch(() => { throw new ApiError(400, "Unggahan file tidak valid"); });
  const file = form.get("file");
  const accountId = form.get("accountId");
  if (typeof accountId !== "string" || !accountId.trim()) throw new ApiError(400, "Pilih akun tujuan");
  if (!(file instanceof File) || file.size === 0 || !/\.xlsx$/i.test(file.name)) {
    throw new ApiError(400, "Pilih file laporan MT5 berformat XLSX");
  }
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(400, "File maksimal 5 MB");
  return { accountId: accountId.trim(), bytes: Buffer.from(await file.arrayBuffer()) };
}
