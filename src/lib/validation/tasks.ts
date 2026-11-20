import { z } from "zod";

export const taskDateSchema = z.iso.date().refine((date) => !date.startsWith("0000"), "Tanggal tidak valid");
const optionalText = z.string().trim().max(2000).nullish().transform((text) => text || null);
const activityKindSchema = z.enum(["GENERAL", "TRADING"]);
export const activityTypeIdSchema = z.string().min(1).max(120);
export const renameActivityTypeSchema = z.object({
  name: z.string().trim().min(1, "Isi nama jenis kegiatan").max(60),
});
export const createActivityTypeSchema = renameActivityTypeSchema.extend({
  kind: activityKindSchema,
});

const planFields = z.object({
  plan: z.string().trim().min(1, "Isi rencana kegiatan").max(2000),
  typeId: activityTypeIdSchema.nullish(),
  kind: activityKindSchema.optional(),
  strategyId: z.string().min(1).max(100).nullish(),
  entryConditions: optionalText,
});

export const createActivitySchema = planFields.extend({
  requestId: z.uuid(),
  date: taskDateSchema,
});

export const updateActivitySchema = z.discriminatedUnion("section", [
  planFields.extend({ section: z.literal("plan") }),
  z.object({
    section: z.literal("realization"),
    status: z.enum(["PENDING", "COMPLETED", "NOT_COMPLETED"]),
    actualNotes: optionalText,
  }),
]);

export const taskReflectionSchema = z.object({
  date: taskDateSchema,
  reflection: optionalText,
});

export type CreateActivity = z.infer<typeof createActivitySchema>;
export type UpdateActivity = z.infer<typeof updateActivitySchema>;
export type TaskReflection = z.infer<typeof taskReflectionSchema>;
