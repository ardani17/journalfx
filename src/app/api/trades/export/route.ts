import { requireUser } from "@/server/auth";
import { exportTradesCsv } from "@/server/services/imports";

export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId") ?? undefined;
  const csv = await exportTradesCsv(user.id, accountId);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="mdtp-trades-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
