ALTER TABLE "AccountTransaction" ADD COLUMN "mt5DealId" TEXT;

CREATE UNIQUE INDEX "AccountTransaction_accountId_mt5DealId_key"
    ON "AccountTransaction" ("accountId", "mt5DealId");
