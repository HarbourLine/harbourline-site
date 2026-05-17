"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function upsertMapping(formData: FormData) {
  const myHoursClientId = String(formData.get("myHoursClientId") ?? "").trim();
  const myHoursName = String(formData.get("myHoursName") ?? "").trim();
  const xeroContactId = String(formData.get("xeroContactId") ?? "").trim();
  const xeroContactName = String(formData.get("xeroContactName") ?? "").trim();
  const rateStr = String(formData.get("hourlyRate") ?? "").trim();
  const hourlyRate = rateStr === "" ? null : Number(rateStr);

  if (!myHoursClientId || !xeroContactId) {
    throw new Error("MyHours client and Xero contact are required.");
  }
  if (hourlyRate != null && Number.isNaN(hourlyRate)) {
    throw new Error("Hourly rate must be a number.");
  }

  await prisma.clientMapping.upsert({
    where: { myHoursClientId },
    update: { myHoursName, xeroContactId, xeroContactName, hourlyRate },
    create: { myHoursClientId, myHoursName, xeroContactId, xeroContactName, hourlyRate },
  });
  revalidatePath("/mappings");
  revalidatePath("/reconcile");
}

export async function deleteMapping(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.clientMapping.delete({ where: { id } });
  revalidatePath("/mappings");
  revalidatePath("/reconcile");
}
