import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentStaff, hasRole } from "@/lib/permissions";
import { SyncButton } from "./SyncButton";

export const dynamic = "force-dynamic";
// Sync can take a minute against large practices — give it plenty of room.
export const maxDuration = 120;

export default async function XpmSyncPage() {
  const me = await currentStaff();
  if (!me || !hasRole(me.role, "MANAGER")) {
    return (
      <p className="text-sm opacity-70">
        Permission denied — Practice Managers and Founders only.
      </p>
    );
  }

  const [conn, totalClients, syncedClients, totalContacts, lastSyncedClient] =
    await Promise.all([
      prisma.xeroConnection.findFirst(),
      prisma.client.count(),
      prisma.client.count({ where: { xpmClientId: { not: null } } }),
      prisma.contact.count(),
      prisma.client.findFirst({
        where: { xpmLastSyncedAt: { not: null } },
        orderBy: { xpmLastSyncedAt: "desc" },
        select: { xpmLastSyncedAt: true },
      }),
    ]);

  const xpmConnected = Boolean(conn?.xpmTenantId);
  const fmtAgo = (d: Date | null | undefined) => {
    if (!d) return "Never";
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} h ago`;
    return `${Math.round(hours / 24)} d ago`;
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs opacity-60 mb-1">
          <Link className="hover:underline" href="/settings">Settings</Link> /{" "}
          <span>Xero Practice Manager Sync</span>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Xero Practice Manager Sync</h1>
        <p className="text-sm opacity-70 mt-1">
          Pulls every client (including archived) and every contact from XPM into the local
          database. Matches existing rows by the XPM GUID, so re-running just refreshes — it
          won&apos;t produce duplicates.
        </p>
      </header>

      {!xpmConnected && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm space-y-2">
          <p>
            Xero is connected, but the Practice Manager scope isn&apos;t granted. Disconnect Xero
            on the Dashboard and reconnect — the auth screen will show a new &quot;Practice
            Manager&quot; permission for you to allow.
          </p>
          <Link href="/" className="underline">Go to Dashboard</Link>
        </div>
      )}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Clients In DB" value={String(totalClients)} />
        <Stat
          label="Sourced From XPM"
          value={String(syncedClients)}
          sub={`${totalClients - syncedClients} added manually`}
        />
        <Stat label="Contacts In DB" value={String(totalContacts)} />
        <Stat label="Last Sync" value={fmtAgo(lastSyncedClient?.xpmLastSyncedAt)} />
      </section>

      {xpmConnected && (
        <section className="rounded-lg border border-black/10 dark:border-white/10 p-4 space-y-3">
          <h2 className="font-medium">Run Sync</h2>
          <p className="text-sm opacity-70">
            Pulls active and archived clients. Will take 30-90 seconds on the first run depending
            on how many clients XPM has.
          </p>
          <SyncButton />
        </section>
      )}
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
