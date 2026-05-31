import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // Lightweight counts so each card hints at what's in it without making
  // the user click through.
  const [mappings, recurring, exclusions, accountExclusions, teamExclusions] = await Promise.all([
    prisma.clientMapping.count(),
    prisma.recurringBilling.count(),
    prisma.excludedName.count(),
    prisma.excludedAccountCode.count(),
    prisma.excludedTeamMember.count(),
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
          href="/mappings"
          title="Client mappings"
          description="Link a MyHours client to a Xero contact. Many-to-many supported — connected mappings collapse into one row on Reconcile."
          count={mappings}
          countLabel={mappings === 1 ? "mapping" : "mappings"}
        />
        <Card
          href="/recurring"
          title="Recurring billing"
          description="Fixed monthly amounts for clients on retainers or annual invoices spread over the year. Treated as invoiced on the Reconcile page."
          count={recurring}
          countLabel={recurring === 1 ? "entry" : "entries"}
        />
        <Card
          href="/exclusions"
          title="Name exclusions"
          description="Hide specific client names from the Dashboard, Reconcile, and Team — both MyHours logs and Xero invoices for that name are skipped entirely."
          count={exclusions}
          countLabel={exclusions === 1 ? "name" : "names"}
        />
        <Card
          href="/account-exclusions"
          title="Account exclusions"
          description="Subtract pass-through invoice lines (software recharges, expense reimbursements) from billed totals when calculating effective £/hr."
          count={accountExclusions}
          countLabel={accountExclusions === 1 ? "code" : "codes"}
        />
        <Card
          href="/team-exclusions"
          title="Team exclusions"
          description="Hide specific MyHours users from the Team page — the owner, support staff, departed employees. Doesn't affect client-side numbers."
          count={teamExclusions}
          countLabel={teamExclusions === 1 ? "person" : "people"}
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
