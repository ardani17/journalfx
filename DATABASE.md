# Database — MDTP

PostgreSQL 16 + Prisma ORM. All money is stored as `Decimal`; all timestamps are UTC
(`timestamptz`). User-owned rows scope queries by an indexed `userId` or through an
indexed relation to their owner-scoped parent (for example, `DailyActivity.dailyPlanId`).

## Local development

```bash
docker compose up -d postgres   # postgres:16-alpine on localhost:5432
cp .env.example .env            # DATABASE_URL=postgresql://mdtp:mdtp@localhost:5432/mdtp
npx prisma migrate dev          # create/apply migrations while developing
npx prisma studio               # inspect data
```

## Environments

| Env | Migrate command | Notes |
| --- | --- | --- |
| dev | `npx prisma migrate dev` | generates client + migrations |
| staging/prod | `npx prisma migrate deploy` | applies committed migrations only |

Migration policy:

- One migration per schema change; never edit an applied migration — add a new one.
- Destructive changes require a two-step expand/contract path documented in the migration notes.
- Backup before applying migrations in production (see Backup/restore).

The shared Telegram bot migration (20261119030000) clears prior chat destinations
and removes per-user bot tokens. For this cutover, back up the database, stop app
instances using the per-user-token schema, apply the committed migrations, then
start the new app and register the shared bot. Users reconnect through Settings.
An older app requires a compatible database restore if rolled back after this
migration. Leave the shared bot disconnected until the restore is complete.

## Schema overview (v0.1.0 target)

Core domains and their tables (full definition in `prisma/schema.prisma`):

- **Identity**: `User` (single private account, bcrypt credentials).
- **Trading**: `Project`, `TradingAccount`, `Instrument`, `Strategy`, `Trade`, `TradeExecution`,
  `TradeJournal`, `TradeAttachment`, `AccountTransaction` (immutable ledger with reversals),
  `EquitySnapshot`.
- **Planning**: `CompoundingScenario`, `Milestone`, `RiskSettings`.
- **Finance**: `Withdrawal`, `WithdrawalRule`, `ExchangeRate`, `Debt`, `DebtPayment`, `Budget`,
  `ExpenseCategory`, `FinancialTransaction`, `FinancialBucket`, `FinancialAllocation`.
- **Ops**: `PeriodReview`, `Notification`, `AuditLog`.

## Integrity rules

- `AccountTransaction` rows are immutable; corrections create a linked reversal row plus a new
  corrected row, both referencing `AuditLog`.
- Ledger balance formula: `closing = opening + realizedNetPnL + deposits − withdrawals + adjustments`
  (computed, never stored on the account row).
- Trades reference executions; realized P&L recognized per (partial) close.
- Unique external identifiers on imported executions make re-import idempotent.
- FX rates are historical snapshots: a rate row is never edited once used by a withdrawal.

## Backup & restore

Use the backup script to save both PostgreSQL data and attachments.

```bash
bash scripts/backup.sh
```

Restore into a separate Compose project with an empty database and uploads
volume. Select an app image compatible with the archive. For a rollback, use
the prior app image so the restore runs its migration set. Keep the target app
stopped while restoring. Start PostgreSQL and prepare the selected app image
before running the script.

```bash
export COMPOSE_PROJECT_NAME=horizon-restore
docker compose -f docker-compose.prod.yml up -d postgres
bash scripts/restore.sh backups/<stamp>
```

If any step fails, keep the target disconnected and retry in a fresh Compose
project. Start the restored app in isolation and verify health, ledger balances,
attachments, and Telegram destinations before moving traffic. Keep the original
deployment available until the restored data has been verified.
