CREATE TABLE "SavedAiJournalAnalysis" (
  "id" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "analyzedAt" TIMESTAMP(3) NOT NULL,
  "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tradeCount" INTEGER NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "snapshot" JSONB NOT NULL,
  CONSTRAINT "SavedAiJournalAnalysis_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SavedAiJournalAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SavedAiJournalAnalysis_userId_savedAt_id_idx"
  ON "SavedAiJournalAnalysis"("userId", "savedAt" DESC, "id" DESC);
