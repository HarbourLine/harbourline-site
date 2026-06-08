"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/permissions";
import { migrateFromClientMappings } from "@/lib/client-migration";

type ClientStatus = "LEAD" | "ONBOARDING" | "ACTIVE" | "DORMANT" | "OFFBOARDED";
type AmlStatus = "NOT_REQUIRED" | "PENDING" | "PASSED" | "EXPIRED" | "REJECTED";

const VALID_STATUSES: ClientStatus[] = [
  "LEAD",
  "ONBOARDING",
  "ACTIVE",
  "DORMANT",
  "OFFBOARDED",
];
const VALID_AML: AmlStatus[] = ["NOT_REQUIRED", "PENDING", "PASSED", "EXPIRED", "REJECTED"];

function parseDate(raw: FormDataEntryValue | null): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseFloatOrNull(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

function commonFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "ACTIVE") as ClientStatus;
  const status: ClientStatus = VALID_STATUSES.includes(statusRaw) ? statusRaw : "ACTIVE";
  const amlRaw = String(formData.get("amlStatus") ?? "NOT_REQUIRED") as AmlStatus;
  const amlStatus: AmlStatus = VALID_AML.includes(amlRaw) ? amlRaw : "NOT_REQUIRED";
  const accountManagerId = String(formData.get("accountManagerId") ?? "").trim() || null;
  return {
    name,
    status,
    amlStatus,
    companyNumber: String(formData.get("companyNumber") ?? "").trim() || null,
    companiesHouseAuthCode:
      String(formData.get("companiesHouseAuthCode") ?? "").trim() || null,
    vatNumber: String(formData.get("vatNumber") ?? "").trim() || null,
    utr: String(formData.get("utr") ?? "").trim() || null,
    payeReference: String(formData.get("payeReference") ?? "").trim() || null,
    accountsOfficeReference:
      String(formData.get("accountsOfficeReference") ?? "").trim() || null,
    tradingAddress: String(formData.get("tradingAddress") ?? "").trim() || null,
    financialYearEnd: parseDate(formData.get("financialYearEnd")),
    defaultHourlyRate: parseFloatOrNull(formData.get("defaultHourlyRate")),
    accountManagerId,
    amlExpiresAt: parseDate(formData.get("amlExpiresAt")),
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

export async function createClient(formData: FormData) {
  await requireRole("MANAGER");
  const data = commonFields(formData);
  if (!data.name) return;
  const created = await prisma.client.create({ data });
  revalidatePath("/clients");
  redirect(`/clients/${created.id}`);
}

export async function updateClient(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const data = commonFields(formData);
  if (!data.name) return;
  await prisma.client.update({ where: { id }, data });
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}`);
}

export async function deleteClient(formData: FormData) {
  await requireRole("OWNER");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.client.delete({ where: { id } });
  revalidatePath("/clients");
  redirect("/clients");
}

// Link management — staying minimal for now: add by typing a source +
// external key (MyHours name or Xero contact id|name). Pickers come later.
export async function addLink(formData: FormData) {
  await requireRole("MANAGER");
  const clientId = String(formData.get("clientId") ?? "");
  const source = String(formData.get("source") ?? "").trim();
  const externalKey = String(formData.get("externalKey") ?? "").trim();
  const externalName = String(formData.get("externalName") ?? "").trim() || null;
  if (!clientId || !source || !externalKey) return;
  if (source !== "myhours" && source !== "xero") return;
  await prisma.clientLink.create({
    data: { clientId, source, externalKey, externalName },
  });
  revalidatePath(`/clients/${clientId}`);
}

export async function removeLink(formData: FormData) {
  await requireRole("MANAGER");
  const id = String(formData.get("id") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  if (!id) return;
  await prisma.clientLink.delete({ where: { id } });
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

export async function runMigration() {
  await requireRole("OWNER");
  const result = await migrateFromClientMappings();
  revalidatePath("/clients");
  return result;
}
