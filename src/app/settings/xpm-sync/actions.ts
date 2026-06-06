"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/permissions";
import { syncFromXpm, syncWithData, type XpmSyncResult } from "@/lib/xpm-sync";
import { parseClientsCsv, parseContactsCsv } from "@/lib/xpm-csv";

// Run the XPM sync via the live Practice Manager API. Requires the Xero
// connection to have the practicemanager scope granted.
export async function runXpmSync(): Promise<XpmSyncResult> {
  await requireRole("MANAGER");
  const result = await syncFromXpm(true);
  revalidatePath("/settings/xpm-sync");
  revalidatePath("/clients");
  return result;
}

// Run the XPM sync from CSV files exported from the XPM UI. Either or both
// of clientsCsv / contactsCsv can be provided.
export async function runXpmSyncFromCsv(formData: FormData): Promise<XpmSyncResult> {
  await requireRole("MANAGER");
  const clientsFile = formData.get("clients") as File | null;
  const contactsFile = formData.get("contacts") as File | null;

  let clientsText = "";
  let contactsText = "";
  if (clientsFile && clientsFile.size > 0) clientsText = await clientsFile.text();
  if (contactsFile && contactsFile.size > 0) contactsText = await contactsFile.text();

  if (!clientsText && !contactsText) {
    return {
      fetchedClients: 0,
      fetchedContacts: 0,
      clientsCreated: 0,
      clientsUpdated: 0,
      contactsCreated: 0,
      contactsUpdated: 0,
      contactsOrphaned: 0,
      errors: ["No CSV files supplied. Upload at least one."],
    };
  }

  const clients = clientsText ? parseClientsCsv(clientsText) : [];
  const contacts = contactsText ? parseContactsCsv(contactsText) : [];
  const result = await syncWithData(clients, contacts);
  revalidatePath("/settings/xpm-sync");
  revalidatePath("/clients");
  return result;
}
