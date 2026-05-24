"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function upsertMapping(formData: FormData) {
  const myHoursClientName = String(formData.get("myHoursClientName") ?? "").trim();
  // Xero option value is "<contactId>|<contactName>" so we get both without
  // a second API roundtrip on save.
  const xeroCombined = String(formData.get("xeroContact") ?? "").trim();
  const sepIdx = xeroCombined.indexOf("|");
  const xeroContactId = sepIdx >= 0 ? xeroCombined.slice(0, sepIdx).trim() : xeroCombined;
  const xeroContactName = sepIdx >= 0 ? xeroCombined.slice(sepIdx + 1).trim() : "";

  const rateStr = String(formData.get("hourlyRate") ?? "").trim();
  const hourlyRate = rateStr === "" ? null : Number(rateStr);

  if (!myHoursClientName || !xeroContactId) {
    throw new Error("MyHours client and Xero contact are required.");
  }
  if (hourlyRate != null && Number.isNaN(hourlyRate)) {
    throw new Error("Hourly rate must be a number.");
  }

  await prisma.clientMapping.upsert({
    where: {
      myHoursClientName_xeroContactId: { myHoursClientName, xeroContactId },
    },
    update: { xeroContactName, hourlyRate },
    create: { myHoursClientName, xeroContactId, xeroContactName, hourlyRate },
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
