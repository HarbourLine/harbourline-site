"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function addExclusions(formData: FormData) {
  const blob = String(formData.get("names") ?? "");
  const names = blob
    .split(/\r?\n/)
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  for (const name of names) {
    await prisma.excludedName.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  revalidatePath("/exclusions");
  revalidatePath("/reconcile");
}

export async function deleteExclusion(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.excludedName.delete({ where: { id } });
  revalidatePath("/exclusions");
  revalidatePath("/reconcile");
}
