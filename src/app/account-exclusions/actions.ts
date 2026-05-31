"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

// Any change to excluded account codes invalidates every cached
// reconciliation snapshot, since the line-item totals could differ.
async function bustReconcileCache() {
  await prisma.reconcileSnapshot.deleteMany();
  await prisma.aISummary.deleteMany();
}

export async function addExclusion(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim() || null;
  if (!code) return;
  await prisma.excludedAccountCode.upsert({
    where: { code },
    create: { code, name },
    update: { name: name ?? undefined },
  });
  await bustReconcileCache();
  revalidatePath("/account-exclusions");
  revalidatePath("/");
  revalidatePath("/reconcile");
}

export async function removeExclusion(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.excludedAccountCode.delete({ where: { id } });
  await bustReconcileCache();
  revalidatePath("/account-exclusions");
  revalidatePath("/");
  revalidatePath("/reconcile");
}
