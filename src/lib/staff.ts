import { getAnchorMonth } from "./dashboard";
import { prisma } from "./db";
import { reconcileMonth, type StaffSummary } from "./reconcile";

const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface StaffMonth {
  year: number;
  month: number;
  label: string;
  shortLabel: string;
  staff: StaffSummary[];
}

export interface StaffRow {
  userId: number;
  userName: string;
  perMonth: Map<string, StaffSummary>;     // key = "YYYY-MM"
  anchor: StaffSummary | null;
  // Aggregated totals across the 3-month comparison window (anchor excluded).
  comparison: { hours: number; billableHours: number; earnedAmount: number };
  deltas: {
    hours: number | null;
    billableHours: number | null;
    earnedAmount: number | null;
    effectiveRate: number | null;
    billablePercent: number | null;
  };
}

export interface StaffDashboardData {
  anchor: StaffMonth;
  trend: StaffMonth[];            // 6 months including the anchor (chronological)
  rows: StaffRow[];               // one per staff member, sorted by anchor earned £ desc
  firmTotals: {
    hours: number;
    billableHours: number;
    earnedAmount: number;
    effectiveRate: number | null;
    billablePercent: number | null;
  };
}

function monthsBefore(year: number, month: number, count: number) {
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
  return {
    label: d.toLocaleString("en", { month: "short", year: "numeric" }),
    short: d.toLocaleString("en", { month: "short" }),
  };
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

async function getSnapshotStaff(year: number, month: number): Promise<StaffSummary[]> {
  const existing = await prisma.reconcileSnapshot.findUnique({ where: { year_month: { year, month } } });
  const fresh = existing && Date.now() - existing.updatedAt.getTime() < SNAPSHOT_MAX_AGE_MS;
  if (existing && fresh) {
    const data = existing.data as unknown as { staff?: StaffSummary[] };
    if (Array.isArray(data.staff)) return data.staff;
  }
  // Either no snapshot, stale, or pre-staff-feature snapshot — recompute.
  const result = await reconcileMonth(year, month);
  await prisma.reconcileSnapshot.upsert({
    where: { year_month: { year, month } },
    create: { year, month, data: result as unknown as object },
    update: { data: result as unknown as object },
  });
  return result.staff;
}

function safeDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

export async function getStaffDashboardData(): Promise<StaffDashboardData> {
  const anchor = getAnchorMonth();
  const window = [...monthsBefore(anchor.year, anchor.month, 5), anchor];

  // Excluded team members are hidden from the page entirely — both as rows
  // and as contributors to the firm-level totals. Their hours and earnings
  // still flow through the client-side calculations (dashboard, reconcile,
  // watchlist), since exclusion here only changes the /team view.
  const excludedTeamMembers = await prisma.excludedTeamMember.findMany();
  const excludedUserIds = new Set(excludedTeamMembers.map((e) => e.userId));

  const monthData = await Promise.all(
    window.map(async (m): Promise<StaffMonth> => {
      const allStaff = await getSnapshotStaff(m.year, m.month);
      const staff = allStaff.filter((s) => !excludedUserIds.has(s.userId));
      const { label, short } = monthLabel(m.year, m.month);
      return { year: m.year, month: m.month, staff, label, shortLabel: short };
    }),
  );

  const anchorMonth = monthData[monthData.length - 1];
  const comparisonMonths = monthData.slice(-4, -1);

  // Collect every staff member who appears anywhere in the window.
  const userMap = new Map<number, { userId: number; userName: string }>();
  for (const m of monthData) {
    for (const s of m.staff) {
      if (!userMap.has(s.userId)) userMap.set(s.userId, { userId: s.userId, userName: s.userName });
    }
  }

  const rows: StaffRow[] = [];
  for (const u of userMap.values()) {
    const perMonth = new Map<string, StaffSummary>();
    for (const m of monthData) {
      const entry = m.staff.find((s) => s.userId === u.userId);
      if (entry) perMonth.set(monthKey(m.year, m.month), entry);
    }
    const anchorEntry = perMonth.get(monthKey(anchorMonth.year, anchorMonth.month)) ?? null;
    const compEntries = comparisonMonths
      .map((m) => perMonth.get(monthKey(m.year, m.month)))
      .filter((s): s is StaffSummary => !!s);
    const compHours = compEntries.reduce((s, e) => s + e.hours, 0) / Math.max(compEntries.length, 1);
    const compBillable =
      compEntries.reduce((s, e) => s + e.billableHours, 0) / Math.max(compEntries.length, 1);
    const compEarned =
      compEntries.reduce((s, e) => s + e.earnedAmount, 0) / Math.max(compEntries.length, 1);
    const compRate =
      compEntries.reduce((s, e) => s + e.billableHours, 0) > 0
        ? compEntries.reduce((s, e) => s + e.earnedAmount, 0) /
          compEntries.reduce((s, e) => s + e.billableHours, 0)
        : 0;
    const compPercent =
      compEntries.reduce((s, e) => s + e.hours, 0) > 0
        ? compEntries.reduce((s, e) => s + e.billableHours, 0) /
          compEntries.reduce((s, e) => s + e.hours, 0)
        : 0;

    rows.push({
      userId: u.userId,
      userName: u.userName,
      perMonth,
      anchor: anchorEntry,
      comparison: { hours: compHours, billableHours: compBillable, earnedAmount: compEarned },
      deltas: {
        hours: anchorEntry ? safeDelta(anchorEntry.hours, compHours) : null,
        billableHours: anchorEntry ? safeDelta(anchorEntry.billableHours, compBillable) : null,
        earnedAmount: anchorEntry ? safeDelta(anchorEntry.earnedAmount, compEarned) : null,
        effectiveRate:
          anchorEntry?.effectiveRate != null && compRate > 0
            ? safeDelta(anchorEntry.effectiveRate, compRate)
            : null,
        billablePercent:
          anchorEntry?.billablePercent != null && compPercent > 0
            ? safeDelta(anchorEntry.billablePercent, compPercent)
            : null,
      },
    });
  }

  // Sort: anchor earned £ desc, then anyone with no anchor data at the bottom.
  rows.sort((a, b) => (b.anchor?.earnedAmount ?? -1) - (a.anchor?.earnedAmount ?? -1));

  const firmHours = anchorMonth.staff.reduce((s, e) => s + e.hours, 0);
  const firmBillable = anchorMonth.staff.reduce((s, e) => s + e.billableHours, 0);
  const firmEarned = anchorMonth.staff.reduce((s, e) => s + e.earnedAmount, 0);

  return {
    anchor: anchorMonth,
    trend: monthData,
    rows,
    firmTotals: {
      hours: firmHours,
      billableHours: firmBillable,
      earnedAmount: firmEarned,
      effectiveRate: firmBillable > 0 ? firmEarned / firmBillable : null,
      billablePercent: firmHours > 0 ? firmBillable / firmHours : null,
    },
  };
}
