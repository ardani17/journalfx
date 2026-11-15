import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";

/** Returns the user's default (active) project, throwing if missing. */
export async function getDefaultProject(userId: string) {
  const project = await prisma.project.findFirst({
    where: { userId, isActive: true, isDefault: true },
    include: { milestones: { orderBy: { order: "asc" } } },
  });
  if (!project) throw new ApiError(404, "Project belum ada — selesaikan onboarding");
  return project;
}

export async function updateProjectSettings(
  userId: string,
  projectId: string,
  data: { name?: string; targetAmount?: number; initialCapital?: number },
) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) throw new ApiError(404, "Project tidak ditemukan");
  await prisma.project.update({ where: { id: projectId }, data });
}
