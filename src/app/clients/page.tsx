import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentStaff, hasRole } from "@/lib/permissions";
import { runMigration } from "./actions";

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

export default async function ClientsPage() {
  const me = await currentStaff();
  if (!me) {
    return <p className="text-sm opacity-70">Sign in required.</p>;
  }
  const canEdit = hasRole(me.role, "MANAGER");
  const isOwner = hasRole(me.role, "OWNER");

  const [clients, mappingCount] = await Promise.all([
    prisma.client.findMany({
      include: {
        accountManager: { select: { id: true, name: true } },
        _count: { select: { links: true } },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    }),
    prisma.clientMapping.count(),
  ]);

  const needsMigration = clients.length === 0 && mappingCount > 0;

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm opacity-70 mt-1">
            The central practice record. Each client can be referenced by multiple MyHours names
            and Xero contacts — connections appear on the detail page.
          </p>
        </div>
        {canEdit && (
          <Link
            href="/clients/new"
            className="rounded-md bg-foreground text-background px-3 py-1.5 text-sm"
          >
            New Client
          </Link>
        )}
      </header>

      {needsMigration && isOwner && (
        <form action={async () => {
          "use server";
          await runMigration();
        }}>
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
            <p className="text-sm">
              You have <strong>{mappingCount}</strong> existing client mappings but no Client
              records yet. Click below to convert them — one Client is created per connected
              group of MyHours names and Xero contacts. Idempotent; safe to re-run.
            </p>
            <button
              type="submit"
              className="rounded-md bg-foreground text-background px-3 py-1.5 text-sm"
            >
              Migrate From Client Mappings
            </button>
          </div>
        </form>
      )}

      {clients.length === 0 && !needsMigration && (
        <p className="text-sm opacity-70">
          No clients yet. {canEdit ? "Use the New Client button to add the first one." : ""}
        </p>
      )}

      {clients.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-foreground/5 text-left">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Account Manager</th>
                <th className="px-3 py-2 text-right">Links</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-t border-black/5 dark:border-white/5">
                  <td className="px-3 py-2">
                    <Link href={`/clients/${c.id}`} className="hover:underline font-medium">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${STATUS_PILL[c.status]}`}>
                      {STATUS_LABEL[c.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 opacity-80">
                    {c.accountManager?.name ?? <span className="opacity-50">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums opacity-70">
                    {c._count.links}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
