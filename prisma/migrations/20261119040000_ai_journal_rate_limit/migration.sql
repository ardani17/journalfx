CREATE TABLE "AiJournalRateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "requests" INTEGER NOT NULL,
    CONSTRAINT "AiJournalRateLimit_pkey" PRIMARY KEY ("key")
);
