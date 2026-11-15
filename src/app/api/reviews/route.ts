import { requireUser } from "@/server/auth";
import { closeReview, correctReview, getOrCreateReview, saveReviewFields } from "@/server/services/reviews";
import { reviewActionSchema, reviewFieldsSchema } from "@/lib/validation/reviews";
import { handleRouteError, ok, parseBody } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const kind = (new URL(req.url).searchParams.get("kind") ?? "WEEKLY") as "DAILY" | "WEEKLY" | "MONTHLY";
    const validated = reviewActionSchema.shape.kind.parse(kind);
    return ok(await getOrCreateReview(user.id, validated));
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const actionInput = await parseBody(req, reviewActionSchema);
    if (actionInput.action === "close") {
      return ok(await closeReview(user.id, actionInput.kind, req));
    }
    return ok(await correctReview(user.id, actionInput.kind, req), 201);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(req, reviewFieldsSchema);
    const { kind, ...fields } = input;
    return ok(await saveReviewFields(user.id, kind, fields, req));
  } catch (e) {
    return handleRouteError(e);
  }
}
