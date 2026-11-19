import { createHmac } from "node:crypto";

async function registerWebhook() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const origin = process.env.APP_ORIGIN?.trim();
  if (!token || !origin) throw new Error("Set TELEGRAM_BOT_TOKEN and APP_ORIGIN first.");

  const endpoint = new URL("/api/integrations/telegram/webhook", origin);
  if (endpoint.protocol !== "https:") throw new Error("APP_ORIGIN must use HTTPS.");

  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: endpoint.href,
      secret_token: createHmac("sha256", token).update("horizon-journal:telegram-webhook:v1").digest("hex"),
      allowed_updates: ["message"],
    }),
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  const body = await response?.json().catch(() => null);
  if (!response?.ok || body?.ok !== true) throw new Error("Telegram webhook registration failed.");
}

try {
  await registerWebhook();
  console.log("Telegram webhook registered.");
} catch (error) {
  console.error(error instanceof TypeError ? "APP_ORIGIN or the Telegram endpoint is invalid." : error.message);
  process.exitCode = 1;
}
