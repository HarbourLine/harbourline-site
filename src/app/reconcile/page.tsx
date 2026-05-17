import Link from "next/link";
import { prisma } from "@/lib/db";
import { reconcileMonth, type ReconcileResult } from "@/lib/reconcile";

export const dynamic = "force-dynamic";

interface SP {
  year?: string;
  month?: string;
}

export default async function ReconcilePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const year = sp.year ? Number(sp.year) : now.getUTCFullYear();
  const month = sp.month ? Number(sp.month) : now.getUTCMonth() + 1; // 1-12

  const xeroConn = await prisma.xeroConnection.findFirst();
  const myHoursReady = Boolean(process.env.MYHOURS_API_KEY);

  let result: ReconcileResult | null = null;
  let runError: string | null = null;

  if (xeroConn && myHoursReady) {
    try {
      result = await reconcileMonth(year, month);
    } catch (e) {
      runError = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reconcile</h1>
          <p className="text-sm opacity-70 mt-1">
            Hours tracked in MyHours vs invoices raised in Xero.
          </p>
        </div>
        <MonthForm year={year} month={month} />
      </header>

      {!xeroConn && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          Xero not connected.{" "}
          <Link href="/" className="underline">
            Connect on the dashboard
          </Link>
          .
        </div>
      )}
      {!myHoursReady && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          MyHours API key missing — set <code>MYHOURS_API_KEY</code>.
        </div>
      )}
      {runError && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
          {runError}
        </div>
      )}

      {result && <ResultsTable result={result} />}
    </div>
  );
}

function MonthForm({ year, month }: { year: number; month: number }) {
  const years: number[] = [];
  const thisYear = new Date().getUTCFullYear();
  for (let y = thisYear; y >= thisYear - 4; y--) years.push(y);
  return (
    <form className="flex items-end gap-2" action="/reconcile">
      <label className="text-sm">
        <span className="block opacity-70 mb-1">Month</span>
        <select name="month" defaultValue={month} className="rounded border border-current/20 bg-transparent px-2 py-1">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {new Date(Date.UTC(2000, m - 1, 1)).toLocaleString("en", { month: "long" })}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="block opacity-70 mb-1">Year</span>
        <select name="year" defaultValue={year} className="rounded border border-current/20 bg-transparent px-2 py-1">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <button className="rounded-md bg-foreground text-background px-3 py-1.5 text-sm" type="submit">
        Run
      </button>
    </form>
  );
}

function ResultsTable({ result }: { result: ReconcileResult }) {
  const fmtMoney = (n: number | null) =>
    n == null ? "—" : n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtHrs = (n: number) => n.toLocaleString("en", { maximumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Hours tracked" value={fmtHrs(result.totals.hours)} />
        <Stat label="Billable hours" value={fmtHrs(result.totals.billableHours)} />
        <Stat label="Implied $ (ex tax)" value={fmtMoney(result.totals.impliedAmount)} />
        <Stat label="Invoiced $ (ex tax)" value={fmtMoney(result.totals.invoicedAmount)} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-foreground/5 text-left">
            <tr>
              <Th>Client</Th>
              <Th align="right">Hours</Th>
              <Th align="right">Billable</Th>
              <Th align="right">Rate</Th>
              <Th align="right">Implied $</Th>
              <Th align="right">Invoiced $</Th>
              <Th align="right">Invoices</Th>
              <Th align="right">Variance</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center opacity-70">
                  No data for this month.
                </td>
              </tr>
            )}
            {result.rows.map((r, i) => (
              <tr key={i} className="border-t border-black/5 dark:border-white/5">
                <Td>{r.clientName}</Td>
                <Td align="right">{fmtHrs(r.hours)}</Td>
                <Td align="right">{fmtHrs(r.billableHours)}</Td>
                <Td align="right">{r.hourlyRate == null ? "—" : fmtMoney(r.hourlyRate)}</Td>
                <Td align="right">{fmtMoney(r.impliedAmount)}</Td>
                <Td align="right">{fmtMoney(r.invoicedAmount)}</Td>
                <Td align="right">{r.invoiceCount}</Td>
                <Td align="right">
                  <span
                    className={
                      r.variance == null
                        ? ""
                        : r.variance < -0.5
                          ? "text-amber-600 dark:text-amber-400"
                          : r.variance > 0.5
                            ? "text-emerald-600 dark:text-emerald-400"
                            : ""
                    }
                  >
                    {fmtMoney(r.variance)}
                  </span>
                </Td>
                <Td>
                  <StatusPill status={r.status} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.unmatchedXeroContacts.length > 0 && (
        <div className="rounded-lg border border-black/10 dark:border-white/10 p-4">
          <h3 className="font-medium">Xero contacts invoiced this month with no MyHours mapping</h3>
          <ul className="mt-2 text-sm space-y-1">
            {result.unmatchedXeroContacts.map((c) => (
              <li key={c.contactId} className="flex justify-between">
                <span>{c.name}</span>
                <span className="opacity-70">{fmtMoney(c.invoicedAmount)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs opacity-60 mt-2">
            These are clients you invoiced but didn&apos;t track time against (or the mapping is missing). Add a
            mapping from <Link className="underline" href="/mappings">Client mappings</Link>.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 p-3">
      <div className="text-xs opacity-60">{label}</div>
      <div className="text-lg font-medium mt-0.5">{value}</div>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : ""}`}>{children}</th>
  );
}

function Td({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return <td className={`px-3 py-2 ${align === "right" ? "text-right tabular-nums" : ""}`}>{children}</td>;
}

function StatusPill({ status }: { status: "matched" | "unmapped" | "no-time" | "no-invoice" }) {
  const map = {
    matched: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    unmapped: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    "no-time": "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    "no-invoice": "bg-red-500/15 text-red-700 dark:text-red-300",
  } as const;
  const label = {
    matched: "Matched",
    unmapped: "Unmapped",
    "no-time": "No time",
    "no-invoice": "No invoice",
  }[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs ${map[status]}`}>{label}</span>;
}
