import type { ZodType } from "zod";
import { ApiError, limitRequestBody } from "@/lib/api";

export async function readReportInput<T>(request: Request, schema: ZodType<T>) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError(403, "Permintaan tidak diizinkan.");
  }
  let input: unknown;
  try {
    input = await new Response(limitRequestBody(request, 128 * 1024, "Laporan analisis terlalu besar.")).json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "Isi permintaan tidak valid.");
  }
  return schema.parse(input);
}
