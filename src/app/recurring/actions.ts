"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

function parseYearMonth(input: string): string | null {
  const s = input.trim();
  if (s === "") return null;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) {
    throw new Error(`Date must be YYYY-MM (e.g. 2026-05), got "${s}".`);
  }
  return s;
}

function parseOptionalXeroContact(value: string): { id: string | null; name: string | null } {
  const v = value.trim();
  if (v === "") return { id: null, name: null };
  const sep = v.indexOf("|");
  if (sep < 0) return { id: v, name: null };
  return { id: v.slice(0, sep).trim(), name: v.slice(sep + 1).trim() };
}

export async function upsertRecurring(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const amountStr = String(formData.get("amount") ?? "").trim();
  const myHoursClientName = String(formData.get("myHoursClientName") ?? "").trim() || null;
  const xero = parseOptionalXeroContact(String(formData.get("xeroContact") ?? ""));
  const effectiveFrom = parseYearMonth(String(formData.get("effectiveFrom") ?? ""));
  const effectiveTo = parseYearMonth(String(formData.get("effectiveTo") ?? ""));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name) throw new Error("Name is required.");
  const amount = Number(amountStr);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be a positive number.");
  if (!myHoursClientName && !xero.id) {
    throw new Error("Pick a MyHours client and/or a Xero contact so we know where to attach this.");
  }

  const data = {
    name,
    amount,
    myHoursClientName,
    xeroContactId: xero.id,
    xeroContactName: xero.name,
    effectiveFrom,
    effectiveTo,
    notes,
  };

  if (id) {
    await prisma.recurringBilling.update({ where: { id }, data });
  } else {
    await prisma.recurringBilling.create({ data });
  }
  revalidatePath("/recurring");
  revalidatePath("/reconcile");
}

export async function deleteRecurring(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.recurringBilling.delete({ where: { id } });
  revalidatePath("/recurring");
  revalidatePath("/reconcile");
}
