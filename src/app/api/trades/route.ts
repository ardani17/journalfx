import { requireUser } from "@/server/auth";
import { createTrade, listTrades } from "@/server/services/trades";
import { createTradeSchema, listTradesQuery } from "@/lib/validation/trades";
import { handleRouteError, ok, parseBody, ApiError } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const q = listTradesQuery.safeParse(Object.fromEntries(url.searchParams));
    if (!q.success) throw new ApiError(400, "Parameter tidak valid");
    const { limit, offset, from, to, ...rest } = q.data;
    return ok(
      await listTrades(user.id, {
        ...rest,
        ...(from ? { from: new Date(from) } : {}),
        ...(to ? { to: new Date(to) } : {}),
        limit,
        offset,
      }),
    );
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(req, createTradeSchema);
    return ok(await createTrade(user.id, input, req), 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
