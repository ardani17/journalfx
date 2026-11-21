import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buffer } from "node:stream/consumers";
import PDFDocument from "pdfkit";
import type { AiJournalAnalysis } from "@/lib/ai-journal";
import { AI_JOURNAL_EMPTY_FINDINGS, AI_JOURNAL_OVERVIEW_TITLE, AI_JOURNAL_REPORT_TITLE, presentAiJournalReport } from "@/lib/ai-journal-report";

const fontDirectory = join(process.cwd(), "node_modules", "@fontsource", "noto-sans", "files");
const INK = "#172b3d";
const MUTED = "#475a6c";
const MARGIN = 48;

function writeHeading(doc: PDFKit.PDFDocument, title: string) {
  if (doc.y + 64 > doc.page.height - doc.page.margins.bottom) doc.addPage();
  doc.moveDown(0.85).font("Heading").fontSize(13).fillColor(INK).text(title);
  doc.moveDown(0.35).font("Body").fontSize(10.5).fillColor(INK);
}

export async function renderAiJournalPdf(analysis: AiJournalAnalysis) {
  const [regular, bold] = await Promise.all([
    readFile(join(fontDirectory, "noto-sans-latin-400-normal.woff")),
    readFile(join(fontDirectory, "noto-sans-latin-700-normal.woff")),
  ]);
  const report = presentAiJournalReport(analysis);
  const doc = new PDFDocument({
    size: "A4", margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: 56 }, bufferPages: true,
    info: { Title: AI_JOURNAL_REPORT_TITLE, Author: "Horizon Journal", CreationDate: new Date(analysis.analyzedAt) },
  });
  doc.registerFont("Body", regular);
  doc.registerFont("Heading", bold);
  doc.font("Heading").fontSize(11).fillColor(MUTED).text("Horizon Journal");
  doc.moveDown(0.2).fontSize(24).fillColor(INK).text(AI_JOURNAL_REPORT_TITLE);
  doc.moveDown(0.4).font("Body").fontSize(10).fillColor(MUTED).text(report.scopeLabel);
  doc.text("Dibuat " + report.analyzedLabel + " · " + analysis.scope.timezone);
  if (report.sampleWarning) doc.text("Sampel kecil.");
  doc.moveDown(0.45);

  writeHeading(doc, AI_JOURNAL_OVERVIEW_TITLE);
  doc.text(analysis.summary, { lineGap: 2 });
  doc.moveDown(0.65);
  for (const [label, value] of report.tiles) doc.text(label + " · " + value, { lineGap: 2 });
  doc.moveDown(0.5).fillColor(MUTED).fontSize(9.5);
  for (const note of report.notes) doc.text(note, { lineGap: 1 });

  for (const { title, findings } of report.sections) {
    writeHeading(doc, title);
    if (findings.length === 0) doc.fillColor(MUTED).text(AI_JOURNAL_EMPTY_FINDINGS);
    for (const [index, finding] of findings.entries()) {
      doc.fontSize(10.5).fillColor(INK).text(String(index + 1) + ". " + finding.text, { lineGap: 2 });
      doc.fontSize(9.5).fillColor(MUTED);
      for (const proof of finding.evidence) doc.text("• " + proof, { lineGap: 1 });
      doc.moveDown(0.6);
    }
  }

  const pages = doc.bufferedPageRange();
  for (let index = 0; index < pages.count; index++) {
    doc.switchToPage(pages.start + index);
    const label = "Halaman " + (index + 1) + " dari " + pages.count;
    doc.font("Body").fontSize(9).fillColor(MUTED);
    doc.text(label, doc.page.width - MARGIN - doc.widthOfString(label), doc.page.height - 35, { lineBreak: false });
  }
  doc.end();
  return buffer(doc);
}
