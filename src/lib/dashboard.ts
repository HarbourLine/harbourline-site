import { prisma } from "./db";
import { reconcileMonth, type ReconcileResult } from "./reconcile";

// Snapshots older than this are recomputed. Past months rarely change, but
// back-dated invoices and edits to mappings/exclusions do happen — a day's
// staleness is a reasonable trade for instant dashboard loads.
const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface DashboardMonth {
  year: number;
  month: number;
  label: string;          // "Apr 2026"
  shortLabel: string;     // "Apr"
  result: ReconcileResult;
}

export interface DashboardData {
  anchor: DashboardMonth;            // most recent completed month
  trend: DashboardMonth[];           // 6 months ending at anchor (chronological)
  comparison: DashboardMonth[];      // 3 months immediately before anchor
  deltas: {
    hours: number | null;
    billableHours: number | null;
    totalBilled: number | null;
    effectiveRate: number | null;
  };
  watchlist: WatchlistEntry[];
}

export interface WatchlistEntry {
  clientName: string;
  monthsBelow: number;               // count of months in window where rate < THRESHOLD
  perMonth: { year: number; month: number; rate: number | null; hours: number; billableHours: number }[];
  totalHours: number;                // tracked hours across the window (for context)
  totalBillableHours: number;        // billable hours across the window — denominator of avgRate
  totalBilled: number;
  avgRate: number | null;            // = totalBilled / totalBillableHours, matches per-month rate logic
}

const WATCHLIST_THRESHOLD = 35;
const WATCHLIST_MIN_OCCURRENCES = 2;

// "Last completed month" = current month - 1. We never show the in-progress
// current month on the dashboard; it's not a meaningful comparison until
// invoices have all landed in Xero.
export function getAnchorMonth(now: Date = new Date()): { year: number; month: number } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1-12
  if (m === 1) return { year: y - 1, month: 12 };
  return { year: y, month: m - 1 };
}

function monthsBefore(year: number, month: number, count: number): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  let y = year;
  let m = month;
  for (let i = 0; i < count; i++) {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    out.push({ year: y, month: m });
  }
  return out.reverse();
}

function monthLabel(year: number, month: number): { label: string; short: string } {
  const d = new Date(Date.UTC(year, month - 1, 1));
  const label = d.toLocaleString("en", { month: "short", year: "numeric" });
  const short = d.toLocaleString("en", { month: "short" });
  return { label, short };
}

async function getOrComputeSnapshot(
  year: number,
  month: number,
  forceRefresh = false,
): Promise<ReconcileResult> {
  const existing = await prisma.reconcileSnapshot.findUnique({ where: { year_month: { year, month } } });
  const fresh = existing && Date.now() - existing.updatedAt.getTime() < SNAPSHOT_MAX_AGE_MS;
  if (existing && fresh && !forceRefresh) {
    return existing.data as unknown as ReconcileResult;
  }
  const result = await reconcileMonth(year, month);
  await prisma.reconcileSnapshot.upsert({
    where: { year_month: { year, month } },
    create: { year, month, data: result as unknown as object },
    update: { data: result as unknown as object },
  });
  return result;
}

function safeDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export async function getDashboardData(forceRefresh = false): Promise<DashboardData> {
  const anchor = getAnchorMonth();
  // 5 months prior + the anchor = 6-month trend window.
  const window = [...monthsBefore(anchor.year, anchor.month, 5), anchor];

  const results = await Promise.all(
    window.map((m) => getOrComputeSnapshot(m.year, m.month, forceRefresh)),
  );

  const trend: DashboardMonth[] = window.map((m, i) => {
    const { label, short } = monthLabel(m.year, m.month);
    return { year: m.year, month: m.month, label, shortLabel: short, result: results[i] };
  });

  const anchorMonth = trend[trend.length - 1];
  const comparison = trend.slice(-4, -1); // 3 months before the anchor

  const compHours = average(comparison.map((m) => m.result.totals.hours));
  const compBillable = average(comparison.map((m) => m.result.totals.billableHours));
  const compBilled = average(comparison.map((m) => m.result.totals.totalBilled));
  const compRate = average(
    comparison.map((m) => m.result.totals.effectiveRate).filter((v): v is number => v != null),
  );

  const deltas = {
    hours: safeDelta(anchorMonth.result.totals.hours, compHours),
    billableHours: safeDelta(anchorMonth.result.totals.billableHours, compBillable),
    totalBilled: safeDelta(anchorMonth.result.totals.totalBilled, compBilled),
    effectiveRate:
      anchorMonth.result.totals.effectiveRate != null && compRate > 0
        ? safeDelta(anchorMonth.result.totals.effectiveRate, compRate)
        : null,
  };

  const watchlist = computeWatchlist(trend.slice(-3));

  return { anchor: anchorMonth, trend, comparison, deltas, watchlist };
}

