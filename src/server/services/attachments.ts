import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/server/audit";

/**
 * Private screenshot storage (filesystem under UPLOAD_DIR, gitignored).
 * Files are NEVER served statically — only through /api/attachments/[id]
 * after session + ownership verification. (S3/MinIO adapter can be added
 * behind the same interface for production.)
 */

const ALLOWED = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);
const MAX_BYTES = 5 * 1024 * 1024;

function uploadRoot(): string {
  const dir = process.env.UPLOAD_DIR ?? "./uploads";
  // Attachments are runtime data stored outside the build output.
  return path.isAbsolute(dir) ? dir : path.join(/* turbopackIgnore: true */ process.cwd(), dir);
}

export async function uploadAttachment(
  userId: string,
  tradeId: string,
  file: File,
  kind: "BEFORE" | "ENTRY" | "DURING" | "EXIT",
  req?: Request,
) {
  const trade = await prisma.trade.findFirst({ where: { id: tradeId, userId } });
  if (!trade) throw new ApiError(404, "Trade tidak ditemukan");

  const ext = ALLOWED.get(file.type);
  if (!ext) throw new ApiError(400, "Hanya PNG, JPEG, atau WebP yang diizinkan");
  if (file.size > MAX_BYTES) throw new ApiError(400, "Ukuran file maksimal 5 MB");

  const buf = Buffer.from(await file.arrayBuffer());
  const id = randomUUID();
  const relDir = path.join("trade-attachments", tradeId);
  const absDir = path.join(uploadRoot(), relDir);
  await mkdir(absDir, { recursive: true });
  const fileName = `${id}.${ext}`;
  const absPath = path.join(absDir, fileName);
  await writeFile(absPath, buf);

  const row = await prisma.tradeAttachment.create({
    data: {
      tradeId,
      kind,
      fileName: file.name || fileName,
      mimeType: file.type,
      sizeBytes: buf.byteLength,
      storagePath: path.posix.join(relDir.split(path.sep).join("/"), fileName),
    },
  });
  await audit({ userId, action: "create", entity: "TradeAttachment", entityId: row.id, after: { tradeId, kind, size: buf.byteLength, sha256: createHash("sha256").update(buf).digest("hex").slice(0, 16) }, req });
  return row;
}

export async function readAttachment(userId: string, attachmentId: string) {
  const row = await prisma.tradeAttachment.findFirst({
    where: { id: attachmentId },
    include: { trade: { select: { userId: true } } },
  });
  if (!row) throw new ApiError(404, "Lampiran tidak ditemukan");
  if (row.trade.userId !== userId) throw new ApiError(403, "Akses ditolak");
  const absPath = path.join(uploadRoot(), row.storagePath);
  const data = await readFile(absPath);
  return { data, mimeType: row.mimeType, fileName: row.fileName };
}

export async function deleteAttachment(userId: string, attachmentId: string, req?: Request) {
  const row = await prisma.tradeAttachment.findFirst({
    where: { id: attachmentId },
    include: { trade: { select: { userId: true } } },
  });
  if (!row) throw new ApiError(404, "Lampiran tidak ditemukan");
  if (row.trade.userId !== userId) throw new ApiError(403, "Akses ditolak");
  await prisma.tradeAttachment.delete({ where: { id: attachmentId } });
  try {
    await unlink(path.join(uploadRoot(), row.storagePath));
  } catch {
    // file already gone — row removal is the source of truth
  }
  await audit({ userId, action: "delete", entity: "TradeAttachment", entityId: attachmentId, req });
}
