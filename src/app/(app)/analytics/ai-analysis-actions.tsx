"use client";

import { Download, Save } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { AiJournalPdfInput } from "@/lib/validation/ai-journal-snapshot";

type Operation = "save" | "pdf";

export function AnalysisActions({ input }: { input: AiJournalPdfInput }) {
  const [operation, setOperation] = useState<Operation | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function perform(action: Operation) {
    const saving = action === "save";
    const { source, ...snapshot } = input;
    if (saving && source !== "current") return;
    const fallback = saving ? "Analisis gagal disimpan. Coba lagi." : "PDF gagal diunduh. Coba lagi.";
    setOperation(action);
    setError("");
    try {
      const response = await fetch("/api/analytics/journal-insights/" + (saving ? "saved" : "pdf"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(saving ? snapshot : input),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setError(result?.error ?? fallback);
        return;
      }
      if (saving) {
        setSaved(true);
        return;
      }

      const file = await response.blob();
      if (file.type !== "application/pdf") {
        setError(fallback);
        return;
      }
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/i)?.[1] ?? "analisis-ai.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError(fallback);
    } finally {
      setOperation(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {input.source === "current" ? (
          <Button size="sm" variant="secondary" disabled={saved || operation !== null} onClick={() => perform("save")}>
            <Save className="h-4 w-4" aria-hidden />
            {saved ? "Tersimpan" : operation === "save" ? "Menyimpan…" : "Simpan analisis"}
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" disabled={operation !== null} onClick={() => perform("pdf")}>
          <Download className="h-4 w-4" aria-hidden />
          {operation === "pdf" ? "Menyiapkan PDF…" : "Unduh PDF"}
        </Button>
      </div>
      {saved ? <p role="status" className="text-xs text-muted">Analisis tersimpan.</p> : null}
      {error ? <p role="alert" className="text-xs text-loss">{error}</p> : null}
    </div>
  );
}
