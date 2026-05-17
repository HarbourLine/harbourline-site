import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

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

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Time vs Billing</h1>
        <p className="text-sm opacity-70 mt-1">
          Compare hours tracked in MyHours against amounts invoiced in Xero, per client, per month.
        </p>
      </section>

      {sp.xero === "connected" && (
        <Notice tone="ok">Xero connected.</Notice>
      )}
      {sp.xero === "disconnected" && (
        <Notice tone="ok">Xero disconnected.</Notice>
      )}
      {sp.xero_error && (
        <Notice tone="error">Xero error: {sp.xero_error}</Notice>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <Card title="MyHours">
          <Row label="API key set" value={myHoursConfigured ? "Yes" : "No"} ok={myHoursConfigured} />
          <p className="text-sm opacity-70 mt-3">
            Set <code className="font-mono">MYHOURS_API_KEY</code> in <code>.env.local</code>.
            Get it from MyHours → profile → Integrations / API.
          </p>
        </Card>

        <Card title="Xero">
          <Row
            label="Developer app credentials"
            value={xeroConfigured ? "Set" : "Missing"}
            ok={xeroConfigured}
          />
          <Row
            label="Organisation connected"
            value={xeroConn ? xeroConn.tenantName : "Not connected"}
            ok={Boolean(xeroConn)}
          />
          <div className="mt-3 flex gap-2">
            {!xeroConn && xeroConfigured && (
              <Link
                href="/api/xero/connect"
                className="inline-flex items-center rounded-md bg-foreground text-background px-3 py-1.5 text-sm hover:opacity-90"
              >
                Connect Xero
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
      </section>

      <section>
        <h2 className="text-lg font-medium">Next steps</h2>
        <ol className="mt-2 space-y-1 text-sm list-decimal list-inside">
          <li>Fill in <code>.env.local</code> (see <code>.env.example</code>).</li>
          <li>Connect Xero (button above) — pick the right organisation.</li>
          <li>
            Go to <Link className="underline" href="/reconcile">Reconcile</Link> and pick a month.
            Unmapped MyHours clients get flagged.
          </li>
          <li>
            Open <Link className="underline" href="/mappings">Client mappings</Link> to link a
            MyHours client to a Xero contact.
          </li>
        </ol>
      </section>
    </div>
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
