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

  const prefix = automation.projectPrefix?.trim() ?? "";
  const suffix = automation.lineSuffix ?? "";
  const markupFactor = 1 + (automation.markupPercent ?? 0) / 100;

  // Strip the configured prefix from a project name (case-insensitive). Trim
  // any whitespace or separator characters left at the front afterwards.
  const stripPrefix = (name: string) => {
    if (!prefix) return name;
    const lower = name.toLowerCase();
    if (lower.startsWith(prefix.toLowerCase())) {
      return name.slice(prefix.length).replace(/^[\s\-–—:]+/, "").trim();
    }
    return name;
  };

  const lines: PreviewLine[] = [];
  for (const [project, agg] of byProject) {
    if (agg.rawAmount <= 0) continue;
    const markedUp = agg.rawAmount * markupFactor;
    const invoiceAmount = Math.round(markedUp);
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
