-- CreateEnum
CREATE TYPE "TradeDirection" AS ENUM ('LONG', 'SHORT');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('PLANNED', 'OPEN', 'PARTIAL', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExecutionKind" AS ENUM ('ENTRY', 'PARTIAL_ENTRY', 'CLOSE', 'PARTIAL_CLOSE');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('BEFORE', 'ENTRY', 'DURING', 'EXIT');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'REALIZED_PNL', 'ADJUSTMENT', 'FEE', 'REVERSAL');

-- CreateEnum
CREATE TYPE "CompoundingFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "WdMode" AS ENUM ('NONE', 'FIXED', 'DYNAMIC');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('RECOMMENDED', 'REQUESTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinancialTxKind" AS ENUM ('INCOME', 'EXPENSE', 'ALLOCATION', 'REVERSAL');

-- CreateEnum
CREATE TYPE "BucketKind" AS ENUM ('LIVING', 'DEBT', 'EMERGENCY', 'SAVINGS', 'TRADING', 'UNALLOCATED');

-- CreateEnum
CREATE TYPE "ReviewKind" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "locale" TEXT NOT NULL DEFAULT 'id',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "initialCapital" DECIMAL(18,2) NOT NULL,
    "targetAmount" DECIMAL(18,2) NOT NULL DEFAULT 1000000,
    "startDate" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "broker" TEXT,
    "accountNumber" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isProp" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL DEFAULT 'USD',
    "contractSize" DECIMAL(18,4) NOT NULL DEFAULT 100,
    "tickSize" DECIMAL(18,6) NOT NULL DEFAULT 0.01,
    "tickValue" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "lotMin" DECIMAL(18,2) NOT NULL DEFAULT 0.01,
    "lotMax" DECIMAL(18,2) NOT NULL DEFAULT 100,
    "lotStep" DECIMAL(18,2) NOT NULL DEFAULT 0.01,
    "pricePrecision" INTEGER NOT NULL DEFAULT 2,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Strategy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "timeframe" TEXT,
    "rules" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "strategyId" TEXT,
    "ticket" TEXT,
    "direction" "TradeDirection" NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'OPEN',
    "lot" DECIMAL(18,2) NOT NULL,
    "entryPrice" DECIMAL(18,6) NOT NULL,
    "exitPrice" DECIMAL(18,6),
    "initialStopLoss" DECIMAL(18,6),
    "initialTakeProfit" DECIMAL(18,6),
    "initialRisk" DECIMAL(18,2),
    "plannedRR" DECIMAL(9,4),
    "actualR" DECIMAL(9,4),
    "session" TEXT,
    "timeframe" TEXT,
    "commission" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "swap" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "fees" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "realizedPnl" DECIMAL(18,2),
    "entryAt" TIMESTAMP(3) NOT NULL,
    "exitAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeExecution" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "kind" "ExecutionKind" NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "price" DECIMAL(18,6) NOT NULL,
    "commission" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "swap" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "fees" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "realizedPnl" DECIMAL(18,2),
    "executedAt" TIMESTAMP(3) NOT NULL,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeJournal" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "marketContext" TEXT,
    "entryReason" TEXT,
    "exitReason" TEXT,
    "emotionBefore" TEXT,
    "emotionDuring" TEXT,
    "emotionAfter" TEXT,
    "confidence" INTEGER,
    "stressLevel" INTEGER,
    "fomo" BOOLEAN NOT NULL DEFAULT false,
    "revenge" BOOLEAN NOT NULL DEFAULT false,
    "overtrading" BOOLEAN NOT NULL DEFAULT false,
    "compliant" BOOLEAN,
    "mistakes" TEXT[],
    "lessons" TEXT,
    "improvement" TEXT,
    "tags" TEXT[],
    "preChecklist" JSONB,
    "postChecklist" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeJournal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeAttachment" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL DEFAULT 'ENTRY',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "sourceTradeId" TEXT,
    "withdrawalId" TEXT,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquitySnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "balance" DECIMAL(18,2) NOT NULL,
    "equity" DECIMAL(18,2) NOT NULL,
    "openRisk" DECIMAL(18,2),
    "note" TEXT,

    CONSTRAINT "EquitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompoundingScenario" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "initialCapital" DECIMAL(18,2) NOT NULL,
    "targetAmount" DECIMAL(18,2) NOT NULL,
    "returnPerCycle" DECIMAL(9,4) NOT NULL,
    "frequency" "CompoundingFrequency" NOT NULL DEFAULT 'WEEKLY',
    "wdMode" "WdMode" NOT NULL DEFAULT 'DYNAMIC',
    "fixedWdAmount" DECIMAL(18,2),
    "wdRatio" DECIMAL(9,4),
    "costPerCycle" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "deposits" JSONB,
    "stressReturns" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompoundingScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "label" TEXT,
    "achievedAt" TIMESTAMP(3),
    "balanceAtHit" DECIMAL(18,2),

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "riskPerTrade" DECIMAL(9,4) NOT NULL DEFAULT 1.0000,
    "dailyLossLimit" DECIMAL(9,4) NOT NULL DEFAULT 2.0000,
    "weeklyLossLimit" DECIMAL(9,4) NOT NULL DEFAULT 5.0000,
    "ddReview" DECIMAL(9,4) NOT NULL DEFAULT 10.0000,
    "maxOpenRisk" DECIMAL(9,4) NOT NULL DEFAULT 2.0000,
    "equityMode" TEXT NOT NULL DEFAULT 'balance',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "accountId" TEXT,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'RECOMMENDED',
    "amountUSD" DECIMAL(18,2) NOT NULL,
    "fxRate" DECIMAL(18,4),
    "rateAt" TIMESTAMP(3),
    "receivedAmount" DECIMAL(18,2),
    "receivedCurrency" TEXT NOT NULL DEFAULT 'IDR',
    "fees" DECIMAL(18,2),
    "note" TEXT,
    "recommendedAt" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithdrawalRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "maxWdRatio" DECIMAL(9,4) NOT NULL DEFAULT 50.0000,
    "needsTargetIdr" DECIMAL(18,2),
    "reserveUsd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "minBalanceUsd" DECIMAL(18,2),
    "activeFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WithdrawalRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "pair" TEXT NOT NULL,
    "rate" DECIMAL(18,4) NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "source" TEXT,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Debt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "creditor" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "principalOriginal" DECIMAL(18,2) NOT NULL,
    "principalRemaining" DECIMAL(18,2) NOT NULL,
    "interestRate" DECIMAL(9,4),
    "installmentAmount" DECIMAL(18,2),
    "installmentFreq" TEXT,
    "dueDay" INTEGER,
    "startDate" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "paidOffAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "interestPortion" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "feePortion" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "principalPortion" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Kebutuhan Bulanan',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plannedAmount" DECIMAL(18,2) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "FinancialTxKind" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "fxRate" DECIMAL(18,4),
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "categoryId" TEXT,
    "debtId" TEXT,
    "withdrawalId" TEXT,
    "bucketId" TEXT,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialBucket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "BucketKind" NOT NULL,
    "name" TEXT NOT NULL,
    "targetPercent" DECIMAL(9,4),
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAllocation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "sourcePeriodStart" TIMESTAMP(3) NOT NULL,
    "sourcePeriodEnd" TIMESTAMP(3) NOT NULL,
    "financialTxId" TEXT,
    "reversedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ReviewKind" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'OPEN',
    "snapshot" JSONB,
    "performance" TEXT,
    "riskNotes" TEXT,
    "reflections" TEXT,
    "nextPlan" TEXT,
    "wdActual" DECIMAL(18,2),
    "wdRecommended" DECIMAL(18,2),
    "compoundedAmount" DECIMAL(18,2),
    "budgetCoverage" JSONB,
    "disciplineScore" JSONB,
    "closedAt" TIMESTAMP(3),
    "correctionOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeriodReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "Project_userId_isActive_idx" ON "Project"("userId", "isActive");

-- CreateIndex
CREATE INDEX "TradingAccount_userId_projectId_idx" ON "TradingAccount"("userId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_symbol_key" ON "Instrument"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "Strategy_userId_name_key" ON "Strategy"("userId", "name");

-- CreateIndex
CREATE INDEX "Trade_userId_accountId_entryAt_idx" ON "Trade"("userId", "accountId", "entryAt");

-- CreateIndex
CREATE INDEX "Trade_userId_status_idx" ON "Trade"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_accountId_ticket_key" ON "Trade"("accountId", "ticket");

-- CreateIndex
CREATE INDEX "TradeExecution_tradeId_executedAt_idx" ON "TradeExecution"("tradeId", "executedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TradeExecution_userId_externalId_key" ON "TradeExecution"("userId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeJournal_tradeId_key" ON "TradeJournal"("tradeId");

-- CreateIndex
CREATE INDEX "TradeAttachment_tradeId_idx" ON "TradeAttachment"("tradeId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountTransaction_reversalOfId_key" ON "AccountTransaction"("reversalOfId");

-- CreateIndex
CREATE INDEX "AccountTransaction_userId_accountId_occurredAt_idx" ON "AccountTransaction"("userId", "accountId", "occurredAt");

-- CreateIndex
CREATE INDEX "AccountTransaction_type_occurredAt_idx" ON "AccountTransaction"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "EquitySnapshot_userId_accountId_at_idx" ON "EquitySnapshot"("userId", "accountId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "EquitySnapshot_accountId_at_key" ON "EquitySnapshot"("accountId", "at");

-- CreateIndex
CREATE INDEX "CompoundingScenario_userId_projectId_idx" ON "CompoundingScenario"("userId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Milestone_projectId_order_key" ON "Milestone"("projectId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "RiskSettings_userId_key" ON "RiskSettings"("userId");

-- CreateIndex
CREATE INDEX "Withdrawal_userId_projectId_status_idx" ON "Withdrawal"("userId", "projectId", "status");

-- CreateIndex
CREATE INDEX "WithdrawalRule_userId_projectId_idx" ON "WithdrawalRule"("userId", "projectId");

-- CreateIndex
CREATE INDEX "ExchangeRate_pair_at_idx" ON "ExchangeRate"("pair", "at");

-- CreateIndex
CREATE INDEX "Debt_userId_status_idx" ON "Debt"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DebtPayment_reversalOfId_key" ON "DebtPayment"("reversalOfId");

-- CreateIndex
CREATE INDEX "DebtPayment_userId_debtId_paidAt_idx" ON "DebtPayment"("userId", "debtId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_userId_periodStart_periodEnd_key" ON "Budget"("userId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "ExpenseCategory_userId_budgetId_idx" ON "ExpenseCategory"("userId", "budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransaction_reversalOfId_key" ON "FinancialTransaction"("reversalOfId");

-- CreateIndex
CREATE INDEX "FinancialTransaction_userId_occurredAt_idx" ON "FinancialTransaction"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_userId_kind_idx" ON "FinancialTransaction"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialBucket_projectId_kind_key" ON "FinancialBucket"("projectId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAllocation_financialTxId_key" ON "FinancialAllocation"("financialTxId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAllocation_reversedById_key" ON "FinancialAllocation"("reversedById");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAllocation_bucketId_sourcePeriodStart_sourcePeriod_key" ON "FinancialAllocation"("bucketId", "sourcePeriodStart", "sourcePeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodReview_correctionOfId_key" ON "PeriodReview"("correctionOfId");

-- CreateIndex
CREATE INDEX "PeriodReview_userId_status_idx" ON "PeriodReview"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodReview_userId_kind_periodStart_key" ON "PeriodReview"("userId", "kind", "periodStart");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingAccount" ADD CONSTRAINT "TradingAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingAccount" ADD CONSTRAINT "TradingAccount_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Strategy" ADD CONSTRAINT "Strategy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeExecution" ADD CONSTRAINT "TradeExecution_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeJournal" ADD CONSTRAINT "TradeJournal_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAttachment" ADD CONSTRAINT "TradeAttachment_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountTransaction" ADD CONSTRAINT "AccountTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountTransaction" ADD CONSTRAINT "AccountTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountTransaction" ADD CONSTRAINT "AccountTransaction_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "Withdrawal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountTransaction" ADD CONSTRAINT "AccountTransaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "AccountTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquitySnapshot" ADD CONSTRAINT "EquitySnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquitySnapshot" ADD CONSTRAINT "EquitySnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompoundingScenario" ADD CONSTRAINT "CompoundingScenario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompoundingScenario" ADD CONSTRAINT "CompoundingScenario_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSettings" ADD CONSTRAINT "RiskSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRule" ADD CONSTRAINT "WithdrawalRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRule" ADD CONSTRAINT "WithdrawalRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialBucket" ADD CONSTRAINT "FinancialBucket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialBucket" ADD CONSTRAINT "FinancialBucket_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAllocation" ADD CONSTRAINT "FinancialAllocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAllocation" ADD CONSTRAINT "FinancialAllocation_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "FinancialBucket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodReview" ADD CONSTRAINT "PeriodReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodReview" ADD CONSTRAINT "PeriodReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
