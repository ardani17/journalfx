import { requireUser } from "@/server/auth";
import { allocateProfit, listAllocations, listBucketsWithAllocated } from "@/server/services/finance";
import { allocationSchema } from "@/lib/validation/finance";
import { handleRouteError, ok, parseBody } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    const [buckets, allocations] = await Promise.all([
      listBucketsWithAllocated(user.id),
      listAllocations(user.id),
    ]);
    return ok({ buckets, allocations });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(req, allocationSchema);
    const rows = await allocateProfit(user.id, input, req);
    return ok(rows.map((r) => ({ bucketId: r.bucketId, amount: r.amount.toString() })), 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
