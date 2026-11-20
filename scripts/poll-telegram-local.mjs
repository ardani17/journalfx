import { createHmac } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

async function start() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const origin = new URL(process.env.APP_ORIGIN ?? "http://localhost:3000");
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing.");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) {
    throw new Error("Local polling requires a loopback APP_ORIGIN.");
  }
  const endpoint = new URL("/api/integrations/telegram/webhook", origin);
  const secret = createHmac("sha256", token).update("horizon-journal:telegram-webhook:v1").digest("hex");

  async function telegram(method, data = {}) {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
      redirect: "error",
      signal: AbortSignal.timeout(35_000),
    });
    const body = await response.json();
    if (response.status === 409) throw new Error("Telegram already has an active webhook or poller.");
    if (!response.ok || body.ok !== true) throw new Error(`Telegram ${method} failed (HTTP ${response.status}).`);
    return body.result;
  }

  const webhook = await telegram("getWebhookInfo");
  if (webhook.url) throw new Error("A Telegram webhook is already registered. Local polling stopped.");
  console.log("Listening for Telegram messages and button callbacks locally.");
  let offset = 0;
  while (true) {
    try {
      const updates = await telegram("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "callback_query"] });
      for (const update of updates) {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
          body: JSON.stringify(update),
          redirect: "error",
          signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) throw new Error(`Local Telegram route returned HTTP ${response.status}.`);
        offset = update.update_id + 1;
        console.log("Telegram update processed.");
      }
    } catch (error) {
      if (error.message === "Telegram already has an active webhook or poller.") throw error;
      console.error(error instanceof TypeError ? "Could not reach Telegram or the local app." : error.message);
      await delay(3000);
    }
  }
}

start().catch((error) => {
  console.error(error instanceof TypeError ? "Invalid APP_ORIGIN or network error." : error.message);
  process.exitCode = 1;
});
