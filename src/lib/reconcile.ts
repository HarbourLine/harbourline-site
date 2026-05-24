import { prisma } from "./db";
import * as mh from "./myhours";
import * as xero from "./xero";

export interface ReconcileRow {
  // Combined display name (MyHours names joined; falls back to Xero if no MH).
  clientName: string;
  // All MyHours client names in this group (empty if the group is Xero-only).
  myHoursNames: string[];
  // All Xero contact IDs in this group (empty if MyHours-only).
  xeroContactIds: string[];
  hours: number;
  billableHours: number;
  invoicedAmount: number; // sum of Xero ACCREC invoice subtotals (ex VAT)
  invoiceCount: number;
  // Effective £/hr = invoicedAmount / billableHours (null if no billable hours).
  effectiveRate: number | null;
  status: "matched" | "unmapped" | "no-time" | "no-invoice";
}

export interface ReconcileResult {
  year: number;
  month: number;
  rows: ReconcileRow[];
  totals: {
    hours: number;
    billableHours: number;
    invoicedAmount: number;
    effectiveRate: number | null;
  };
  unmatchedXeroContacts: { contactId: string; name: string; invoicedAmount: number }[];
}

const UNASSIGNED = "(unassigned)";

interface RawMapping {
  myHoursClientName: string;
  xeroContactId: string;
  xeroContactName: string;
}

// Connected components: each (MH name) and (Xero contactId) is a node;
// each mapping row is an edge. Returns groups of (mh names, xero contacts).
function buildGroups(mappings: RawMapping[]) {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    if (!parent.has(k)) parent.set(k, k);
    let cur = k;
    while (parent.get(cur) !== cur) cur = parent.get(cur)!;
    // Path-compress
    let node = k;
    while (parent.get(node) !== cur) {
      const next = parent.get(node)!;
      parent.set(node, cur);
      node = next;
    }
    return cur;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const m of mappings) {
    union(`mh:${m.myHoursClientName}`, `xero:${m.xeroContactId}`);
  }

  const groups = new Map<
    string,
    { mhNames: Set<string>; xeroContacts: Map<string, string> }
  >();
  for (const m of mappings) {
    const root = find(`mh:${m.myHoursClientName}`);
    let g = groups.get(root);
    if (!g) {
      g = { mhNames: new Set(), xeroContacts: new Map() };
      groups.set(root, g);
    }
    g.mhNames.add(m.myHoursClientName);
    g.xeroContacts.set(m.xeroContactId, m.xeroContactName);
  }
  return [...groups.values()];
}

export async function reconcileMonth(year: number, month: number): Promise<ReconcileResult> {
  const range = mh.monthRange(year, month);

  const [logs, invoices, mappings, exclusions] = await Promise.all([
    mh.listLogs(range.from, range.to),
    xero.fetchInvoicesForMonth(year, month),
    prisma.clientMapping.findMany(),
    prisma.excludedName.findMany(),
  ]);

  const excludedLower = new Set(exclusions.map((e) => e.name.trim().toLowerCase()));
  const isExcluded = (name: string | null | undefined) =>
    !!name && excludedLower.has(name.trim().toLowerCase());

  // Aggregate MyHours logs by client name.
  type Agg = { hours: number; billableHours: number };
  const mhByName = new Map<string, Agg>();
  for (const log of logs) {
    if (isExcluded(log.clientName)) continue;
    const name = log.clientName ?? UNASSIGNED;
    const hours = (log.duration ?? 0) / 3600;
    const billableHours = log.billable ? (log.billableHours ?? hours) : 0;
    const existing = mhByName.get(name);
    if (existing) {
      existing.hours += hours;
      existing.billableHours += billableHours;
    } else {
      mhByName.set(name, { hours, billableHours });
    }
  }

  // Aggregate Xero invoices by contact.
  const xeroByContact = new Map<string, { invoiced: number; count: number; name: string }>();
  for (const inv of invoices) {
    if (isExcluded(inv.Contact.Name)) continue;
    const contactId = inv.Contact.ContactID;
    const existing = xeroByContact.get(contactId);
    const amount = inv.SubTotal ?? 0;
    if (existing) {
      existing.invoiced += amount;
      existing.count += 1;
    } else {
      xeroByContact.set(contactId, { invoiced: amount, count: 1, name: inv.Contact.Name });
    }
  }

  // Build groups from mappings (connected components).
  const groups = buildGroups(mappings);

  const rows: ReconcileRow[] = [];
  const seenMhNames = new Set<string>();
  const seenXeroIds = new Set<string>();

  for (const group of groups) {
    let hours = 0;
    let billableHours = 0;
    let invoiced = 0;
    let invoiceCount = 0;

    for (const mhName of group.mhNames) {
      seenMhNames.add(mhName);
      const agg = mhByName.get(mhName);
      if (agg) {
        hours += agg.hours;
        billableHours += agg.billableHours;
      }
    }
    for (const [contactId] of group.xeroContacts) {
      seenXeroIds.add(contactId);
      const agg = xeroByContact.get(contactId);
      if (agg) {
        invoiced += agg.invoiced;
        invoiceCount += agg.count;
      }
    }

    const mhNamesArr = [...group.mhNames].sort();
    const xeroNamesArr = [...group.xeroContacts.values()].sort();
    const display =
      mhNamesArr.length > 0 ? mhNamesArr.join(" · ") : xeroNamesArr.join(" · ");

    let status: ReconcileRow["status"];
    if (hours === 0 && billableHours === 0 && invoiceCount > 0) status = "no-time";
    else if (invoiceCount === 0 && (hours > 0 || billableHours > 0)) status = "no-invoice";
    else status = "matched";

    rows.push({
      clientName: display,
      myHoursNames: mhNamesArr,
      xeroContactIds: [...group.xeroContacts.keys()],
      hours: round(hours),
      billableHours: round(billableHours),
      invoicedAmount: round(invoiced),
      invoiceCount,
      effectiveRate: billableHours > 0 ? round(invoiced / billableHours) : null,
      status,
    });
  }

  // MyHours clients with no mapping at all.
  for (const [name, agg] of mhByName) {
    if (seenMhNames.has(name)) continue;
    rows.push({
      clientName: name,
      myHoursNames: [name],
      xeroContactIds: [],
      hours: round(agg.hours),
      billableHours: round(agg.billableHours),
      invoicedAmount: 0,
      invoiceCount: 0,
      effectiveRate: null,
      status: "unmapped",
    });
  }

  // Xero contacts with no mapping at all.
  const unmatchedXeroContacts: ReconcileResult["unmatchedXeroContacts"] = [];
  for (const [contactId, agg] of xeroByContact) {
    if (seenXeroIds.has(contactId)) continue;
    unmatchedXeroContacts.push({
      contactId,
      name: agg.name,
      invoicedAmount: round(agg.invoiced),
    });
  }

  rows.sort((a, b) => b.invoicedAmount + b.billableHours - (a.invoicedAmount + a.billableHours));

  const totals = rows.reduce(
    (acc, r) => {
      acc.hours += r.hours;
      acc.billableHours += r.billableHours;
      acc.invoicedAmount += r.invoicedAmount;
      return acc;
    },
    { hours: 0, billableHours: 0, invoicedAmount: 0 },
  );

  return {
    year,
    month,
    rows,
    totals: {
      hours: round(totals.hours),
      billableHours: round(totals.billableHours),
      invoicedAmount: round(totals.invoicedAmount),
      effectiveRate:
        totals.billableHours > 0 ? round(totals.invoicedAmount / totals.billableHours) : null,
    },
    unmatchedXeroContacts,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
