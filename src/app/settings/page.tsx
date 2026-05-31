import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // Lightweight counts so each card hints at what's in it without making
  // the user click through.
  const [
    mappings,
    recurring,
    exclusions,
    accountExclusions,
    teamExclusions,
    autoInvoices,
    staffCount,
    syncedClients,
  ] = await Promise.all([
    prisma.clientMapping.count(),
    prisma.recurringBilling.count(),
    prisma.excludedName.count(),
    prisma.excludedAccountCode.count(),
    prisma.excludedTeamMember.count(),
    prisma.invoiceAutomation.count(),
    prisma.staff.count({ where: { isActive: true } }),
    prisma.client.count({ where: { xpmClientId: { not: null } } }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm opacity-70 mt-1">
          Configuration for how the dashboard interprets MyHours and Xero data.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <Card
          href="/settings/team"
          title="Team & Permissions"
          description="Manage who can sign in and what they can see. Founders can promote/demote, deactivate departed staff, and review the role reference."
          count={staffCount}
          countLabel={staffCount === 1 ? "active person" : "active people"}
        />
        <Card
          href="/mappings"
          title="Client Mappings"
          description="Link a MyHours client to a Xero contact. Many-to-many supported — connected mappings collapse into one row on Reconcile."
          count={mappings}
          countLabel={mappings === 1 ? "mapping" : "mappings"}
        />
        <Card
          href="/recurring"
          title="Recurring Billing"
          description="Fixed monthly amounts for clients on retainers or annual invoices spread over the year. Treated as invoiced on the Reconcile page."
          count={recurring}
          countLabel={recurring === 1 ? "entry" : "entries"}
        />
        <Card
          href="/exclusions"
          title="Name Exclusions"
          description="Hide specific client names from the Dashboard, Reconcile, and Team — both MyHours logs and Xero invoices for that name are skipped entirely."
          count={exclusions}
          countLabel={exclusions === 1 ? "name" : "names"}
        />
        <Card
          href="/account-exclusions"
          title="Account Exclusions"
          description="Subtract pass-through invoice lines (software recharges, expense reimbursements) from billed totals when calculating effective £/hr."
          count={accountExclusions}
          countLabel={accountExclusions === 1 ? "code" : "codes"}
        />
        <Card
          href="/team-exclusions"
          title="Team Exclusions"
          description="Hide specific MyHours users from the Team page — the founder, support staff, departed employees. Doesn't affect client-side numbers."
          count={teamExclusions}
          countLabel={teamExclusions === 1 ? "person" : "people"}
        />
        <Card
          href="/settings/xpm-sync"
          title="Xero Practice Manager Sync"
          description="Pull every client and contact from XPM into the local database. Matches existing rows by GUID, so re-running just refreshes."
          count={syncedClients}
          countLabel={syncedClients === 1 ? "client from XPM" : "clients from XPM"}
        />
        <Card
          href="/auto-invoices"
          title="Auto-Invoices"
          description="Templates that turn a month of MyHours logs into a draft Xero invoice — sub-client breakdown, fixed markup, rounded to the pound."
          count={autoInvoices}
          countLabel={autoInvoices === 1 ? "template" : "templates"}
        />
      </section>
    </div>
  );
}

function Card({
  href,
  title,
  description,
  count,
  countLabel,
}: {
  href: string;
  title: string;
  description: string;
  count: number;
  countLabel: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-black/10 dark:border-white/10 p-4 hover:bg-foreground/5 transition-colors block"
    >
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h3 className="font-medium">{title}</h3>
        <span className="text-xs opacity-60 tabular-nums whitespace-nowrap">
          {count} {countLabel}
        </span>
      </div>
      <p className="text-sm opacity-70">{description}</p>
    </Link>
  );
}
