import { prisma } from "./db";
import * as mh from "./myhours";
import * as xero from "./xero";

export interface ReconcileRow {
  // Display name: prefers the mapped Xero contact name; falls back to MyHours client name.
  clientName: string;
  myHoursClientName: string | null;
  xeroContactId: string | null;
  hours: number;
  billableHours: number;
  hourlyRate: number | null;
  impliedAmount: number | null; // billableHours * hourlyRate when known
  invoicedAmount: number; // sum of Xero ACCREC invoice subtotals (ex VAT)
  invoiceCount: number;
  variance: number | null; // invoicedAmount - impliedAmount
  status: "matched" | "unmapped" | "no-time" | "no-invoice";
}

export interface ReconcileResult {
  year: number;
  month: number;
  defaultRate: number;
  rows: ReconcileRow[];
  totals: {
    hours: number;
    billableHours: number;
    impliedAmount: number;
    invoicedAmount: number;
    variance: number;
  };
  unmatchedXeroContacts: { contactId: string; name: string; invoicedAmount: number }[];
}

const UNASSIGNED = "(unassigned)";

export async function reconcileMonth(year: number, month: number): Promise<ReconcileResult> {
  const defaultRate = Number(process.env.DEFAULT_HOURLY_RATE ?? 0);
  const range = mh.monthRange(year, month);

  const [logs, invoices, mappings] = await Promise.all([
    mh.listLogs(range.from, range.to),
    xero.fetchInvoicesForMonth(year, month),
    prisma.clientMapping.findMany(),
  ]);

  // Mappings are keyed by MyHours client name (since MyHours' log API
  // doesn't expose a client ID per entry).
  const mappingByName = new Map(mappings.map((m) => [m.myHoursClientName, m]));
  const mappingByXero = new Map(mappings.map((m) => [m.xeroContactId, m]));

  // Aggregate MyHours logs by client name.
  type Agg = { hours: number; billableHours: number; name: string };
  const byClient = new Map<string, Agg>();
  for (const log of logs) {
    const name = log.clientName ?? UNASSIGNED;
    const hours = (log.duration ?? 0) / 3600;
    const billableHours = log.billable
      ? (log.billableHours ?? hours)
      : 0;
    const existing = byClient.get(name);
    if (existing) {
      existing.hours += hours;
      existing.billableHours += billableHours;
    } else {
      byClient.set(name, { hours, billableHours, name });
    }
  }

  // Aggregate Xero invoices by contact.
  const byContact = new Map<string, { invoiced: number; count: number; name: string }>();
  for (const inv of invoices) {
    const contactId = inv.Contact.ContactID;
    const existing = byContact.get(contactId);
    const amount = inv.SubTotal ?? 0; // ex VAT
    if (existing) {
      existing.invoiced += amount;
      existing.count += 1;
    } else {
      byContact.set(contactId, { invoiced: amount, count: 1, name: inv.Contact.Name });
    }
  }

  const rows: ReconcileRow[] = [];
  const seenXeroContacts = new Set<string>();

  for (const [name, agg] of byClient) {
    const mapping = mappingByName.get(name);
    const xeroContactId = mapping?.xeroContactId ?? null;
    const xeroAgg = xeroContactId ? byContact.get(xeroContactId) : undefined;
    if (xeroContactId) seenXeroContacts.add(xeroContactId);

    const rate = mapping?.hourlyRate ?? (defaultRate > 0 ? defaultRate : null);
    const impliedAmount = rate != null ? agg.billableHours * rate : null;
    const invoicedAmount = xeroAgg?.invoiced ?? 0;
    const invoiceCount = xeroAgg?.count ?? 0;

    let status: ReconcileRow["status"];
    if (!mapping) status = "unmapped";
    else if (invoiceCount === 0) status = "no-invoice";
    else status = "matched";

    rows.push({
      clientName: mapping?.xeroContactName ?? agg.name,
      myHoursClientName: agg.name === UNASSIGNED ? null : agg.name,
      xeroContactId,
      hours: round(agg.hours),
      billableHours: round(agg.billableHours),
      hourlyRate: rate,
      impliedAmount: impliedAmount == null ? null : round(impliedAmount),
      invoicedAmount: round(invoicedAmount),
      invoiceCount,
      variance: impliedAmount == null ? null : round(invoicedAmount - impliedAmount),
      status,
    });
  }

  // Xero contacts billed this month but with no tracked time (or no mapping pointing to them).
  const unmatchedXeroContacts: ReconcileResult["unmatchedXeroContacts"] = [];
  for (const [contactId, agg] of byContact) {
    if (seenXeroContacts.has(contactId)) continue;
    const mapping = mappingByXero.get(contactId);
    if (mapping) {
      // Mapped, but the MyHours side had no logs this month.
      rows.push({
        clientName: mapping.xeroContactName,
        myHoursClientName: mapping.myHoursClientName,
        xeroContactId: contactId,
        hours: 0,
        billableHours: 0,
        hourlyRate: mapping.hourlyRate ?? (defaultRate > 0 ? defaultRate : null),
        impliedAmount: 0,
        invoicedAmount: round(agg.invoiced),
        invoiceCount: agg.count,
        variance: round(agg.invoiced),
        status: "no-time",
      });
    } else {
      unmatchedXeroContacts.push({
        contactId,
        name: agg.name,
        invoicedAmount: round(agg.invoiced),
      });
    }
  }

  rows.sort((a, b) => b.invoicedAmount + b.billableHours - (a.invoicedAmount + a.billableHours));

  const totals = rows.reduce(
    (acc, r) => {
      acc.hours += r.hours;
      acc.billableHours += r.billableHours;
      acc.impliedAmount += r.impliedAmount ?? 0;
      acc.invoicedAmount += r.invoicedAmount;
      acc.variance += r.variance ?? 0;
      return acc;
    },
    { hours: 0, billableHours: 0, impliedAmount: 0, invoicedAmount: 0, variance: 0 },
  );

  return {
    year,
    month,
    defaultRate,
    rows,
    totals: {
      hours: round(totals.hours),
      billableHours: round(totals.billableHours),
      impliedAmount: round(totals.impliedAmount),
      invoicedAmount: round(totals.invoicedAmount),
      variance: round(totals.variance),
    },
    unmatchedXeroContacts,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
