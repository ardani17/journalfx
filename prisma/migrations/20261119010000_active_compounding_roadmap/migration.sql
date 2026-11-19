ALTER TABLE "Project" ADD COLUMN "activeScenarioId" TEXT;

CREATE UNIQUE INDEX "Project_activeScenarioId_key" ON "Project"("activeScenarioId");

ALTER TABLE "Project" ADD CONSTRAINT "Project_activeScenarioId_fkey"
    FOREIGN KEY ("activeScenarioId") REFERENCES "CompoundingScenario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RoadmapMilestoneAchievement" (
    "projectId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "achievedAt" TIMESTAMP(3) NOT NULL,
    "balanceAtHit" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "RoadmapMilestoneAchievement_pkey" PRIMARY KEY ("projectId", "amount")
);

ALTER TABLE "RoadmapMilestoneAchievement" ADD CONSTRAINT "RoadmapMilestoneAchievement_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
