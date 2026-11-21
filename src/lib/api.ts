import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import "@/lib/validation/indonesian";

/** Uniform API result helpers — every route returns { ok, data } or { ok:false, error } */

export function ok<T>(data: T, init?: number) {
  return NextResponse.json({ ok: true as const, data }, { status: init ?? 200 });
}

export function fail(status: number, error: string, details?: unknown) {
  return NextResponse.json({ ok: false as const, error, details }, { status });
}

export function privateNoStore(response: Response) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
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
    throw new ApiError(400, "Isi permintaan tidak valid.");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ApiError(
      400,
      first?.message ?? "Data yang dikirim tidak valid.",
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

/** Enforce a byte limit before a request parser buffers the full body. */
export function limitRequestBody(req: Request, maxBytes: number, message: string) {
  if (Number(req.headers.get("content-length")) > maxBytes) throw new ApiError(413, message);

  let received = 0;
  return req.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > maxBytes) controller.error(new ApiError(413, message));
      else controller.enqueue(chunk);
    },
  })) ?? null;
}

/** Limit the entire upload, including multipart metadata, before parsing it. */
export async function parseUploadForm(req: Request): Promise<FormData> {
  const contentType = req.headers.get("content-type");
  if (!req.body || !contentType?.toLowerCase().startsWith("multipart/form-data;")) {
    throw new ApiError(400, "Unggahan file tidak valid.");
  }
  const body = limitRequestBody(req, MAX_MULTIPART_BYTES, "Ukuran permintaan unggah maksimal 8 MB.");

  try {
    return await new Response(body, { headers: { "content-type": contentType } }).formData();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "Unggahan file tidak valid.");
  }
}
