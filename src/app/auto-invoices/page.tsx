import Link from "next/link";
import { prisma } from "@/lib/db";
import * as mh from "@/lib/myhours";
import * as xero from "@/lib/xero";
import { deleteAutomation, saveAutomation } from "./actions";

export const dynamic = "force-dynamic";
// Loading MH clients + Xero contacts can be slow on a cold start.
export const maxDuration = 60;

export default async function AutoInvoicesIndex() {
  const automations = await prisma.invoiceAutomation.findMany({ orderBy: { name: "asc" } });

  let myHoursClients: { id: number; name: string }[] = [];
  let xeroContacts: { id: string; name: string }[] = [];
  let mhError: string | null = null;
  let xeroError: string | null = null;
  await Promise.all([
    mh
      .listClients()
      .then((cs) => {
        const byName = new Map<string, { id: number; name: string }>();
        for (const c of cs) if (!byName.has(c.name)) byName.set(c.name, c);
        myHoursClients = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
      })
      .catch((e) => {
        mhError = e instanceof Error ? e.message : String(e);
      }),
    xero
      .fetchActiveContacts()
      .then((cs) => {
        xeroContacts = cs.sort((a, b) => a.name.localeCompare(b.name));
      })
      .catch((e) => {
        xeroError = e instanceof Error ? e.message : String(e);
      }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs opacity-60 mb-1">
          <Link className="hover:underline" href="/settings">Settings</Link> /{" "}
          <span>Auto-invoices</span>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Auto-invoices</h1>
        <p className="text-sm opacity-70 mt-1">
          Monthly invoice templates. Pulls the chosen month&apos;s MyHours logs for a configured
          client, filters by task, applies a markup, rounds to the nearest pound, and creates a
          draft invoice in Xero ready for you to review and send.
        </p>
      </header>

      <section>
        <h2 className="font-medium mb-3">Templates ({automations.length})</h2>
        {automations.length === 0 ? (
          <p className="text-sm opacity-70">No templates yet. Add one below.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-foreground/5 text-left">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Bills</th>
                  <th className="px-3 py-2">From MyHours client</th>
                  <th className="px-3 py-2">Markup</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {automations.map((a) => (
                  <tr key={a.id} className="border-t border-black/5 dark:border-white/5">
                    <td className="px-3 py-2 font-medium">{a.name}</td>
                    <td className="px-3 py-2">{a.xeroContactName}</td>
                    <td className="px-3 py-2">
                      {a.myHoursClient}
                      {a.taskFilter && <span className="opacity-60"> · {a.taskFilter}</span>}
                    </td>
                    <td className="px-3 py-2 tabular-nums">+{a.markupPercent}%</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-3">
                        <Link
                          className="text-xs underline opacity-70 hover:opacity-100"
                          href={`/auto-invoices/${a.id}/generate`}
                        >
                          Generate
                        </Link>
                        <Link
                          className="text-xs underline opacity-70 hover:opacity-100"
                          href={`/auto-invoices/${a.id}/edit`}
                        >
                          Edit
                        </Link>
                        <form action={deleteAutomation}>
                          <input type="hidden" name="id" value={a.id} />
                          <button
                            type="submit"
                            className="text-xs underline opacity-70 hover:opacity-100"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-black/10 dark:border-white/10 p-4">
        <h2 className="font-medium mb-3">Add a new template</h2>

        {(mhError || xeroError) && (
          <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            {mhError && <div>Couldn&apos;t load MyHours clients: {mhError}</div>}
            {xeroError && <div>Couldn&apos;t load Xero contacts: {xeroError}</div>}
          </div>
        )}

        <form action={saveAutomation} className="grid gap-3 sm:grid-cols-2">
          <Field name="name" label="Template name" required placeholder="Urban Ledgers monthly" />

          <label className="text-sm">
            <span className="block opacity-70 mb-1">
              Xero contact to bill <span className="text-red-500">*</span>
            </span>
            <select
              name="xeroContact"
              required
              disabled={!!xeroError}
              defaultValue=""
              className="w-full rounded border border-current/20 bg-transparent px-2 py-1.5"
            >
              <option value="" disabled>— choose —</option>
              {xeroContacts.map((c) => (
                <option key={c.id} value={`${c.id}|${c.name}`}>{c.name}</option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="block opacity-70 mb-1">
              MyHours client <span className="text-red-500">*</span>
            </span>
            <select
              name="myHoursClient"
              required
              disabled={!!mhError}
              defaultValue=""
              className="w-full rounded border border-current/20 bg-transparent px-2 py-1.5"
            >
              <option value="" disabled>— choose —</option>
              {myHoursClients.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </label>

          <Field name="taskFilter" label="Task filter (optional)" placeholder="Bookkeeping" />

          <Field name="projectPrefix" label="Project name prefix to strip" placeholder="UL - " />
          <Field
            name="lineSuffix"
            label="Line description suffix"
            defaultValue=" - Bookkeeping Support"
            placeholder=" - Bookkeeping Support"
          />

          <Field
            name="markupPercent"
            label="Markup %"
            type="number"
            step="0.1"
            defaultValue="4"
          />
          <Field
            name="minimumLineAmount"
            label="Minimum per line £ (0 = no minimum)"
            type="number"
            step="1"
            defaultValue="0"
          />
          <Field
            name="vatRate"
            label="VAT rate %"
            type="number"
            step="0.1"
            defaultValue="20"
          />

          <Field name="taxType" label="Xero tax type" defaultValue="OUTPUT2" />
          <Field name="accountCode" label="Xero sales account code" defaultValue="200" />

          <Field
            name="trackingCategoryName"
            label="Xero tracking category (optional)"
            placeholder="Project"
          />
          <Field
            name="trackingCategoryOption"
            label="Tracking option (optional)"
            placeholder="ASBK Ltd"
          />

          <Field
            name="referenceTemplate"
            label="Invoice reference (optional)"
            placeholder="{monthLabel}"
          />
          <Field
            name="paymentDueDays"
            label="Payment terms (days)"
            type="number"
            defaultValue="30"
          />

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-md bg-foreground text-background px-3 py-1.5 text-sm"
            >
              Save template
            </button>
          </div>
        </form>

        <p className="text-xs opacity-60 mt-3">
          The reference template supports <code className="font-mono">{`{month}`}</code>,{" "}
          <code className="font-mono">{`{year}`}</code>, and{" "}
          <code className="font-mono">{`{monthLabel}`}</code> (e.g. &ldquo;April 2026&rdquo;).
        </p>
      </section>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  step,
  placeholder,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  step?: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="text-sm">
      <span className="block opacity-70 mb-1">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full rounded border border-current/20 bg-transparent px-2 py-1.5"
      />
    </label>
  );
}
