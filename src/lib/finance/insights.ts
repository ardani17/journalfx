
import { fmtUSD } from "@/lib/money";

/**
 * Explainable journal insights (v1.3.0) — deterministic rule-based analysis,
 * NO black-box model: every insight carries its data source, sample size, and
 * missing-data flags. No predictions, no signals (PRD guardrail).
 */

export interface InsightTrade {
  session: string | null;
  timeframe: string | null;
  direction: "LONG" | "SHORT";
  realizedPnl: number | null;
  actualR: number | null;
  initialStopLoss: number | null;
  entryAt: string;
  emotionBefore: string | null;
  fomo: boolean;
  revenge: boolean;
  overtrading: boolean;
  mistakes: string[];
  hasJournalContent: boolean;
  journalComplete: boolean;
  prevTradeLoss: boolean;
}

export interface Insight {
  id: string;
  severity: "positive" | "warning" | "neutral";
  title: string;
  detail: string;
  evidence: string; // source attribution + sample
}

const MIN_N = 3;

function avg(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function pct(n: number, d: number): number {
  return d === 0 ? 0 : (n / d) * 100;
}

export function journalInsights(trades: InsightTrade[]): {
  insights: Insight[];
  dataCoverage: { total: number; withJournal: number; complete: number };
} {
  const insights: Insight[] = [];
  const closed = trades.filter((t) => t.realizedPnl !== null);
  const withJournal = trades.filter((t) => t.hasJournalContent);
  const complete = trades.filter((t) => t.journalComplete);

  // 1. session performance comparison
  const sessions = new Map<string, InsightTrade[]>();
  for (const t of closed) {
    const key = t.session ?? "tanpa-sesi";
    sessions.set(key, [...(sessions.get(key) ?? []), t]);
  }
  for (const [session, list] of sessions) {
    if (list.length < MIN_N || sessions.size < 2) continue;
    const wins = list.filter((t) => (t.realizedPnl ?? 0) > 0).length;
    const wr = pct(wins, list.length);
    const others = closed.filter((t) => (t.session ?? "tanpa-sesi") !== session);
    if (others.length < MIN_N) continue;
    const oWr = pct(others.filter((t) => (t.realizedPnl ?? 0) > 0).length, others.length);
    const diff = wr - oWr;
    if (Math.abs(diff) >= 15) {
      insights.push({
        id: `session-${session}`,
        severity: diff > 0 ? "positive" : "warning",
        title: `Sesi ${session}: win rate ${wr.toFixed(0)}% vs ${oWr.toFixed(0)}% di luar sesi ini`,
        detail: diff > 0
          ? `Performa sesi ${session} lebih tinggi ${Math.abs(diff).toFixed(0)} poin. Pertimbangkan fokus di sesi ini.`
          : `Performa sesi ${session} lebih rendah ${Math.abs(diff).toFixed(0)} poin. Tinjau ulang entry di sesi ini.`,
        evidence: `Sumber: jurnal Anda — ${list.length} trade sesi ${session} vs ${others.length} trade sesi lain`,
      });
    }
  }

  // 2. emotional state impact (fomo)
  const fomoTrades = closed.filter((t) => t.fomo);
  const calmTrades = closed.filter((t) => !t.fomo);
  if (fomoTrades.length >= MIN_N && calmTrades.length >= MIN_N) {
    const fomoAvg = avg(fomoTrades.map((t) => t.realizedPnl!))!;
    const calmAvg = avg(calmTrades.map((t) => t.realizedPnl!))!;
    if (calmAvg > fomoAvg) {
      insights.push({
        id: "fomo-impact",
        severity: "warning",
        title: `Trade dengan flag FOMO rata-rata ${fmtUSD(fomoAvg)} vs ${fmtUSD(calmAvg)} tanpa FOMO`,
        detail: "Entry saat FOMO berkorelasi dengan hasil lebih buruk di data Anda. Tambahkan jeda sebelum entry saat terburu-buru.",
        evidence: `Sumber: jurnal psikologi — ${fomoTrades.length} trade FOMO vs ${calmTrades.length} trade tanpa flag`,
      });
    }
  }

  // 3. missing stop loss
  const noSl = closed.filter((t) => t.initialStopLoss === null);
  if (noSl.length >= 1) {
    const noSlAvg = avg(noSl.map((t) => t.realizedPnl!));
    const withSl = closed.filter((t) => t.initialStopLoss !== null);
    insights.push({
      id: "missing-sl",
      severity: "warning",
        title: `${noSl.length} trade tanpa SL awal${noSlAvg !== null && noSlAvg < 0 ? ` — rata-rata ${fmtUSD(noSlAvg)}` : ""}`,
      detail: "SL awal yang dicatat membuat risiko terukur dan discipline score akurat. Pasang SL sebelum entry.",
      evidence: `Sumber: data trade — ${noSl.length} tanpa SL dari ${closed.length} trade tertutup${withSl.length ? ` (pembanding ${withSl.length} trade ber-SL)` : ""}`,
    });
  }

  // 4. revenge trading pattern: trade right after a loss with flag or big size
  const revenge = closed.filter((t) => t.revenge && t.prevTradeLoss);
  if (revenge.length >= 1) {
    const revengeAvg = avg(revenge.map((t) => t.realizedPnl!));
    insights.push({
      id: "revenge-pattern",
      severity: "warning",
      title: `Pola balas dendam terdeteksi ${revenge.length}× (entry setelah loss)`,
      detail: `Rata-rata hasil trade tersebut ${fmtUSD(revengeAvg)}. Aturan pendinginan 15 menit setelah loss dapat membantu.`,
      evidence: `Sumber: urutan waktu trade + flag psikologi — ${revenge.length} trade`,
    });
  }

  // 5. mistake ranking
  const mistakeCount = new Map<string, number>();
  for (const t of trades) for (const m of t.mistakes) mistakeCount.set(m, (mistakeCount.get(m) ?? 0) + 1);
  const topMistake = [...mistakeCount.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topMistake && topMistake[1] >= 2) {
    insights.push({
      id: `mistake-${topMistake[0]}`,
      severity: "warning",
      title: `Kesalahan paling sering: "${topMistake[0]}" (${topMistake[1]}×)`,
      detail: "Buat checklist spesifik untuk kesalahan ini sebelum entry berikutnya.",
      evidence: `Sumber: tag kesalahan jurnal — ${topMistake[1]} dari ${trades.length} trade`,
    });
  }

  // 6. journal completeness
  if (trades.length >= MIN_N) {
    const cRate = pct(complete.length, trades.length);
    insights.push({
      id: "completeness",
      severity: cRate >= 70 ? "positive" : "neutral",
      title: `Kelengkapan jurnal ${cRate.toFixed(0)}%`,
      detail: cRate >= 70
        ? "Disiplin dokumentasi baik — data insight semakin dapat dipercaya."
        : "Lengkapi konteks, alasan, dan refleksi agar insight dan discipline score valid.",
      evidence: `Sumber: kelengkapan field jurnal — ${complete.length}/${trades.length} trade lengkap`,
    });
  }

  return {
    insights,
    dataCoverage: { total: trades.length, withJournal: withJournal.length, complete: complete.length },
  };
}
