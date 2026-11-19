BEGIN;

-- Chat IDs saved for old bots require fresh consent through the shared bot.
UPDATE "NotificationChannel" SET "telegramChatId" = NULL WHERE "telegramChatId" IS NOT NULL;

ALTER TABLE "NotificationChannel"
  DROP COLUMN "telegramBotToken",
  DROP COLUMN "lastDedupeKey",
  ADD COLUMN "telegramLinkCodeHash" TEXT,
  ADD COLUMN "telegramLinkExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "NotificationChannel_telegramChatId_key" ON "NotificationChannel"("telegramChatId");
CREATE UNIQUE INDEX "NotificationChannel_telegramLinkCodeHash_key" ON "NotificationChannel"("telegramLinkCodeHash");

ALTER TABLE "Notification" ADD COLUMN "telegramClaimedAt" TIMESTAMP(3);

-- Keep historical notifications in the app without replaying deliveries at cutover.
UPDATE "Notification" SET "telegramClaimedAt" = CURRENT_TIMESTAMP;

COMMIT;
