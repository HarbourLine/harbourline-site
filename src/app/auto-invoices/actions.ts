"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import * as xero from "@/lib/xero";
import { buildInvoicePreview } from "@/lib/auto-invoice";

function parseXeroContact(raw: string): { id: string; name: string } | null {
  const pipe = raw.indexOf("|");
  if (pipe < 0) return null;
  const id = raw.slice(0, pipe).trim();
  const name = raw.slice(pipe + 1).trim();
  if (!id || !name) return null;
  return { id, name };
}

export async function saveAutomation(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  const xeroContactRaw = String(formData.get("xeroContact") ?? "").trim();
  const myHoursClient = String(formData.get("myHoursClient") ?? "").trim();
  const taskFilter = String(formData.get("taskFilter") ?? "").trim() || null;
  const projectPrefix = String(formData.get("projectPrefix") ?? "").trim() || null;
  const lineSuffix = String(formData.get("lineSuffix") ?? "").trim() || " - Bookkeeping Support";
  const markupPercent = Number(formData.get("markupPercent") ?? 0);
  const minimumLineAmount = Math.max(0, Number(formData.get("minimumLineAmount") ?? 0));
  const vatRate = Number(formData.get("vatRate") ?? 20);
  const taxType = String(formData.get("taxType") ?? "OUTPUT2").trim() || "OUTPUT2";
  const accountCode = String(formData.get("accountCode") ?? "200").trim() || "200";
  const referenceTemplate = String(formData.get("referenceTemplate") ?? "").trim() || null;
  const paymentDueDays = Math.max(0, Number(formData.get("paymentDueDays") ?? 30));

  if (!name || !xeroContactRaw || !myHoursClient) return;
  const contact = parseXeroContact(xeroContactRaw);
  if (!contact) return;

  if (id) {
    await prisma.invoiceAutomation.update({
      where: { id },
      data: {
        name,
        xeroContactId: contact.id,
        xeroContactName: contact.name,
        myHoursClient,
        taskFilter,
        projectPrefix,
        lineSuffix,
        markupPercent,
        minimumLineAmount,
        vatRate,
        taxType,
        accountCode,
        referenceTemplate,
        paymentDueDays,
      },
    });
  } else {
    await prisma.invoiceAutomation.create({
      data: {
        name,
        xeroContactId: contact.id,
        xeroContactName: contact.name,
        myHoursClient,
        taskFilter,
        projectPrefix,
        lineSuffix,
        markupPercent,
        minimumLineAmount,
        vatRate,
        taxType,
        accountCode,
        referenceTemplate,
        paymentDueDays,
      },
    });
  }
  revalidatePath("/auto-invoices");
  redirect("/auto-invoices");
}

export async function deleteAutomation(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.invoiceAutomation.delete({ where: { id } });
  revalidatePath("/auto-invoices");
}

export async function createDraftInvoiceFromForm(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const year = Number(formData.get("year") ?? 0);
  const month = Number(formData.get("month") ?? 0);
  if (!id || !year || !month) return;

  const automation = await prisma.invoiceAutomation.findUnique({ where: { id } });
  if (!automation) {
    redirect(`/auto-invoices/${id}/generate?error=${encodeURIComponent("Automation not found")}`);
  }

  const preview = await buildInvoicePreview(automation, year, month);
  if (preview.lines.length === 0) {
    redirect(
      `/auto-invoices/${id}/generate?year=${year}&month=${month}&error=${encodeURIComponent("No line items — nothing to invoice for that month.")}`,
    );
  }

  let created;
  try {
    created = await xero.createInvoice({
      contactId: automation.xeroContactId,
      date: preview.invoiceDate,
      dueDate: preview.dueDate,
      reference: preview.reference || undefined,
      status: "DRAFT",
      lineItems: preview.lines.map((l) => ({
        description: l.description,
        quantity: 1,
        unitAmount: l.invoiceAmount,
        accountCode: automation.accountCode,
        taxType: automation.taxType,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    redirect(
      `/auto-invoices/${id}/generate?year=${year}&month=${month}&error=${encodeURIComponent(msg)}`,
    );
  }

  redirect(
    `/auto-invoices/${id}/generate?year=${year}&month=${month}&created=${encodeURIComponent(created.invoiceNumber)}`,
  );
}
