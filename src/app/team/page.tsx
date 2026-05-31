import { prisma } from "@/lib/db";
import { getStaffDashboardData, type StaffDashboardData, type StaffRow } from "@/lib/staff";
import { getOrCreateTeamSummary } from "@/lib/team-ai-summary";
import { StackedBarChart, buildColourFor, type BarColumn } from "@/components/StackedBarChart";

export const dynamic = "force-dynamic";
// Same shape as the dashboard: cold first load (~30s for 6 months), then
// cached snapshot reads (~1s) until staleness kicks in.
export const maxDuration = 60;

export default async function StaffPage() {
  const xeroConn = await prisma.xeroConnection.findFirst();
  const myHoursReady = Boolean(process.env.MYHOURS_API_KEY);
  const anthropicConfigured = Boolean(process.env.ANTHROPIC_API_KEY);
  const ready = xeroConn && myHoursReady;

  let data: StaffDashboardData | null = null;
  let runError: string | null = null;
  let aiSummary: string | null = null;
  if (ready) {
    try {
      data = await getStaffDashboardData();
      if (anthropicConfigured) {
        const result = await getOrCreateTeamSummary(data);
        aiSummary = result?.content ?? null;
      }
    } catch (e) {
      runError = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-sm opacity-70 mt-1">
          {data
            ? `Per-person hours and earned £ for ${data.anchor.label}, with deltas vs the prior 3-month average. Earned £ allocates each client's billed total across the team members who worked on it that month, in proportion to billable-hour share.`
            : "Per-person hours, earned £, and utilisation."}
        </p>
      </header>

      {!ready && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          MyHours + Xero need to be connected before team data is available.
        </div>
      )}

      {runError && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
          {runError}
        </div>
      )}

      {data && (
        <StaffView data={data} aiSummary={aiSummary} anthropicConfigured={anthropicConfigured} />
      )}
    </div>
  );
}

