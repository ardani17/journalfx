import { z } from "zod";

const siteverifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const siteverifyResponse = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
  action: z.string().optional(),
  "error-codes": z.array(z.string()).optional(),
});
const rejectedTokenCodes = new Set(["missing-input-response", "invalid-input-response", "timeout-or-duplicate"]);

export function getTurnstileConfig() {
  const siteKey = process.env.TURNSTILE_SITE_KEY?.trim();
  const secretKey = process.env.TURNSTILE_SECRET_KEY?.trim();
  return siteKey && secretKey ? { siteKey, secretKey } : null;
}

export async function verifyTurnstile(token: string, secretKey: string, hostname: string) {
  try {
    const response = await fetch(siteverifyUrl, {
      method: "POST",
      body: new URLSearchParams({ secret: secretKey, response: token }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return "unavailable";

    const result = siteverifyResponse.safeParse(await response.json());
    if (!result.success) return "unavailable";

    const data = result.data;
    if (data.success) {
      return data.hostname === hostname && data.action === "google_login" ? "verified" : "rejected";
    }

    const codes = data["error-codes"];
    return codes?.length && codes.every((code) => rejectedTokenCodes.has(code)) ? "rejected" : "unavailable";
  } catch {
    return "unavailable";
  }
}
