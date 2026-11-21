import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExplorationPanel } from "@/app/(app)/simulator/exploration-panel";
import type { JisdorQuote } from "@/lib/finance/exchange";
import { defaultExplorationInput } from "@/lib/finance/exploration-monte-carlo";

const initial = { ...defaultExplorationInput("200", "1250.75"), withdrawal: "FIXED" as const, withdrawalAmount: "12.5" };
const quote: JisdorQuote = { rate: "16000", at: "2026-11-20T00:00:00.000Z", source: "bi-jisdor", status: "cached" };

function renderPanel(input = initial, rate: JisdorQuote | null = quote) {
  return renderToStaticMarkup(createElement(ExplorationPanel, {
    initial: input, initialSeed: 42, initialDate: "2026-11-21", userId: "test-user", quote: rate,
  }));
}

describe("Rupiah estimates in the simulator", () => {
  it("describes each initial USD amount, including zero and localized decimals", () => {
    const markup = renderPanel();
    for (const [field, estimate] of [
      ["capital", "3.200.000"], ["target", "20.012.000"], ["fee", "0"], ["withdrawalAmount", "200.000"],
    ] as const) {
      expect(markup).toContain(`aria-describedby="exploration-${field}-idr"`);
      expect(markup).toMatch(new RegExp(`id="exploration-${field}-idr"[^>]*>≈ Rp ${estimate.replaceAll(".", "\\.")}</p>`));
    }
  });

  it("renders editable inputs without a JISDOR rate", () => {
    const markup = renderPanel(initial, null);
    expect(markup).toContain('id="exploration-capital"');
    expect(markup).not.toContain("≈ Rp");
  });

  it("omits the estimate only for the amount that fails validation", () => {
    const markup = renderPanel({ ...initial, target: "0" });
    expect(markup).not.toContain("exploration-target-idr");
    expect(markup).toContain("≈ Rp 3.200.000");
  });
});
