import { requireUser } from "@/server/auth";
import {
  createManualTransaction,
  listTransactions,
  type TransactionFilter,
} from "@/server/services/ledger";
import { createTransactionSchema, listTransactionsQuery } from "@/lib/validation/ledger";
import { handleRouteError, ok, parseBody, ApiError } from "@/lib/api";
import type { LedgerEntryType } from "@prisma/client";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const q = listTransactionsQuery.safeParse(Object.fromEntries(url.searchParams));
    if (!q.success) throw new ApiError(400, "Parameter tidak valid");
    const filter: TransactionFilter = {
      ...(q.data.accountId ? { accountId: q.data.accountId } : {}),
      ...(q.data.type ? { type: q.data.type as LedgerEntryType } : {}),
      ...(q.data.from ? { from: new Date(q.data.from) } : {}),
      ...(q.data.to ? { to: new Date(q.data.to) } : {}),
      limit: q.data.limit,
      offset: q.data.offset,
    };
    return ok(await listTransactions(user.id, filter));
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(req, createTransactionSchema);
    return ok(await createManualTransaction(user.id, input, req), 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
