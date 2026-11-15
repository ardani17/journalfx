-- AlterTable
ALTER TABLE "TradingAccount" ADD COLUMN     "propMaxDailyLossPct" DECIMAL(9,4),
ADD COLUMN     "propMaxTotalDdPct" DECIMAL(9,4),
ADD COLUMN     "propTargetPct" DECIMAL(9,4);
