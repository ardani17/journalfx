import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

/** Uniform API result helpers — every route returns { ok, data } or { ok:false, error } */

export function ok<T>(data: T, init?: number) {
  return NextResponse.json({ ok: true as const, data }, { status: init ?? 200 });
}

export function fail(status: number, error: string, details?: unknown) {
  return NextResponse.json({ ok: false as const, error, details }, { status });
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Parse + validate a JSON body against a Zod schema; throws ApiError(400) on failure. */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "Body JSON tidak valid");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ApiError(
      400,
      first ? `${first.path.join(".") || "body"}: ${first.message}` : "Validasi gagal",
      result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return result.data;
}

export function handleRouteError(e: unknown) {
  if (e instanceof ApiError) {
    return fail(e.status, e.message, e.details);
  }
  if (e instanceof ZodError) {
    return fail(400, "Validasi gagal", e.issues);
  }
  console.error("[api] unexpected error:", e);
  return fail(500, "Terjadi kesalahan internal");
}

const MAX_MULTIPART_BYTES = 8 * 1024 * 1024;

/** Limit the entire upload, including multipart metadata, before parsing it. */
export async function parseUploadForm(req: Request): Promise<FormData> {
  if (Number(req.headers.get("content-length")) > MAX_MULTIPART_BYTES) {
    throw new ApiError(413, "Ukuran permintaan unggah maksimal 8 MB.");
  }
  const contentType = req.headers.get("content-type");
  if (!req.body || !contentType?.toLowerCase().startsWith("multipart/form-data;")) {
    throw new ApiError(400, "Unggahan file tidak valid.");
  }

  let received = 0;
  let tooLarge = false;
  const body = req.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > MAX_MULTIPART_BYTES) {
        tooLarge = true;
        controller.error(new Error("Multipart body exceeds size limit"));
        return;
      }
      controller.enqueue(chunk);
    },
  }));

  try {
    return await new Response(body, { headers: { "content-type": contentType } }).formData();
  } catch {
    if (tooLarge) throw new ApiError(413, "Ukuran permintaan unggah maksimal 8 MB.");
    throw new ApiError(400, "Unggahan file tidak valid.");
  }
}
