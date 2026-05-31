import type { InvoiceAutomation } from "@prisma/client";
import * as mh from "./myhours";

export interface PreviewLine {
  projectName: string;       // raw MH project name
  description: string;       // what goes on the invoice line
  hours: number;
  rawAmount: number;         // billable amount from MyHours (pre-markup)
  markedUpAmount: number;    // rawAmount * (1 + markup%)
  invoiceAmount: number;     // markedUpAmount rounded to nearest pound
}

export interface InvoicePreview {
  automation: InvoiceAutomation;
  year: number;
  month: number;
  invoiceDate: string;
  dueDate: string;
  reference: string;
  lines: PreviewLine[];
  totalEx: number;       // ex VAT
  totalVat: number;
  totalInc: number;
}

// Build the line-item preview for a given automation + month. Pulls the
// month's logs from MyHours, filters to the configured client + task,
// aggregates per project, applies markup and rounding, and renders the
// invoice line descriptions.
export async function buildInvoicePreview(
  automation: InvoiceAutomation,
  year: number,
  month: number,
): Promise<InvoicePreview> {
  const range = mh.monthRange(year, month);
  const logs = await mh.listLogs(range.from, range.to);

  const clientFilter = automation.myHoursClient.trim().toLowerCase();
  const taskFilter = automation.taskFilter?.trim().toLowerCase() ?? null;

  // Group: projectName -> { hours, rawAmount }
  const byProject = new Map<string, { hours: number; rawAmount: number }>();
  for (const log of logs) {
    if (!log.clientName || log.clientName.trim().toLowerCase() !== clientFilter) continue;
    if (taskFilter && (log.taskName ?? "").trim().toLowerCase() !== taskFilter) continue;
    const project = (log.projectName ?? "").trim();
    if (!project) continue;
    const entry = byProject.get(project) ?? { hours: 0, rawAmount: 0 };
    entry.hours += (log.duration ?? 0) / 3600;
    entry.rawAmount += log.billableAmount ?? 0;
    byProject.set(project, entry);
  }

  const suffix = automation.lineSuffix ?? "";
  const markupFactor = 1 + (automation.markupPercent ?? 0) / 100;
  const minimumLine = Math.max(0, automation.minimumLineAmount ?? 0);

  // Strip the configured prefix from a project name. Tolerates minor input
  // variations: "UL", "UL-", "UL - " all match a project that starts with
  // any of "UL " / "UL- " / "UL - ", then any remaining separators / spaces
  // at the front are removed too.
  const rawPrefix = automation.projectPrefix ?? "";
  const corePrefix = rawPrefix.replace(/[\s\-–—:]+$/, "").trim();
  const stripPrefix = (name: string) => {
    if (!corePrefix) return name.trim();
    const trimmed = name.trimStart();
    if (trimmed.toLowerCase().startsWith(corePrefix.toLowerCase())) {
      return trimmed.slice(corePrefix.length).replace(/^[\s\-–—:]+/, "").trim();
    }
    return name.trim();
  };

  const lines: PreviewLine[] = [];
  for (const [project, agg] of byProject) {
    if (agg.rawAmount <= 0) continue;
    const markedUp = agg.rawAmount * markupFactor;
    // Round to the nearest pound first, then enforce the per-line minimum.
    // Order matters: a £15 marked-up amount rounds to £15, then gets floored
    // up to the £30 minimum rather than rounding £30 down to £15.
    const rounded = Math.round(markedUp);
    const invoiceAmount = Math.max(minimumLine, rounded);
    const subClient = stripPrefix(project);
    lines.push({
      projectName: project,
      description: `${subClient}${suffix}`,
      hours: Math.round(agg.hours * 100) / 100,
      rawAmount: Math.round(agg.rawAmount * 100) / 100,
      markedUpAmount: Math.round(markedUp * 100) / 100,
      invoiceAmount,
    });
  }
  lines.sort((a, b) => a.description.localeCompare(b.description));

  const totalEx = lines.reduce((s, l) => s + l.invoiceAmount, 0);
  const totalVat = Math.round((totalEx * (automation.vatRate ?? 0)) / 100 * 100) / 100;
  const totalInc = Math.round((totalEx + totalVat) * 100) / 100;

  // Invoice date = last day of the billed month. Due date = + paymentDueDays.
  const lastDay = new Date(Date.UTC(year, month, 0));
  const invoiceDate = formatDate(lastDay);
  const due = new Date(lastDay);
  due.setUTCDate(due.getUTCDate() + (automation.paymentDueDays ?? 30));
  const dueDate = formatDate(due);

  const monthLabel = lastDay.toLocaleString("en", { month: "long", year: "numeric" });
  const reference = (automation.referenceTemplate ?? "")
    .replace(/\{month\}/g, lastDay.toLocaleString("en", { month: "long" }))
    .replace(/\{year\}/g, String(year))
    .replace(/\{monthLabel\}/g, monthLabel)
    .trim();

  return {
    automation,
    year,
    month,
    invoiceDate,
    dueDate,
    reference,
    lines,
    totalEx,
    totalVat,
    totalInc,
  };
}

function formatDate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
