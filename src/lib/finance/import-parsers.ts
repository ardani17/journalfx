/**
 * Pure CSV parsers for MT4/MT5 statement exports (dedup happens in the
 * service layer via unique externalIds — duplicate re-import is a no-op).
 *
 * Supported shapes (header names matched fuzzily, case-insensitive):
 * - MT4 History: Ticket,Open Time,Type,Size,Item,Price,S/L,T/P,Close Time,Price,
 *                Commission,Taxes,Swap,Profit
 * - MT5 Deals:   Ticket/Deal,Time,Symbol,Type,Volume,Price,Commission,Swap,Profit,Comment
 */

export interface ParsedTradeRow {
  ticket: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  lot: number;
  openTime: string; // ISO
  openPrice: number;
  closeTime?: string; // ISO — absent for open positions
  closePrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  commission: number;
  swap: number;
  fees: number;
  profit: number; // gross/net profit as reported (used only for cross-check)
}

export interface ParseResult {
  platform: "MT4" | "MT5" | "GENERIC";
  rows: ParsedTradeRow[];
  skipped: number;
  errors: string[];
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === "," || ch === ";" || ch === "\t") && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function norm(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function num(v: string | undefined): number {
  if (!v) return 0;
  let cleaned = v.replace(/\s/g, "");
  if (cleaned.includes(",") && cleaned.includes(".")) {
    cleaned = cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
      ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  } else if (cleaned.includes(",")) cleaned = cleaned.replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/** MT4: "2026.01.20 08:30" / MT5: "2026.01.20 08:30:59" / ISO */
function parseTime(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const s = v.trim();
  if (!s) return undefined;
  const m1 = s.match(/^(\d{4})[.\-/](\d{2})[.\-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m1) {
    const [, y, mo, d, h, mi, se] = m1;
    const parsed = new Date(Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, se ? +se : 0));
    if (parsed.getUTCMonth() !== +mo! - 1 || parsed.getUTCDate() !== +d! || +h! > 23 || +mi! > 59 || +(se ?? 0) > 59) return undefined;
    return parsed.toISOString();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

function findCol(headers: string[], candidates: string[], from = 0): number {
  const normed = headers.map(norm);
  for (const c of candidates) {
    const cn = norm(c);
    for (let i = from; i < normed.length; i++) {
      if (normed[i] === cn) return i;
    }
  }
  // partial match fallback
  for (const c of candidates) {
    const cn = norm(c);
    for (let i = from; i < normed.length; i++) {
      if (normed[i]!.includes(cn)) return i;
    }
  }
  return -1;
}

export function parseStatementCsv(text: string): ParseResult {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { platform: "GENERIC", rows: [], skipped: 0, errors: ["File kosong"] };

  // find the header line (first line with ≥4 recognisable column names)
  let headerIdx = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const cols = splitCsvLine(lines[i]!);
    const normed = cols.map(norm).join("|");
    const score = ["ticket", "type", "item", "symbol", "volume", "size"].filter((k) =>
      normed.includes(k),
    ).length;
    if (score >= 3) {
      headerIdx = i;
      headers = cols;
      break;
    }
  }
  if (headerIdx < 0) {
    return { platform: "GENERIC", rows: [], skipped: 0, errors: ["Header kolom tidak dikenali"] };
  }

  const hasItem = findCol(headers, ["Item", "Symbol"]) >= 0;
  const platform: "MT4" | "MT5" = hasItem && findCol(headers, ["Open Time"]) >= 0 ? "MT4" : "MT5";
  const directionCol = findCol(headers, ["Direction"]); // MT5 deals: in/out

  const c = {
    ticket: findCol(headers, ["Ticket", "Deal", "Order", "No"]),
    openTime: findCol(headers, ["Open Time", "Open Date", "Time", "Date"]),
    type: findCol(headers, ["Type", "Direction", "Deal Type"]),
    size: findCol(headers, ["Size", "Volume", "Lots", "Amount"]),
    item: findCol(headers, ["Item", "Symbol", "Instrument", "Pair"]),
    sl: findCol(headers, ["S/L", "SL", "Stop Loss"]),
    tp: findCol(headers, ["T/P", "TP", "Take Profit"]),
    closeTime: findCol(headers, ["Close Time", "Close Date", "Close"]),
    commission: findCol(headers, ["Commission"]),
    taxes: findCol(headers, ["Taxes", "Fee", "Fees"]),
    swap: findCol(headers, ["Swap"]),
    profit: findCol(headers, ["Profit", "P/L", "Net Profit", "PnL"]),
  };
  // entry price: first "price" column; close price: after the close-time column
  // (MT4 repeats the header "Price"), else distinct names
  const priceIn = findCol(headers, ["Price", "Open Price", "Entry"]);
  const searchFrom = c.closeTime >= 0 ? c.closeTime + 1 : priceIn + 1;
  const priceOut = findCol(headers, ["Close Price", "Exit"], searchFrom);
  const priceOutFinal =
    priceOut >= 0 ? priceOut : findCol(headers, ["Price"], searchFrom);

  const rows: ParsedTradeRow[] = [];
  let skipped = 0;

  // MT5 "deals" exports list entry (in) and exit (out) as separate rows —
  // pair them FIFO per symbol into complete trades.
  const mt5Raw: {
    side: "in" | "out";
    row: ParsedTradeRow;
    commission: number;
    swap: number;
    fees: number;
    profit: number;
    rawTime: string;
  }[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!);
    const typeRaw = (c.type >= 0 ? (cols[c.type] ?? "") : "").toLowerCase();
    const isBuy = typeRaw.includes("buy");
    const isSell = typeRaw.includes("sell");
    if (!isBuy && !isSell) {
      skipped++; // balance/credit rows etc.
      continue;
    }
    const ticket = c.ticket >= 0 ? cols[c.ticket] : "";
    const symbol = (c.item >= 0 ? cols[c.item] : "")?.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!ticket || !symbol) {
      skipped++;
      continue;
    }
    const closeTime = parseTime(c.closeTime >= 0 ? (cols[c.closeTime] ?? undefined) : undefined);
    const openTime = parseTime(c.openTime >= 0 ? cols[c.openTime] : undefined);
    if (!openTime || (c.closeTime >= 0 && cols[c.closeTime]?.trim() && !closeTime)) {
      errors.push(`Baris ${i + 1}: tanggal transaksi tidak valid`); skipped++; continue;
    }
    const base: ParsedTradeRow = {
      ticket,
      symbol,
      direction: isBuy ? "LONG" : "SHORT",
      lot: num(c.size >= 0 ? cols[c.size] : undefined),
      openTime,
      openPrice: num(priceIn >= 0 ? cols[priceIn] : undefined),
      closeTime,
      closePrice: priceOutFinal >= 0 ? num(cols[priceOutFinal]) || undefined : undefined,
      stopLoss: c.sl >= 0 && cols[c.sl] ? num(cols[c.sl]) || undefined : undefined,
      takeProfit: c.tp >= 0 && cols[c.tp] ? num(cols[c.tp]) || undefined : undefined,
      commission: num(c.commission >= 0 ? cols[c.commission] : undefined),
      swap: num(c.swap >= 0 ? cols[c.swap] : undefined),
      fees: num(c.taxes >= 0 ? cols[c.taxes] : undefined),
      profit: num(c.profit >= 0 ? cols[c.profit] : undefined),
    };

    if (!Number.isFinite(base.lot) || base.lot <= 0 || !Number.isFinite(base.openPrice) || base.openPrice <= 0 ||
        ![base.commission, base.swap, base.fees, base.profit].every(Number.isFinite) ||
        (closeTime && (!base.closePrice || !Number.isFinite(base.closePrice)))) {
      errors.push(`Baris ${i + 1}: angka transaksi tidak valid`); skipped++; continue;
    }

    if (directionCol >= 0) {
      const dirRaw = (cols[directionCol] ?? "").toLowerCase();
      mt5Raw.push({
        side: dirRaw.includes("out") ? "out" : "in",
        row: base,
        commission: base.commission,
        swap: base.swap,
        fees: base.fees,
        profit: base.profit,
        rawTime: base.openTime,
      });
    } else {
      rows.push(base);
    }
  }

  if (directionCol >= 0) {
    // FIFO pair in→out per symbol
    const openBySymbol = new Map<string, (typeof mt5Raw)[number][]>();
    for (const raw of mt5Raw) {
      if (raw.side === "in") {
        const list = openBySymbol.get(raw.row.symbol) ?? [];
        list.push(raw);
        openBySymbol.set(raw.row.symbol, list);
        continue;
      }
      const list = openBySymbol.get(raw.row.symbol);
      const matchIndex = list?.findIndex((entry) => entry.row.direction !== raw.row.direction) ?? -1;
      const match = matchIndex >= 0 ? list?.[matchIndex] : undefined;
      if (!match) {
        skipped++; // closing deal without matching entry — skip
        continue;
      }
      if (Math.abs(match.row.lot - raw.row.lot) > 1e-9) {
        // The simple paired-trade importer cannot reconstruct partial deal chains.
        // Reject the statement rather than realize the entire entry quantity.
        return { platform, rows: [], skipped: lines.length - headerIdx - 1,
          errors: [...errors, "Statement MT5 berisi partial deal dengan volume berbeda. Gunakan jurnal partial close manual; file ini tidak diimpor agar P&L tidak salah."] };
      }
      list!.splice(matchIndex, 1);
      rows.push({
        ...match.row,
        ticket: `${match.row.ticket}-${raw.row.ticket}`, // stable pair key for dedupe
        closeTime: raw.rawTime,
        closePrice: raw.row.openPrice, // "out" deal price is the exit price
        direction: match.row.direction,
        lot: match.row.lot,
        commission: match.commission + raw.commission,
        swap: match.swap + raw.swap,
        fees: match.fees + raw.fees,
        profit: raw.profit,
      });
    }
    // unmatched "in" rows stay as open trades
    for (const list of openBySymbol.values()) {
      for (const unmatched of list) rows.push(unmatched.row);
    }
  }

  return { platform, rows, skipped, errors };
}
