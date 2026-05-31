import Link from "next/link";
import { prisma } from "@/lib/db";
import { buildTopClientColumns, getDashboardData, type DashboardData } from "@/lib/dashboard";
import { getOrCreateAISummary } from "@/lib/ai-summary";
import { TrendChart } from "@/components/TrendChart";
import { StackedBarChart, buildColourFor } from "@/components/StackedBarChart";

export const dynamic = "force-dynamic";
// Dashboard runs reconcile for 6 months on first cold load (Xero pagination
// + MyHours team-wide fetch). 60s is Vercel Hobby's ceiling; subsequent
// loads hit the snapshot cache and return in ~1s.
export const maxDuration = 60;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ xero?: string; xero_error?: string }>;
}) {
  const sp = await searchParams;
  const xeroConn = await prisma.xeroConnection.findFirst({ orderBy: { updatedAt: "desc" } });
  const myHoursConfigured = Boolean(process.env.MYHOURS_API_KEY);
  const xeroConfigured =
    Boolean(process.env.XERO_CLIENT_ID) && Boolean(process.env.XERO_CLIENT_SECRET);
  const anthropicConfigured = Boolean(process.env.ANTHROPIC_API_KEY);
  const ready = xeroConn && myHoursConfigured;

  let dashboard: DashboardData | null = null;
  let dashboardError: string | null = null;
  let aiSummary: string | null = null;

  if (ready) {
    try {
      dashboard = await getDashboardData();
      if (anthropicConfigured) {
        const result = await getOrCreateAISummary(dashboard);
        aiSummary = result?.content ?? null;
      }
    } catch (e) {
      dashboardError = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm opacity-70 mt-1">
          {dashboard
            ? `Snapshot of ${dashboard.anchor.label} (the last completed month) vs the prior 3 months.`
            : "Time tracked in MyHours vs billed in Xero, summarised for the practice."}
        </p>
      </header>

      {sp.xero === "connected" && <Notice tone="ok">Xero connected.</Notice>}
      {sp.xero === "disconnected" && <Notice tone="ok">Xero disconnected.</Notice>}
      {sp.xero_error && <Notice tone="error">Xero error: {sp.xero_error}</Notice>}

      {!ready && <SetupPrompt myHoursConfigured={myHoursConfigured} xeroConfigured={xeroConfigured} xeroConn={!!xeroConn} />}

      {dashboardError && (
        <Notice tone="error">Couldn&apos;t load dashboard: {dashboardError}</Notice>
      )}

      {dashboard && <DashboardView data={dashboard} aiSummary={aiSummary} anthropicConfigured={anthropicConfigured} />}

      <ConnectionStatus
        xeroConfigured={xeroConfigured}
        xeroConn={xeroConn ? { tenantName: xeroConn.tenantName } : null}
        myHoursConfigured={myHoursConfigured}
        anthropicConfigured={anthropicConfigured}
      />
    </div>
  );
}

function DashboardView({
  data,
  aiSummary,
  anthropicConfigured,
}: {
  data: DashboardData;
  aiSummary: string | null;
  anthropicConfigured: boolean;
}) {
  const { anchor, trend, deltas, watchlist } = data;
  const fmtMoney = (n: number | null) =>
    n == null
      ? "—"
      : n.toLocaleString("en", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
  const fmtHrs = (n: number) => n.toLocaleString("en", { maximumFractionDigits: 1 });
  const fmtRate = (n: number | null) =>
    n == null ? "—" : n.toLocaleString("en", { style: "currency", currency: "GBP", maximumFractionDigits: 2 }) + "/hr";

  return (
    <>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Hours tracked"
          value={fmtHrs(anchor.result.totals.hours)}
          delta={deltas.hours}
          direction="up-is-good"
        />
        <StatCard
          label="Billable hours"
          value={fmtHrs(anchor.result.totals.billableHours)}
          delta={deltas.billableHours}
          direction="up-is-good"
        />
        <StatCard
          label="Billed (ex VAT)"
          value={fmtMoney(anchor.result.totals.totalBilled)}
          delta={deltas.totalBilled}
          direction="up-is-good"
        />
        <StatCard
          label="Effective £/hr"
          value={fmtRate(anchor.result.totals.effectiveRate)}
          delta={deltas.effectiveRate}
          direction="up-is-good"
        />
      </section>

      <section className="rounded-lg border border-black/10 dark:border-white/10 p-4">
        <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
          <h2 className="font-medium">6-month trend</h2>
          <span className="text-xs opacity-60">
            Billed £ (top) · effective £/hr (bottom)
          </span>
        </div>
        <div className="space-y-6">
          <TrendChart
            format="money"
            data={trend.map((m) => ({ label: m.shortLabel, value: m.result.totals.totalBilled }))}
          />
          <TrendChart
            format="rate"
            data={trend.map((m) => ({ label: m.shortLabel, value: m.result.totals.effectiveRate }))}
          />
        </div>
      </section>

      <TopClientsSection trend={trend} />

      <section className="rounded-lg border border-black/10 dark:border-white/10 p-4">
        <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
          <h2 className="font-medium">Watch list</h2>
          <span className="text-xs opacity-60">
            Clients under £35/hr in 2+ of the last 3 months
          </span>
        </div>
        {watchlist.length === 0 ? (
          <p className="text-sm opacity-70">
            Nothing flagged — no clients have been consistently under £35/hr in the last 3 months.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left">
                <tr className="border-b border-black/10 dark:border-white/10">
                  <th className="py-2 pr-3 font-medium">Client</th>
                  {trend.slice(-3).map((m) => (
                    <th key={`${m.year}-${m.month}`} className="py-2 px-3 font-medium text-right">
                      {m.shortLabel}
                    </th>
                  ))}
                  <th className="py-2 px-3 font-medium text-right">Avg rate</th>
                  <th className="py-2 pl-3 font-medium text-right">Billable hours</th>
                </tr>
              </thead>
              <tbody>
                {watchlist.map((w) => (
                  <tr key={w.clientName} className="border-b border-black/5 dark:border-white/5 last:border-0">
                    <td className="py-2 pr-3">{w.clientName}</td>
                    {trend.slice(-3).map((m) => {
                      const cell = w.perMonth.find((p) => p.year === m.year && p.month === m.month);
                      return (
                        <td key={`${m.year}-${m.month}`} className="py-2 px-3 text-right tabular-nums">
                          {cell?.rate == null ? (
                            <span className="opacity-40">—</span>
                          ) : (
                            <RateBadge rate={cell.rate} />
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2 px-3 text-right tabular-nums font-medium">
                      {fmtRate(w.avgRate)}
                    </td>
                    <td className="py-2 pl-3 text-right tabular-nums opacity-70">
                      {fmtHrs(w.totalBillableHours)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-black/10 dark:border-white/10 p-4">
        <h2 className="font-medium mb-3">Analysis</h2>
        {anthropicConfigured ? (
          aiSummary ? (
            <div className="prose prose-sm dark:prose-invert max-w-none space-y-3">
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

function TopClientsSection({ trend }: { trend: DashboardData["trend"] }) {
  const { columns, legend } = buildTopClientColumns(trend);
  if (columns.length === 0) return null;
  // Top clients get the palette in anchor-month order; "Others" is a fixed
  // neutral grey so it never competes for attention with a real client.
  const orderedKeys = legend.map((l) => l.key);
  const baseColourFor = buildColourFor(orderedKeys);
  const colourFor = (key: string) => (key === "__others__" ? "#6b7280" : baseColourFor(key));

  return (
    <section className="rounded-lg border border-black/10 dark:border-white/10 p-4">
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <h2 className="font-medium">Top clients by billed £</h2>
        <span className="text-xs opacity-60">Last 6 months — top 8 named, rest grouped</span>
      </div>
      <StackedBarChart format="money" data={columns} colourFor={colourFor} legend={legend} />
    </section>
  );
}

function StatCard({
  label,
  value,
  delta,
  direction,
}: {
  label: string;
  value: string;
  delta: number | null;
  direction: "up-is-good" | "down-is-good";
}) {
  const isPositiveChange = delta != null && delta > 0;
  const isGood =
    delta == null
      ? null
      : direction === "up-is-good"
        ? isPositiveChange
        : !isPositiveChange;
  const colorClass =
    isGood == null
      ? "opacity-60"
      : isGood
        ? "text-emerald-700 dark:text-emerald-300"
        : "text-red-700 dark:text-red-300";

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 p-3">
      <div className="text-xs opacity-60">{label}</div>
      <div className="text-lg font-medium mt-0.5 tabular-nums">{value}</div>
      <div className={`text-xs mt-0.5 ${colorClass}`}>
        {delta == null
          ? "vs prior 3 mo — n/a"
          : `${isPositiveChange ? "↑" : "↓"} ${(Math.abs(delta) * 100).toFixed(1)}% vs prior 3 mo`}
      </div>
    </div>
  );
}

function RateBadge({ rate }: { rate: number }) {
  const fmt = rate.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (rate < 35) {
    return (
      <span className="text-red-700 dark:text-red-300 font-medium">£{fmt}</span>
    );
  }
  if (rate < 40) {
    return (
      <span className="text-amber-700 dark:text-amber-300 font-medium">£{fmt}</span>
    );
  }
  return <span>£{fmt}</span>;
}

function SetupPrompt({
  myHoursConfigured,
  xeroConfigured,
  xeroConn,
}: {
  myHoursConfigured: boolean;
  xeroConfigured: boolean;
  xeroConn: boolean;
}) {
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm space-y-2">
      <p className="font-medium">Finish setup to see the dashboard.</p>
      <ul className="list-disc list-inside space-y-1">
        {!myHoursConfigured && (
          <li>
            Set <code className="font-mono">MYHOURS_API_KEY</code> in your environment.
          </li>
        )}
        {!xeroConfigured && (
          <li>
            Set <code className="font-mono">XERO_CLIENT_ID</code> and{" "}
            <code className="font-mono">XERO_CLIENT_SECRET</code>.
          </li>
        )}
        {xeroConfigured && !xeroConn && (
          <li>
            <Link href="/api/xero/connect" className="underline">Connect Xero</Link> to your organisation.
          </li>
        )}
      </ul>
    </div>
  );
}

function ConnectionStatus({
  xeroConfigured,
  xeroConn,
  myHoursConfigured,
  anthropicConfigured,
}: {
  xeroConfigured: boolean;
  xeroConn: { tenantName: string } | null;
  myHoursConfigured: boolean;
  anthropicConfigured: boolean;
}) {
  return (
    <details className="rounded-lg border border-black/10 dark:border-white/10 p-4">
      <summary className="font-medium cursor-pointer text-sm">Integrations</summary>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Card title="MyHours">
          <Row label="API key" value={myHoursConfigured ? "Set" : "Missing"} ok={myHoursConfigured} />
        </Card>
        <Card title="Xero">
          <Row label="App credentials" value={xeroConfigured ? "Set" : "Missing"} ok={xeroConfigured} />
          <Row
            label="Organisation"
            value={xeroConn ? xeroConn.tenantName : "Not connected"}
            ok={Boolean(xeroConn)}
          />
          <div className="mt-3 flex gap-2">
            {!xeroConn && xeroConfigured && (
              <Link
                href="/api/xero/connect"
                className="inline-flex items-center rounded-md bg-foreground text-background px-3 py-1.5 text-sm hover:opacity-90"
              >
                Connect
              </Link>
            )}
            {xeroConn && (
              <form action="/api/xero/disconnect" method="post">
                <button
                  type="submit"
                  className="inline-flex items-center rounded-md border border-current/20 px-3 py-1.5 text-sm hover:bg-foreground/5"
                >
                  Disconnect
                </button>
              </form>
            )}
          </div>
        </Card>
        <Card title="Claude (AI analysis)">
          <Row
            label="API key"
            value={anthropicConfigured ? "Set" : "Missing"}
            ok={anthropicConfigured}
          />
          {!anthropicConfigured && (
            <p className="text-xs opacity-70 mt-2">
              Add <code className="font-mono">ANTHROPIC_API_KEY</code> from{" "}
              console.anthropic.com to enable the analysis paragraph above.
            </p>
          )}
        </Card>
      </div>
    </details>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 p-4">
      <h3 className="font-medium">{title}</h3>
      <div className="mt-2 space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="opacity-70">{label}</span>
      <span className={ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
        {value}
      </span>
    </div>
  );
}

function Notice({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300";
  return <div className={`rounded-md border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

