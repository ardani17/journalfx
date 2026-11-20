CREATE TYPE "DailyActivityKind" AS ENUM ('GENERAL', 'TRADING');
CREATE TYPE "DailyActivityStatus" AS ENUM ('PENDING', 'COMPLETED', 'NOT_COMPLETED');

CREATE TABLE "DailyPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reflection" TEXT,
    CONSTRAINT "DailyPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyActivity" (
    "id" TEXT NOT NULL,
    "dailyPlanId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "kind" "DailyActivityKind" NOT NULL,
    "strategyId" TEXT,
    "entryConditions" TEXT,
    "status" "DailyActivityStatus" NOT NULL DEFAULT 'PENDING',
    "actualNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyActivity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyPlan_userId_date_key" ON "DailyPlan"("userId", "date");
CREATE UNIQUE INDEX "DailyActivity_dailyPlanId_requestId_key" ON "DailyActivity"("dailyPlanId", "requestId");
CREATE INDEX "DailyActivity_dailyPlanId_createdAt_id_idx" ON "DailyActivity"("dailyPlanId", "createdAt", "id");
CREATE INDEX "DailyActivity_strategyId_idx" ON "DailyActivity"("strategyId");

ALTER TABLE "DailyPlan" ADD CONSTRAINT "DailyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyActivity" ADD CONSTRAINT "DailyActivity_dailyPlanId_fkey" FOREIGN KEY ("dailyPlanId") REFERENCES "DailyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyActivity" ADD CONSTRAINT "DailyActivity_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
