"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function addTeamExclusion(formData: FormData) {
  const userId = Number(formData.get("userId") ?? 0);
  const name = String(formData.get("name") ?? "").trim();
  if (!userId || !name) return;
  await prisma.excludedTeamMember.upsert({
    where: { userId },
    create: { userId, name },
    update: { name },
  });
  revalidatePath("/team-exclusions");
  revalidatePath("/team");
}

export async function removeTeamExclusion(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.excludedTeamMember.delete({ where: { id } });
  revalidatePath("/team-exclusions");
  revalidatePath("/team");
}
