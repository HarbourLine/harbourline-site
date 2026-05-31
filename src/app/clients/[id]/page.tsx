import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentStaff, hasRole } from "@/lib/permissions";
import { addLink, deleteClient, removeLink } from "../actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  LEAD: "Lead",
  ONBOARDING: "Onboarding",
  ACTIVE: "Active",
  DORMANT: "Dormant",
  OFFBOARDED: "Offboarded",
};

const STATUS_PILL: Record<string, string> = {
  LEAD: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  ONBOARDING: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ACTIVE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  DORMANT: "bg-foreground/10 opacity-70",
  OFFBOARDED: "bg-red-500/15 text-red-700 dark:text-red-300",
};

const AML_LABEL: Record<string, string> = {
  NOT_REQUIRED: "Not required",
  PENDING: "Pending",
  PASSED: "Passed",
  EXPIRED: "Expired",
  REJECTED: "Rejected",
};

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await currentStaff();
  if (!me) return <p className="text-sm opacity-70">Sign in required.</p>;

  const { id } = await params;
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      accountManager: { select: { id: true, name: true } },
      links: { orderBy: [{ source: "asc" }, { externalKey: "asc" }] },
    },
  });
  if (!client) notFound();

  const canEdit = hasRole(me.role, "MANAGER");
  const isOwner = hasRole(me.role, "OWNER");

  const fmtDate = (d: Date | null) =>
    d
      ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
      : "—";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs opacity-60 mb-1">
          <Link className="hover:underline" href="/clients">Clients</Link> /{" "}
          <span>{client.name}</span>
        </p>
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${STATUS_PILL[client.status]}`}>
              {STATUS_LABEL[client.status]}
            </span>
          </div>
          {canEdit && (
            <Link
              href={`/clients/${client.id}/edit`}
              className="rounded-md border border-current/20 px-3 py-1.5 text-sm hover:bg-foreground/5"
            >
              Edit
            </Link>
          )}
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <Card title="Trading Details">
          <KV label="Company Number" value={client.companyNumber} />
          <KV label="VAT Number" value={client.vatNumber} />
          <KV label="Trading Address" value={client.tradingAddress} />
          <KV label="Financial Year End" value={fmtDate(client.financialYearEnd)} />
        </Card>

        <Card title="Commercial">
          <KV
            label="Default Hourly Rate"
            value={
              client.defaultHourlyRate != null
                ? client.defaultHourlyRate.toLocaleString("en", {
                    style: "currency",
                    currency: "GBP",
                  })
                : null
            }
          />
          <KV label="Account Manager" value={client.accountManager?.name ?? null} />
        </Card>

        <Card title="AML & Compliance">
          <KV label="Status" value={AML_LABEL[client.amlStatus]} />
          <KV label="Expires" value={fmtDate(client.amlExpiresAt)} />
        </Card>

        <Card title="Lifecycle">
          <KV label="Onboarded" value={fmtDate(client.onboardedAt)} />
          <KV label="Offboarded" value={fmtDate(client.offboardedAt)} />
          <KV label="Created" value={fmtDate(client.createdAt)} />
        </Card>
      </section>

      {client.notes && (
        <section>
          <h2 className="font-medium mb-2">Notes</h2>
          <p className="text-sm whitespace-pre-wrap opacity-80">{client.notes}</p>
        </section>
      )}

      <section>
        <h2 className="font-medium mb-3">External Links ({client.links.length})</h2>
        {client.links.length === 0 ? (
          <p className="text-sm opacity-70">
            No links yet. Add a MyHours client name or Xero contact ID to associate this client
            with the existing data.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-foreground/5 text-left">
                <tr>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">External Reference</th>
                  <th className="px-3 py-2">Display</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {client.links.map((l) => (
                  <tr key={l.id} className="border-t border-black/5 dark:border-white/5">
                    <td className="px-3 py-2 font-mono text-xs">{l.source}</td>
                    <td className="px-3 py-2 font-mono text-xs">{l.externalKey}</td>
                    <td className="px-3 py-2">{l.externalName ?? <span className="opacity-50">—</span>}</td>
                    <td className="px-3 py-2 text-right">
                      {canEdit && (
                        <form action={removeLink}>
                          <input type="hidden" name="id" value={l.id} />
                          <input type="hidden" name="clientId" value={client.id} />
                          <button
                            type="submit"
                            className="text-xs underline opacity-70 hover:opacity-100"
                          >
                            Unlink
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canEdit && (
          <form action={addLink} className="mt-4 grid gap-3 sm:grid-cols-4 items-end">
            <input type="hidden" name="clientId" value={client.id} />
            <label className="text-sm">
              <span className="block opacity-70 mb-1">Source</span>
              <select
                name="source"
                defaultValue="myhours"
                className="w-full rounded border border-current/20 bg-transparent px-2 py-1.5"
              >
                <option value="myhours">MyHours</option>
                <option value="xero">Xero</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="block opacity-70 mb-1">External Reference</span>
              <input
                name="externalKey"
                placeholder="MH client name or Xero ContactID"
                className="w-full rounded border border-current/20 bg-transparent px-2 py-1.5"
              />
            </label>
            <label className="text-sm">
              <span className="block opacity-70 mb-1">Display (optional)</span>
              <input
                name="externalName"
                placeholder="e.g. Xero contact name"
                className="w-full rounded border border-current/20 bg-transparent px-2 py-1.5"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-foreground text-background px-3 py-1.5 text-sm"
            >
              Add Link
            </button>
          </form>
        )}
      </section>

      {isOwner && (
        <section className="rounded-lg border border-red-500/40 bg-red-500/10 p-4">
          <h2 className="font-medium mb-2 text-sm">Danger Zone</h2>
          <form action={deleteClient}>
            <input type="hidden" name="id" value={client.id} />
            <button
              type="submit"
              className="text-sm underline opacity-70 hover:opacity-100"
            >
              Delete this client (and all its links)
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 p-4">
      <h3 className="font-medium mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="text-sm">
      <div className="text-xs opacity-60">{label}</div>
      <div>{value ?? <span className="opacity-50">—</span>}</div>
    </div>
  );
}
