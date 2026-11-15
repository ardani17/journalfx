import { prisma } from "@/server/db";

interface AuditInput {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  req?: Request;
}

/** Fire-and-forget audit trail. Never throws into the request path. */
export async function audit({ userId, action, entity, entityId, before, after, req }: AuditInput) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId ?? null,
        action,
        entity,
        entityId: entityId ?? null,
        before: before === undefined ? undefined : (before as object),
        after: after === undefined ? undefined : (after as object),
        ip: req?.headers.get("x-forwarded-for") ?? undefined,
        userAgent: req?.headers.get("user-agent") ?? undefined,
      },
    });
  } catch (e) {
    console.error("[audit] failed to write", e);
  }
}
