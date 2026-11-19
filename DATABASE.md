# Database — MDTP

PostgreSQL 16 + Prisma ORM. All money is stored as `Decimal`; all timestamps are UTC
(`timestamptz`); every user-owned row carries `userId` with an index for ownership checks.

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

```bash
# backup (all migrations + data)
docker compose exec postgres pg_dump -U mdtp -Fc mdtp > backups/mdtp-$(date +%Y%m%d-%H%M%S).dump

# restore
docker compose up -d postgres
cat backups/mdtp-<stamp>.dump | docker compose exec -T postgres pg_restore -U mdtp -d mdtp --clean --if-exists
```

Production runbook: backup → `prisma migrate deploy` → health check (`/api/health`) → verify
ledger balances vs pre-migration snapshot. Rollback: redeploy previous image, restore dump if a
migration must be reverted (tested in staging first).
