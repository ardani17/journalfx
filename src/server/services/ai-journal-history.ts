import { createHash, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { ApiError } from "@/lib/api";
import type { AiJournalAnalysis, GeneratedAiJournalAnalysis } from "@/lib/ai-journal";
import { configuredAuthSecret } from "@/lib/session";
import { aiJournalSnapshotV1, type SaveAiJournalInput } from "@/lib/validation/ai-journal-snapshot";
import { prisma } from "@/server/db";

const RECEIPT_ISSUER = "horizon-journal";
const RECEIPT_AUDIENCE = "horizon-journal:ai-analysis";
const SNAPSHOT_VERSION = 1;
const PAGE_SIZE = 20;

function receiptSecret() {
  const secret = configuredAuthSecret();
  if (!secret) throw new Error("AUTH_SECRET is missing or invalid");
  return new TextEncoder().encode(secret);
}

function snapshotDigest(analysis: AiJournalAnalysis) {
  const canonical = aiJournalSnapshotV1.parse(analysis);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("base64url");
}

export async function issueAnalysisReceipt(userId: string, analysis: AiJournalAnalysis): Promise<GeneratedAiJournalAnalysis> {
  const reportId = randomUUID();
  const receipt = await new SignJWT({ version: SNAPSHOT_VERSION, digest: snapshotDigest(analysis) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(RECEIPT_ISSUER)
    .setAudience(RECEIPT_AUDIENCE)
    .setSubject(userId)
    .setJti(reportId)
    .setIssuedAt()
    .sign(receiptSecret());
  return { ...analysis, reportId, receipt };
}

export async function verifyAnalysisReceipt(userId: string, { reportId, receipt, analysis }: SaveAiJournalInput) {
  const secret = receiptSecret();
  try {
    const { payload } = await jwtVerify(receipt, secret, {
      algorithms: ["HS256"], issuer: RECEIPT_ISSUER, audience: RECEIPT_AUDIENCE, subject: userId,
    });
    if (payload.jti === reportId && payload.version === SNAPSHOT_VERSION && payload.digest === snapshotDigest(analysis)) {
      return analysis;
    }
  } catch {
    // A receipt from another account or a malformed receipt gets the same response.
  }
  throw new ApiError(403, "Laporan analisis tidak dapat diverifikasi. Buat analisis lagi.");
}

export async function saveAiJournalAnalysis(userId: string, input: SaveAiJournalInput) {
  const analysis = await verifyAnalysisReceipt(userId, input);
  await prisma.savedAiJournalAnalysis.createMany({
    data: [{
      id: input.reportId, userId, analyzedAt: new Date(analysis.analyzedAt), tradeCount: analysis.scope.closedTrades,
      schemaVersion: SNAPSHOT_VERSION, snapshot: analysis,
    }],
    skipDuplicates: true,
  });
  const saved = await prisma.savedAiJournalAnalysis.findFirst({
    where: { userId, id: input.reportId },
    select: { id: true, savedAt: true },
  });
  if (!saved) throw new ApiError(404, "Laporan analisis tidak ditemukan.");
  return saved;
}

export async function listSavedAiJournalAnalyses(userId: string, requestedPage: number) {
  const where = { userId };
  const total = await prisma.savedAiJournalAnalysis.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const reports = await prisma.savedAiJournalAnalysis.findMany({
    where,
    orderBy: [{ savedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: { id: true, analyzedAt: true, savedAt: true, tradeCount: true },
  });
  return { reports, page, pageCount };
}

export async function getSavedAiJournalAnalysis(userId: string, id: string) {
  const saved = await prisma.savedAiJournalAnalysis.findFirst({
    where: { id, userId },
    select: { snapshot: true, schemaVersion: true },
  });
  if (!saved) return null;
  if (saved.schemaVersion !== SNAPSHOT_VERSION) throw new Error("Unsupported AI journal snapshot version");
  return aiJournalSnapshotV1.parse(saved.snapshot);
}
