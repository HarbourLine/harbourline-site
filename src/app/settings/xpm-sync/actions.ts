"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/permissions";
import { syncFromXpm, type XpmSyncResult } from "@/lib/xpm-sync";

// Run the XPM sync and return the result. Server action returns are
// surfaced on the page via the form's response — for our use we keep the
// result in memory by writing it into the page's URL search params on
// redirect; easier just to refetch counts after the action runs.
export async function runXpmSync(): Promise<XpmSyncResult> {
  await requireRole("MANAGER");
  const result = await syncFromXpm(true);
  revalidatePath("/settings/xpm-sync");
  revalidatePath("/clients");
  return result;
}
