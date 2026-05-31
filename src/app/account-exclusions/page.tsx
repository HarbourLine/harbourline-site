import { prisma } from "@/lib/db";
import * as xero from "@/lib/xero";
import {
  addExclusion,
  getCachedDiscovery,
  refreshDiscovery,
  removeExclusion,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function AccountExclusionsPage({
  searchParams,
}: {
  searchParams: Promise<{ refresh_error?: string; refreshed?: string }>;
}) {
  const sp = await searchParams;
  const xeroConn = await prisma.xeroConnection.findFirst();
  const existing = await prisma.excludedAccountCode.findMany({ orderBy: { code: "asc" } });
  const excludedCodes = new Set(existing.map((e) => e.code));

  const cached = await getCachedDiscovery();
  const usage: xero.AccountCodeUsage[] = cached?.data ?? [];
  const monthsBack = cached?.monthsBack ?? 6;
  const fetchedAt = cached?.fetchedAt ?? null;

  const fmtMoney = (n: number) =>
    n.toLocaleString("en", { style: "currency", currency: "GBP", maximumFractionDigits: 2 });
  const fmtAgo = (d: Date) => {
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} h ago`;
    return `${Math.round(hours / 24)} days ago`;
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Account exclusions</h1>
        <p className="text-sm opacity-70 mt-1">
          Subtract pass-through line items from invoice totals when calculating effective £/hr.
          Use this for software subscriptions (Xero, QuickBooks), expense recharges, or anything
          billed alongside your services that isn&apos;t bookkeeping revenue. Changes apply
          immediately and clear the dashboard/reconcile cache.
        </p>
      </header>

      {!xeroConn && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          Xero not connected — connect on the dashboard before discovering account codes.
        </div>
      )}

      {sp.refresh_error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
          {sp.refresh_error}
        </div>
      )}
      {sp.refreshed && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm">
          Discovery refreshed.
        </div>
      )}

      <section>
        <h2 className="font-medium mb-3">Currently excluded ({existing.length})</h2>
        {existing.length === 0 ? (
          <p className="text-sm opacity-70">
            Nothing excluded. Pick codes from the discovery list below to add some.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-foreground/5 text-left">
                <tr>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Label</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {existing.map((e) => (
                  <tr key={e.id} className="border-t border-black/5 dark:border-white/5">
                    <td className="px-3 py-2 font-mono">{e.code}</td>
                    <td className="px-3 py-2">{e.name ?? <span className="opacity-50">—</span>}</td>
                    <td className="px-3 py-2 text-right">
                      <form action={removeExclusion}>
                        <input type="hidden" name="id" value={e.id} />
                        <button
                          type="submit"
                          className="text-xs underline opacity-70 hover:opacity-100"
                        >
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="font-medium">
              Account codes on your invoices (last {monthsBack} months)
            </h2>
            <p className="text-xs opacity-60 mt-0.5">
              {fetchedAt
                ? `${usage.length} distinct codes — discovered ${fmtAgo(fetchedAt)}`
                : "Not discovered yet — click Refresh to scan Xero."}
            </p>
          </div>
          <form action={refreshDiscovery}>
            <input type="hidden" name="months" value="6" />
            <button
              type="submit"
              className="text-xs rounded-md border border-current/20 px-3 py-1.5 hover:bg-foreground/5"
              disabled={!xeroConn}
            >
              {fetchedAt ? "Refresh from Xero" : "Discover from Xero"}
            </button>
          </form>
        </div>

        {usage.length === 0 && fetchedAt && (
          <p className="text-sm opacity-70">
            No invoices found in the last {monthsBack} months.
          </p>
        )}

        {usage.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-foreground/5 text-left">
                <tr>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Sample descriptions</th>
                  <th className="px-3 py-2 text-right">Lines</th>
                  <th className="px-3 py-2 text-right">Invoices</th>
                  <th className="px-3 py-2 text-right">Total £</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => {
                  const isExcluded = excludedCodes.has(u.code);
                  return (
                    <tr
                      key={u.code}
                      className={`border-t border-black/5 dark:border-white/5 ${
                        isExcluded ? "opacity-60" : ""
                      }`}
                    >
                      <td className="px-3 py-2 font-mono">{u.code}</td>
                      <td className="px-3 py-2">
                        <ul className="space-y-0.5">
                          {u.sampleDescriptions.slice(0, 3).map((d, i) => (
                            <li key={i} className="text-xs opacity-80 truncate max-w-xs">
                              {d}
                            </li>
                          ))}
                          {u.sampleDescriptions.length === 0 && (
                            <li className="text-xs opacity-50">(no descriptions)</li>
                          )}
                        </ul>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{u.lineCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{u.invoiceCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(u.totalAmount)}</td>
                      <td className="px-3 py-2 text-right">
                        {isExcluded ? (
                          <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                            Excluded
                          </span>
                        ) : (
                          <form action={addExclusion} className="flex gap-2 justify-end items-center">
                            <input type="hidden" name="code" value={u.code} />
                            <input
                              type="text"
                              name="name"
                              placeholder="Label (optional)"
                              className="rounded border border-current/20 bg-transparent px-2 py-1 text-xs w-32"
                            />
                            <button
                              type="submit"
                              className="text-xs rounded-md bg-foreground text-background px-2 py-1"
                            >
                              Exclude
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs opacity-60 mt-3">
          Cached after the first scan so we don&apos;t hammer Xero&apos;s 60-call-per-minute
          rate limit. Click Refresh when you&apos;ve added a new line type and want it to show
          up here. The label is just for your own reference.
        </p>
      </section>
    </div>
  );
}
