import { requireUser } from "@/server/auth";
import { closeReview, correctReview, resolveReview, saveReviewFields } from "@/server/services/reviews";
import { reviewActionSchema, reviewFieldsSchema, reviewSelectorSchema } from "@/lib/validation/reviews";
import { handleRouteError, ok, parseBody } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const { kind, ...selection } = reviewSelectorSchema.parse({
      kind: searchParams.get("kind") ?? "WEEKLY",
      date: searchParams.get("date") ?? undefined,
      reviewId: searchParams.get("reviewId") ?? undefined,
    });
    const response = ok((await resolveReview(user.id, kind, selection)).review);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { action, kind, ...selection } = await parseBody(req, reviewActionSchema);
    if (action === "close") {
      return ok(await closeReview(user.id, kind, req, selection));
    }
    return ok(await correctReview(user.id, kind, req, selection), 201);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(req, reviewFieldsSchema);
    const { kind, date, reviewId, ...fields } = input;
    return ok(await saveReviewFields(user.id, kind, fields, req, { date, reviewId }));
  } catch (e) {
    return handleRouteError(e);
  }
}
