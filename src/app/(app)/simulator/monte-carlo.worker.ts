import { simulateTradeMonteCarlo, type TradeSimulationInput } from "@/lib/finance/trade-monte-carlo";

self.onmessage = ({ data }: MessageEvent<TradeSimulationInput>) => {
  try {
    self.postMessage({ result: simulateTradeMonteCarlo(data) });
  } catch {
    self.postMessage({ error: "Simulasi Monte Carlo gagal. Periksa parameter dan coba lagi." });
  }
};
