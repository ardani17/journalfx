import { z } from "zod";
import { requireUser } from "@/server/auth";
import { changePassword, updateProfile } from "@/server/services/users";
import { updateProjectSettings } from "@/server/services/projects";
import { getDefaultProject } from "@/server/services/projects";
import { handleRouteError, ok, parseBody } from "@/lib/api";
import { isValidTimezone } from "@/lib/dates";

const settingsSchema = z.object({
  profile: z
    .object({
      name: z.string().trim().min(2).max(80).optional(),
      timezone: z.string().min(1).max(64).refine(isValidTimezone, "Timezone tidak valid").optional(),
      locale: z.enum(["id", "en"]).optional(),
    })
    .optional(),
  project: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      targetAmount: z.coerce.number().positive().optional(),
      initialCapital: z.coerce.number().positive().optional(),
    })
    .optional(),
  password: z
    .object({
      currentPassword: z.string().min(1),
      newPassword: z
        .string()
        .min(8)
        .regex(/[A-Za-z]/)
        .regex(/[0-9]/),
    })
    .optional(),
});

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(req, settingsSchema);

    if (input.profile) await updateProfile(user.id, input.profile);
    if (input.project) {
      const project = await getDefaultProject(user.id);
      await updateProjectSettings(user.id, project.id, input.project);
    }
    if (input.password) {
      await changePassword(user.id, input.password.currentPassword, input.password.newPassword);
    }
    return ok({ updated: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
