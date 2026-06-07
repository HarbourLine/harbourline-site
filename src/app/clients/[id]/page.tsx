import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentStaff, hasRole } from "@/lib/permissions";
import { fetchCompanyProfile } from "@/lib/companies-house";
import { addLink, deleteClient, removeLink } from "../actions";
import { CopyableField } from "./CopyableField";

// Companies House cache is refreshed at most once every 30 days per
// client. Filings move slowly (annually for accounts; rarely for the
// registered address) so weekly/monthly is plenty. Under the CH
// rate limit (600 req / 5 min / IP) by a huge margin.
const CH_REFRESH_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  LEAD: "Lead",
  ONBOARDING: "Onboarding",
  ACTIVE: "Active",
  DORMANT: "Dormant",
  OFFBOARDED: "Offboarded",
  ARCHIVED: "Archived",
};

const STATUS_PILL: Record<string, string> = {
  LEAD: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  ONBOARDING: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ACTIVE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  DORMANT: "bg-foreground/10 opacity-70",
  OFFBOARDED: "bg-red-500/15 text-red-700 dark:text-red-300",
  ARCHIVED: "bg-foreground/10 opacity-70",
};

const AML_LABEL: Record<string, string> = {
  NOT_REQUIRED: "Not required",
  PENDING: "Pending",
  PASSED: "Passed",
  EXPIRED: "Expired",
  REJECTED: "Rejected",
};