function StaffView({
  data,
  aiSummary,
  anthropicConfigured,
}: {
  data: StaffDashboardData;
  aiSummary: string | null;
  anthropicConfigured: boolean;
}) {
  const fmtMoney = (n: number | null) =>
    n == null
      ? "—"
      : n.toLocaleString("en", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
  const fmtRate = (n: number | null) =>
    n == null
      ? "—"
      : n.toLocaleString("en", { style: "currency", currency: "GBP", maximumFractionDigits: 2 }) +
        "/hr";
  const fmtHrs = (n: number) => n.toLocaleString("en", { maximumFractionDigits: 1 });
  const fmtPct = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(0)}%`);

  // Assign colours by anchor-month sort order so the biggest earners get the
  // most distinct primary colours; reused across both charts so each person
  // is the same colour everywhere.
  const orderedUserIds = data.rows.map((r) => String(r.userId));
  const colourFor = buildColourFor(orderedUserIds);
  const legend = data.rows
    .filter((r) => r.anchor && r.anchor.earnedAmount > 0)
    .map((r) => ({ key: String(r.userId), label: r.userName, value: r.anchor?.earnedAmount ?? 0 }));

  const earnedColumns: BarColumn[] = data.trend.map((m) => ({
    label: m.shortLabel,
    segments: m.staff.map((s) => ({
      key: String(s.userId),
      label: s.userName,
      value: s.earnedAmount,
    })),
  }));

  const overRunColumns: BarColumn[] = data.trend.map((m) => ({
    label: m.shortLabel,
    segments: m.staff.map((s) => ({
      key: String(s.userId),
      label: s.userName,
      value: s.overRunHours ?? 0,
    })),
  }));

  return (
    <>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Team hours" value={fmtHrs(data.firmTotals.hours)} />
        <Stat label="Billable hours" value={fmtHrs(data.firmTotals.billableHours)} />
        <Stat label="Earned (ex VAT)" value={fmtMoney(data.firmTotals.earnedAmount)} />
        <Stat
          label="% billable"
          value={fmtPct(data.firmTotals.billablePercent)}
          sub={`Effective ${fmtRate(data.firmTotals.effectiveRate)}`}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-black/10 dark:border-white/10 p-4">
          <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
            <h2 className="font-medium">Earned £ per person</h2>
            <span className="text-xs opacity-60">Last 6 months</span>
          </div>
          <StackedBarChart format="money" data={earnedColumns} colourFor={colourFor} legend={legend} />
        </div>

        <div className="rounded-lg border border-black/10 dark:border-white/10 p-4">
          <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
            <h2 className="font-medium">Over-run hours per person</h2>
            <span className="text-xs opacity-60">Time not covered by client invoices</span>
          </div>
          <StackedBarChart format="hours" data={overRunColumns} colourFor={colourFor} legend={legend} />
        </div>
      </section>

      <section className="rounded-lg border border-black/10 dark:border-white/10 p-4">
        <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
          <h2 className="font-medium">By person — {data.anchor.label}</h2>
          <span className="text-xs opacity-60">
            Δ shown vs the average of the preceding 3 months
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left">
              <tr className="border-b border-black/10 dark:border-white/10">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 px-3 font-medium text-right">Hours</th>
                <th className="py-2 px-3 font-medium text-right">Billable</th>
                <th className="py-2 px-3 font-medium text-right">Over-run</th>
                <th className="py-2 px-3 font-medium text-right">% billable</th>
                <th className="py-2 px-3 font-medium text-right">Earned £</th>
                <th className="py-2 px-3 font-medium text-right">£/hr</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <StaffTableRow
                  key={row.userId}
                  row={row}
                  fmtMoney={fmtMoney}
                  fmtRate={fmtRate}
                  fmtHrs={fmtHrs}
                  fmtPct={fmtPct}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-black/10 dark:border-white/10 p-4">
        <h2 className="font-medium mb-3">Analysis</h2>
        {anthropicConfigured ? (
          aiSummary ? (
            <div className="space-y-3">
              {aiSummary.split(/\n\n+/).map((para, i) => (
                <p key={i} className="text-sm leading-relaxed">{para}</p>
              ))}
            </div>
          ) : (
            <p className="text-sm opacity-70">Generating analysis…</p>
          )
        ) : (
          <p className="text-sm opacity-70">
            Add <code className="font-mono">ANTHROPIC_API_KEY</code> to enable the AI commentary.
          </p>
        )}
      </section>
    </>
  );
}

function StaffTableRow({
  row,
  fmtMoney,
  fmtRate,
  fmtHrs,
  fmtPct,
}: {
  row: StaffRow;
  fmtMoney: (n: number | null) => string;
  fmtRate: (n: number | null) => string;
  fmtHrs: (n: number) => string;
  fmtPct: (n: number | null) => string;
}) {
  const anchor = row.anchor;
  return (
    <tr className="border-b border-black/5 dark:border-white/5 last:border-0">
      <td className="py-2 pr-3 font-medium">{row.userName}</td>
      <td className="py-2 px-3 text-right tabular-nums">
        <Cell value={anchor ? fmtHrs(anchor.hours) : "—"} delta={row.deltas.hours} />
      </td>
      <td className="py-2 px-3 text-right tabular-nums">
        <Cell value={anchor ? fmtHrs(anchor.billableHours) : "—"} delta={row.deltas.billableHours} />
      </td>
      <td className="py-2 px-3 text-right tabular-nums">
        <OverRunCell anchor={anchor} delta={row.deltas.overRunHours} fmtHrs={fmtHrs} />
      </td>
      <td className="py-2 px-3 text-right tabular-nums">
        <Cell
          value={anchor ? fmtPct(anchor.billablePercent) : "—"}
          delta={row.deltas.billablePercent}
        />
      </td>
      <td className="py-2 px-3 text-right tabular-nums">
        <Cell value={anchor ? fmtMoney(anchor.earnedAmount) : "—"} delta={row.deltas.earnedAmount} />
      </td>
      <td className="py-2 px-3 text-right tabular-nums">
        <Cell value={anchor ? fmtRate(anchor.effectiveRate) : "—"} delta={row.deltas.effectiveRate} />
      </td>
    </tr>
  );
}

function Cell({ value, delta }: { value: string; delta: number | null }) {
  const positive = delta != null && delta > 0;
  const colour =
    delta == null
      ? "opacity-50"
      : positive
        ? "text-emerald-700 dark:text-emerald-300"
        : "text-red-700 dark:text-red-300";
  return (
    <div>
      <div>{value}</div>
      <div className={`text-[10px] ${colour}`}>
        {delta == null ? "—" : `${positive ? "↑" : "↓"} ${(Math.abs(delta) * 100).toFixed(0)}%`}
      </div>
    </div>
  );
}

// Over-run is special: more = worse, opposite of every other column. Coloured
// red when it's a non-trivial portion of billable time, neutral otherwise.
function OverRunCell({
  anchor,
  delta,
  fmtHrs,
}: {
  anchor: { overRunHours?: number; billableHours: number } | null;
  delta: number | null;
  fmtHrs: (n: number) => string;
}) {
  if (!anchor) {
    return (
      <div>
        <div>—</div>
        <div className="text-[10px] opacity-50">—</div>
      </div>
    );
  }
  const overRun = anchor.overRunHours ?? 0;
  const fraction = anchor.billableHours > 0 ? overRun / anchor.billableHours : 0;
  // > 10% of billable hours in over-run is worth flagging.
  const significant = fraction >= 0.1 && overRun >= 1;
  const valueClass = significant
    ? "text-red-700 dark:text-red-300 font-medium"
    : "";
  // For deltas, an INCREASE in over-run is bad (red), a DECREASE is good (green) —
  // inverted from the other columns where up is good.
  const positive = delta != null && delta > 0;
  const colour =
    delta == null
      ? "opacity-50"
      : positive
        ? "text-red-700 dark:text-red-300"
        : "text-emerald-700 dark:text-emerald-300";
  return (
    <div>
      <div className={valueClass}>{fmtHrs(overRun)}</div>
      <div className={`text-[10px] ${colour}`}>
        {delta == null ? "—" : `${positive ? "↑" : "↓"} ${(Math.abs(delta) * 100).toFixed(0)}%`}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 p-3">
      <div className="text-xs opacity-60">{label}</div>
      <div className="text-lg font-medium mt-0.5 tabular-nums">{value}</div>
      {sub && <div className="text-xs opacity-50 mt-0.5">{sub}</div>}
    </div>
  );
}
