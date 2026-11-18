import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { calendarDate, DEFAULT_TZ, zonedPeriod } from "@/lib/dates";
import type { JisdorQuote } from "@/lib/finance/exchange";
import { D } from "@/lib/money";
import { prisma } from "@/server/db";

const BI_URL = "https://www.bi.go.id/biwebservice/wskursbi.asmx/getSubKursJisdor1";
const SOURCE = "bi-jisdor";
const PAIR = "USDIDR";
const CHECK_INTERVAL_MS = 15 * 60_000;
const RETRY_INTERVAL_MS = 60_000;
const MAX_RATE_AGE_MS = 7 * 86_400_000;

const parser = new XMLParser({ removeNSPrefix: true, parseTagValue: false, processEntities: false, maxNestedTags: 32 });
const rowSchema = z.object({
  mts_subkursasing: z.literal("USD"),
  nil_subkursasing: z.string().regex(/^1(?:\.0+)?$/),
  beli_subkursasing: z.string().regex(/^\d{1,14}(?:\.\d{1,4})?$/),
  jual_subkursasing: z.string().regex(/^\d{1,14}(?:\.\d{1,4})?$/),
  tgl_subkursasing: z.iso.datetime({ offset: true }),
});

type Rate = { rate: string; at: string };

function oldestUsableDate(now: number) {
  return new Date(zonedPeriod("DAILY", new Date(now), DEFAULT_TZ).start.getTime() - MAX_RATE_AGE_MS);
}

export function parseJisdorXml(xml: string, now = Date.now()): Rate | null {
  if (xml.length > 64_000 || /<!DOCTYPE/i.test(xml)) return null;
  const dataset = parser.parse(xml, true) as { DataSet?: { diffgram?: { NewDataSet?: { Table?: unknown } } } };
  const rows = dataset.DataSet?.diffgram?.NewDataSet?.Table;
  const oldest = oldestUsableDate(now).getTime();
  let latest: Rate | null = null;
  for (const row of Array.isArray(rows) ? rows : [rows]) {
    const parsed = rowSchema.safeParse(row);
    if (!parsed.success) continue;
    const { beli_subkursasing: buy, jual_subkursasing: sell, tgl_subkursasing: timestamp } = parsed.data;
    const at = Date.parse(timestamp);
    if (!Number.isFinite(at) || at < oldest || at > now || (latest && at <= Date.parse(latest.at))) continue;
    const rate = D(buy);
    if (!rate.gt(0) || !rate.eq(sell)) continue;
    latest = { rate: rate.toString(), at: new Date(at).toISOString() };
  }
  return latest;
}

let cached: { quote: JisdorQuote | null; retryAt: number } | undefined;
let pending: Promise<JisdorQuote | null> | undefined;

async function refreshQuote(): Promise<JisdorQuote | null> {
  let liveRate: Rate | null = null;
  try {
    const response = await fetch(BI_URL, {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(4_000),
    });
    if (response.ok) liveRate = parseJisdorXml(await response.text());
  } catch {
    // Keep reporting the last official publication when BI is temporarily unavailable.
  }

  if (liveRate) {
    const at = new Date(liveRate.at);
    const publicationDate = calendarDate(at, DEFAULT_TZ).toISOString().slice(0, 10);
    try {
      const id = `${SOURCE}-${PAIR.toLowerCase()}-${publicationDate}`;
      await prisma.exchangeRate.upsert({
        where: { id },
        create: { id, userId: null, pair: PAIR, source: SOURCE, rate: liveRate.rate, at },
        update: { rate: liveRate.rate, at },
      });
    } catch (error) {
      console.error("[jisdor] Gagal menyimpan kurs referensi", error);
    }
    const quote: JisdorQuote = { ...liveRate, source: SOURCE, status: "latest" };
    cached = { quote, retryAt: Date.now() + CHECK_INTERVAL_MS };
    return quote;
  }

  const now = Date.now();
  const oldest = oldestUsableDate(now);
  const previous = cached?.quote;
  let fallback: Rate | null = previous && Date.parse(previous.at) >= oldest.getTime() ? previous : null;
  try {
    const saved = await prisma.exchangeRate.findFirst({
      where: { userId: null, pair: PAIR, source: SOURCE, at: { gte: oldest, lte: new Date(now) }, rate: { gt: 0 } },
      orderBy: { at: "desc" },
      select: { rate: true, at: true },
    });
    if (saved && (!fallback || saved.at.getTime() > Date.parse(fallback.at))) {
      fallback = { rate: saved.rate.toString(), at: saved.at.toISOString() };
    }
  } catch (error) {
    console.error("[jisdor] Gagal membaca kurs referensi tersimpan", error);
  }
  const quote: JisdorQuote | null = fallback && { ...fallback, source: SOURCE, status: "cached" };
  cached = { quote, retryAt: Date.now() + RETRY_INTERVAL_MS };
  return quote;
}

export function getJisdorQuote(): Promise<JisdorQuote | null> {
  const now = Date.now();
  if (cached && now < cached.retryAt) {
    const quote = cached.quote;
    return Promise.resolve(quote && Date.parse(quote.at) >= oldestUsableDate(now).getTime() ? quote : null);
  }
  pending ??= refreshQuote().finally(() => { pending = undefined; });
  return pending;
}
