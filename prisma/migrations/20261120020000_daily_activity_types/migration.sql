BEGIN;

CREATE TABLE "DailyActivityType" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "DailyActivityKind" NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "DailyActivityType_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DailyActivityType" ADD CONSTRAINT "DailyActivityType_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "DailyActivityType_userId_archivedAt_idx" ON "DailyActivityType"("userId", "archivedAt");
CREATE UNIQUE INDEX "DailyActivityType_active_name_key"
    ON "DailyActivityType"("userId", lower("name")) WHERE "archivedAt" IS NULL;

ALTER TABLE "DailyActivity" ADD COLUMN "typeId" TEXT;

INSERT INTO "DailyActivityType" ("id", "userId", "name", "kind")
SELECT "User"."id" || ':' || types.kind::text, "User"."id", types.name, types.kind
FROM "User"
CROSS JOIN (VALUES ('Umum', 'GENERAL'::"DailyActivityKind"), ('Trading', 'TRADING'::"DailyActivityKind")) AS types(name, kind);

UPDATE "DailyActivity" AS activity
SET "typeId" = plan."userId" || ':' || activity.kind::text
FROM "DailyPlan" AS plan
WHERE activity."dailyPlanId" = plan.id;

ALTER TABLE "DailyActivity" ADD CONSTRAINT "DailyActivity_typeId_fkey"
    FOREIGN KEY ("typeId") REFERENCES "DailyActivityType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "DailyActivity_typeId_idx" ON "DailyActivity"("typeId");

COMMIT;
