"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import * as xero from "@/lib/xero";

const DISCOVERY_ID = "singleton";

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

export interface CachedDiscovery {
  data: xero.AccountCodeUsage[];
  monthsBack: number;
  fetchedAt: Date;
  fromCache: boolean;
  error: string | null;
}

// Get the latest cached discovery. Returns null if nothing's been fetched yet.
export async function getCachedDiscovery(): Promise<CachedDiscovery | null> {
  const row = await prisma.accountCodeDiscovery.findUnique({ where: { id: DISCOVERY_ID } });
  if (!row) return null;
  return {
    data: row.data as unknown as xero.AccountCodeUsage[],
    monthsBack: row.monthsBack,
    fetchedAt: row.fetchedAt,
    fromCache: true,
    error: null,
  };
}

// Re-fetch from Xero and overwrite the cache. On failure (most commonly a
// 429 rate-limit), redirect back to the page with the error in a search
// param so it renders inline instead of breaking the form action.
export async function refreshDiscovery(formData?: FormData): Promise<void> {
  const months = Number(formData?.get("months") ?? 6) || 6;
  try {
    const data = await xero.fetchAccountCodeUsage(months);
    await prisma.accountCodeDiscovery.upsert({
      where: { id: DISCOVERY_ID },
      create: { id: DISCOVERY_ID, data: data as unknown as object, monthsBack: months },
      update: { data: data as unknown as object, monthsBack: months, fetchedAt: new Date() },
    });
  } catch (e) {
    let msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("429")) {
      msg = "Xero rate limit hit (429). Wait ~60 seconds and try again — the limit resets every minute.";
    }
    redirect(`/account-exclusions?refresh_error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/account-exclusions");
  redirect("/account-exclusions?refreshed=1");
}