function computeWatchlist(recent: DashboardMonth[]): WatchlistEntry[] {
  // Aggregate every client that appears in any of the recent months. For each,
  // count how many months their effective rate is below the threshold. New
  // clients with only one month of data still divide by their own billable
  // hours — never by months-in-window — so the average can't be artificially
  // dragged toward zero by months they didn't exist yet.
  const byClient = new Map<string, WatchlistEntry>();

  for (const month of recent) {
    for (const row of month.result.rows) {
      // Skip rows with no billable hours — their rate is either £40 (sub-1hr
      // fallback) or null, neither of which is signal worth flagging.
      if (row.billableHours < 1) continue;
      // Skip months where the client wasn't actually invoiced. These are
      // typically onboarding/setup time tracked before the first invoice goes
      // out; counting them as "rate = £0" would (a) wrongly flag the client
      // as below threshold for those months and (b) dilute the avg rate by
      // adding billable hours to the denominator with nothing in the
      // numerator. The watchlist is about pricing, not about whether we
      // invoiced — leave that latter concern to the reconcile page.
      if (row.totalBilled <= 0) continue;

      const existing = byClient.get(row.clientName) ?? {
        clientName: row.clientName,
        monthsBelow: 0,
        perMonth: [],
        totalHours: 0,
        totalBillableHours: 0,
        totalBilled: 0,
        avgRate: null,
      };
      existing.perMonth.push({
        year: month.year,
        month: month.month,
        rate: row.effectiveRate,
        hours: row.hours,
        billableHours: row.billableHours,
      });
      existing.totalHours += row.hours;
      existing.totalBillableHours += row.billableHours;
      existing.totalBilled += row.totalBilled;
      if (row.effectiveRate != null && row.effectiveRate < WATCHLIST_THRESHOLD) {
        existing.monthsBelow += 1;
      }
      byClient.set(row.clientName, existing);
    }
  }

  const flagged = [...byClient.values()].filter((e) => e.monthsBelow >= WATCHLIST_MIN_OCCURRENCES);
  for (const e of flagged) {
    // Divide by billable hours, matching the per-month rate calculation —
    // otherwise non-billable admin time pulls the average artificially low.
    e.avgRate = e.totalBillableHours > 0 ? round(e.totalBilled / e.totalBillableHours) : null;
    // Sort each row's per-month entries chronologically for display.
    e.perMonth.sort((a, b) => a.year - b.year || a.month - b.month);
  }
  // Worst (lowest avg rate) first.
  flagged.sort((a, b) => (a.avgRate ?? Infinity) - (b.avgRate ?? Infinity));
  return flagged;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// Pick the top N clients by billed £ in the anchor month and produce one
// stacked column per month with those clients (in fixed order) plus an
// "Others" segment for the long tail. Anchor-month ordering keeps the colours
// stable across the chart even when a smaller client briefly outranks a
// regular one in a historical month.
export const TOP_CLIENTS_N = 8;

export function buildTopClientColumns(trend: DashboardMonth[]): {
  columns: { label: string; segments: { key: string; label: string; value: number }[] }[];
  legend: { key: string; label: string; value: number }[];
} {
  if (trend.length === 0) return { columns: [], legend: [] };
  const anchor = trend[trend.length - 1];
  const sortedAnchor = [...anchor.result.rows]
    .filter((r) => r.totalBilled > 0)
    .sort((a, b) => b.totalBilled - a.totalBilled);
  const topRows = sortedAnchor.slice(0, TOP_CLIENTS_N);
  const topKeys = new Set(topRows.map((r) => r.clientName));

  const columns = trend.map((m) => {
    let othersTotal = 0;
    const segments: { key: string; label: string; value: number }[] = [];
    for (const row of m.result.rows) {
      if (row.totalBilled <= 0) continue;
      if (topKeys.has(row.clientName)) {
        segments.push({ key: row.clientName, label: row.clientName, value: row.totalBilled });
      } else {
        othersTotal += row.totalBilled;
      }
    }
    if (othersTotal > 0) {
      segments.push({ key: "__others__", label: "Others", value: othersTotal });
    }
    return { label: m.shortLabel, segments };
  });

  const legend = [
    ...topRows.map((r) => ({ key: r.clientName, label: r.clientName, value: r.totalBilled })),
    { key: "__others__", label: "Others", value: 0 },
  ];

  return { columns, legend };
}