const AML_PILL: Record<string, string> = {
  NOT_REQUIRED: "bg-foreground/10 opacity-70",
  PENDING: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  PASSED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  EXPIRED: "bg-red-500/15 text-red-700 dark:text-red-300",
  REJECTED: "bg-red-500/15 text-red-700 dark:text-red-300",
};

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await currentStaff();
  if (!me) return <p className="text-sm opacity-70">Sign in required.</p>;

  const { id } = await params;
  let client = await prisma.client.findUnique({
    where: { id },
    include: {
      accountManager: { select: { id: true, name: true } },
      links: { orderBy: [{ source: "asc" }, { externalKey: "asc" }] },
      contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }, { firstName: "asc" }] },
    },
  });
  if (!client) notFound();

  // Companies House refresh: fetch on first view, then again whenever the
  // cached data is older than CH_REFRESH_INTERVAL_MS. Wrapped in try/catch
  // so a CH outage just renders the cached (or empty) data instead of
  // breaking the page.
  const chStale =
    !client.companiesHouseLastSyncedAt ||
    Date.now() - client.companiesHouseLastSyncedAt.getTime() > CH_REFRESH_INTERVAL_MS;
  if (client.companyNumber && chStale) {
    try {
      const profile = await fetchCompanyProfile(client.companyNumber);
      client = await prisma.client.update({
        where: { id },
        data: {
          registeredAddress: profile.registeredAddress,
          nextYearEnd: profile.nextYearEnd,
          nextAccountsDue: profile.nextAccountsDue,
          nextConfirmationStatementDue: profile.nextConfirmationStatementDue,
          companiesHouseLastSyncedAt: new Date(),
        },
        include: {
          accountManager: { select: { id: true, name: true } },
          links: { orderBy: [{ source: "asc" }, { externalKey: "asc" }] },
          contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }, { firstName: "asc" }] },
        },
      });
    } catch (e) {
      console.warn(`[companies-house] first-time sync failed for ${client.companyNumber}:`, e);
    }
  }

  const canEdit = hasRole(me.role, "MANAGER");
  const isOwner = hasRole(me.role, "OWNER");

  const fmtDate = (d: Date | null | undefined) =>
    d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : null;
  const fmtMoney = (n: number | null | undefined) =>
    n != null ? n.toLocaleString("en", { style: "currency", currency: "GBP" }) : null;

  const customFields = (client.customFields as Record<string, string> | null) ?? null;
  const hasCustomFields = customFields && Object.keys(customFields).length > 0;

  // Summary chips shown in the header — show only what's populated.
  const headerChips = [
    client.companyNumber ? `Co. ${client.companyNumber}` : null,
    client.vatNumber ? `VAT ${client.vatNumber}` : null,
    client.accountManager ? `Manager: ${client.accountManager.name}` : null,
  ].filter((c): c is string => Boolean(c));

  const hasContact = client.email || client.phone || client.website;
  const hasAddresses =
    client.tradingAddress || client.postalAddress || client.registeredAddress;
  const hasStatutory =
    client.companyNumber ||
    client.vatNumber ||
    client.utr ||
    client.payeReference ||
    client.financialYearEnd ||
    client.nextYearEnd ||
    client.nextAccountsDue ||
    client.nextConfirmationStatementDue ||
    client.amlStatus !== "NOT_REQUIRED" ||
    client.amlExpiresAt;
  const hasCommercial = client.defaultHourlyRate != null || client.accountManager;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-xs opacity-60">
          <Link className="hover:underline" href="/clients">Clients</Link> /{" "}
          <span>{client.name}</span>
        </p>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
              <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${STATUS_PILL[client.status]}`}>
                {STATUS_LABEL[client.status]}
              </span>
            </div>
            {headerChips.length > 0 && (
              <p className="text-sm opacity-70">{headerChips.join(" · ")}</p>
            )}
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

      {hasContact && (
        <Section title="Client Contact Information">
          <FieldRow label="Email">
            {client.email ? (
              <a className="hover:underline" href={`mailto:${client.email}`}>{client.email}</a>
            ) : null}
          </FieldRow>
          <FieldRow label="Phone">
            {client.phone ? (
              <a className="hover:underline" href={`tel:${client.phone.replace(/\s+/g, "")}`}>
                {client.phone}
              </a>
            ) : null}
          </FieldRow>
          <FieldRow label="Website">
            {client.website ? (
              <a
                className="hover:underline"
                href={client.website.startsWith("http") ? client.website : `https://${client.website}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {client.website}
              </a>
            ) : null}
          </FieldRow>
        </Section>
      )}

      {hasAddresses && (
        <Section title="Addresses">
          {client.tradingAddress && (
            <FieldRow label="Trading">
              <pre className="font-sans whitespace-pre-wrap text-sm">{client.tradingAddress}</pre>
            </FieldRow>
          )}
          {client.registeredAddress &&
            client.registeredAddress !== client.tradingAddress && (
              <FieldRow label="Registered">
                <pre className="font-sans whitespace-pre-wrap text-sm">{client.registeredAddress}</pre>
              </FieldRow>
            )}
          {client.postalAddress &&
            client.postalAddress !== client.tradingAddress &&
            client.postalAddress !== client.registeredAddress && (
              <FieldRow label="Postal">
                <pre className="font-sans whitespace-pre-wrap text-sm">{client.postalAddress}</pre>
              </FieldRow>
            )}
        </Section>
      )}

      {hasStatutory && (
        <Section title="Statutory & Tax">
          <FieldRow label="Company Number">
            {client.companyNumber ? <CopyableField value={client.companyNumber} /> : null}
          </FieldRow>
          <FieldRow label="VAT Number">
            {client.vatNumber ? <CopyableField value={client.vatNumber} /> : null}
          </FieldRow>
          <FieldRow label="UTR">{client.utr}</FieldRow>
          <FieldRow label="PAYE Reference">{client.payeReference}</FieldRow>
          <FieldRow label="Financial Year End">{fmtDate(client.financialYearEnd)}</FieldRow>
          <FieldRow label="Next Year End">{fmtDate(client.nextYearEnd)}</FieldRow>
          <FieldRow label="Accounts Due">{fmtDate(client.nextAccountsDue)}</FieldRow>
          <FieldRow label="Confirmation Statement Due">
            {fmtDate(client.nextConfirmationStatementDue)}
          </FieldRow>
          {client.amlStatus !== "NOT_REQUIRED" && (
            <FieldRow label="AML">
              <span className="inline-flex items-center gap-2">
                <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${AML_PILL[client.amlStatus]}`}>
                  {AML_LABEL[client.amlStatus]}
                </span>
                {client.amlExpiresAt && (
                  <span className="opacity-70 text-xs">expires {fmtDate(client.amlExpiresAt)}</span>
                )}
              </span>
            </FieldRow>
          )}
        </Section>
      )}

      {hasCommercial && (
        <Section title="Commercial">
          <FieldRow label="Default Hourly Rate">{fmtMoney(client.defaultHourlyRate)}</FieldRow>
          <FieldRow label="Account Manager">{client.accountManager?.name}</FieldRow>
        </Section>
      )}

      {hasCustomFields && (
        <Section title="Custom Fields">
          {Object.entries(customFields!).map(([k, v]) => (
            <FieldRow key={k} label={k}>{v}</FieldRow>
          ))}
        </Section>
      )}

      <Section title={`Contacts (${client.contacts.length})`}>
        {client.contacts.length === 0 ? (
          <p className="text-sm opacity-70">
            No contacts yet — run a Practice Manager sync or add one manually later.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {client.contacts.map((c) => {
              const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ") || "(unnamed)";
              return (
                <div
                  key={c.id}
                  className="rounded-lg border border-black/10 dark:border-white/10 p-3 space-y-1"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{fullName}</span>
                    {c.isPrimary && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                        Primary
                      </span>
                    )}
                  </div>
                  {c.jobTitle && <div className="text-xs opacity-60">{c.jobTitle}</div>}
                  {c.email && (
                    <a className="text-sm hover:underline block" href={`mailto:${c.email}`}>
                      {c.email}
                    </a>
                  )}
                  {(c.mobile || c.phone) && (
                    <a
                      className="text-sm hover:underline block"
                      href={`tel:${(c.mobile ?? c.phone)!.replace(/\s+/g, "")}`}
                    >
                      {c.mobile ?? c.phone}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {client.notes && (
        <Section title="Notes">
          <p className="text-sm whitespace-pre-wrap opacity-80">{client.notes}</p>
        </Section>
      )}

      <Section title="Lifecycle">
        <FieldRow label="Onboarded">{fmtDate(client.onboardedAt)}</FieldRow>
        <FieldRow label="Offboarded">{fmtDate(client.offboardedAt)}</FieldRow>
        <FieldRow label="Created">{fmtDate(client.createdAt)}</FieldRow>
        <FieldRow label="Last updated">{fmtDate(client.updatedAt)}</FieldRow>
        {client.xpmLastSyncedAt && (
          <FieldRow label="Last XPM sync">{fmtDate(client.xpmLastSyncedAt)}</FieldRow>
        )}
      </Section>

      <details className="rounded-lg border border-black/10 dark:border-white/10 p-4">
        <summary className="font-medium cursor-pointer text-sm">
          External Links ({client.links.length})
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs opacity-60">
            How this client is referenced in MyHours and Xero. Used by the Reconcile page to
            connect time logs with invoices.
          </p>
          {client.links.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-foreground/5 text-left">
                  <tr>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Reference</th>
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
            <form action={addLink} className="grid gap-3 sm:grid-cols-4 items-end">
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
                <span className="block opacity-70 mb-1">Reference</span>
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
        </div>
      </details>

      {isOwner && (
        <section className="rounded-lg border border-red-500/40 bg-red-500/10 p-4">
          <h2 className="font-medium mb-2 text-sm">Danger Zone</h2>
          <form action={deleteClient}>
            <input type="hidden" name="id" value={client.id} />
            <button
              type="submit"
              className="text-sm underline opacity-70 hover:opacity-100"
            >
              Delete this client (and all its contacts + links)
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

// Section wrapper — consistent styling, used only when there's content to
// show inside it (callers gate on `show` themselves).
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-black/10 dark:border-white/10 p-4 space-y-3">
      <h2 className="font-medium">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

// FieldRow — label/value pair on a single row. Hides itself entirely when
// the value is empty so we don't show a wall of "—" placeholders.
function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  if (children == null || children === "") return null;
  // Treat empty React children as absent — e.g. <FieldRow>{value}</FieldRow>
  // where `value` is null/undefined.
  return (
    <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm items-baseline">
      <span className="text-xs opacity-60">{label}</span>
      <div>{children}</div>
    </div>
  );
}
