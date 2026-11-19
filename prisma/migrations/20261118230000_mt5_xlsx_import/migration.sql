ALTER TABLE "Instrument"
    ADD COLUMN "ownerId" TEXT,
    ALTER COLUMN "contractSize" DROP NOT NULL,
    ALTER COLUMN "contractSize" DROP DEFAULT;

DROP INDEX "Instrument_symbol_key";
CREATE UNIQUE INDEX "Instrument_reference_symbol_key" ON "Instrument" ("symbol") WHERE "ownerId" IS NULL;
CREATE UNIQUE INDEX "Instrument_ownerId_symbol_key" ON "Instrument" ("ownerId", "symbol");

ALTER TABLE "Instrument" ADD CONSTRAINT "Instrument_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Trade" DROP CONSTRAINT "Trade_instrumentId_fkey";
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_instrumentId_fkey"
    FOREIGN KEY ("instrumentId") REFERENCES "Instrument" ("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "Trade" ALTER COLUMN "lot" SET DATA TYPE DECIMAL(24, 8);
ALTER TABLE "TradeExecution" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(24, 8);
