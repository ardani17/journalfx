import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { AI_JOURNAL_HISTORY_PATH } from "@/lib/ai-journal";
import { requireUser } from "@/server/auth";
import { getSavedAiJournalAnalysis } from "@/server/services/ai-journal-history";
import { AnalysisActions } from "../../ai-analysis-actions";
import { AnalysisReport } from "../../ai-analysis-report";

export const metadata = { title: "Analisis AI tersimpan" };

export default async function SavedAiJournalAnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const analysis = await getSavedAiJournalAnalysis(user.id, id.data);
  if (!analysis) notFound();

  return (
    <PageShell>
      <PageHeader title="Analisis AI tersimpan" actions={
        <Link href={AI_JOURNAL_HISTORY_PATH} className="text-sm text-primary hover:underline">Kembali ke riwayat</Link>
      } />
      <AnalysisActions input={{ source: "saved", reportId: id.data }} />
      <AnalysisReport analysis={analysis} previous={false} />
    </PageShell>
  );
}
