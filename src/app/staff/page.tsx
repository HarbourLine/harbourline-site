import { prisma } from "@/lib/db";
import { getStaffDashboardData, type StaffDashboardData, type StaffRow } from "@/lib/staff";
import { TrendChart } from "@/components/TrendChart";

export const dynamic = "force-dynamic";
// Same shape as the dashboard: cold first load (~30s for 6 months), then
// cached snapshot reads (~1s) until staleness kicks in.
export const maxDuration = 60;

export default async function StaffPage() {
  const xeroConn = await prisma.xeroConnection.findFirst();
  const myHoursReady = Boolean(process.env.MYHOURS_API_KEY);
  const ready = xeroConn && myHoursReady;

  let data: StaffDashboardData | null = null;
  let runError: string | null = null;
  if (ready) {
    try {
      data = await getStaffDashboardData();
    } catch (e) {
      runError = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
        <p className="text-sm opacity-70 mt-1">
          {data
            ? `Per-person hours and earned £ for ${data.anchor.label}, with deltas vs the prior 3-month average. Earned £ allocates each client's billed total across the staff who worked on it that month, in proportion to billable-hour share.`
            : "Per-person hours, earned £, and utilisation."}
        </p>
      </header>

      {!ready && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          MyHours + Xero need to be connected before staff data is available.
        </div>
      )}

      {runError && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
          {runError}
        </div>
      )}

      {data && <StaffView data={data} />}
    </div>
  );
}

function StaffView({ data }: { data: StaffDashboardData }) {
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

      <section className="rounded-lg border border-black/10 dark:border-white/10 p-4">
        <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
          <h2 className="font-medium">6-month trend — earned £ per person</h2>
          <span className="text-xs opacity-60">Stacked total across the team</span>
        </div>
        <TrendChart
          format="money"
          data={data.trend.map((m) => ({
            label: m.shortLabel,
            value: m.staff.reduce((s, e) => s + e.earnedAmount, 0),
          }))}
        />
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
                <th className="py-2 pr-3 font-medium">Staff</th>
                <th className="py-2 px-3 font-medium text-right">Hours</th>
                <th className="py-2 px-3 font-medium text-right">Billable</th>
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

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 p-3">
      <div className="text-xs opacity-60">{label}</div>
      <div className="text-lg font-medium mt-0.5 tabular-nums">{value}</div>
      {sub && <div className="text-xs opacity-50 mt-0.5">{sub}</div>}
    </div>
  );
}
