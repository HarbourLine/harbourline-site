import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import * as mh from "@/lib/myhours";
import * as xero from "@/lib/xero";
import { saveAutomation } from "../../actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function EditAutomationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const automation = await prisma.invoiceAutomation.findUnique({ where: { id } });
  if (!automation) notFound();

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

  const xeroContactValue = `${automation.xeroContactId}|${automation.xeroContactName}`;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs opacity-60 mb-1">
          <Link className="hover:underline" href="/settings">Settings</Link> /{" "}
          <Link className="hover:underline" href="/auto-invoices">Auto-invoices</Link> /{" "}
          <span>Edit</span>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Edit template</h1>
      </header>

      <section className="rounded-lg border border-black/10 dark:border-white/10 p-4">
        {(mhError || xeroError) && (
          <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            {mhError && <div>Couldn&apos;t load MyHours clients: {mhError}</div>}
            {xeroError && <div>Couldn&apos;t load Xero contacts: {xeroError}</div>}
          </div>
        )}

        <form action={saveAutomation} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={automation.id} />

          <Field name="name" label="Template name" required defaultValue={automation.name} />

          <label className="text-sm">
            <span className="block opacity-70 mb-1">
              Xero contact to bill <span className="text-red-500">*</span>
            </span>
            <select
              name="xeroContact"
              required
              disabled={!!xeroError}
              defaultValue={xeroContactValue}
              className="w-full rounded border border-current/20 bg-transparent px-2 py-1.5"
            >
              {xeroContacts.length === 0 && (
                <option value={xeroContactValue}>{automation.xeroContactName}</option>
              )}
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
              defaultValue={automation.myHoursClient}
              className="w-full rounded border border-current/20 bg-transparent px-2 py-1.5"
            >
              {myHoursClients.length === 0 && (
                <option value={automation.myHoursClient}>{automation.myHoursClient}</option>
              )}
              {myHoursClients.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </label>

          <Field name="taskFilter" label="Task filter (optional)" defaultValue={automation.taskFilter ?? ""} />
          <Field name="projectPrefix" label="Project name prefix to strip" defaultValue={automation.projectPrefix ?? ""} />
          <Field name="lineSuffix" label="Line description suffix" defaultValue={automation.lineSuffix} />
          <Field name="markupPercent" label="Markup %" type="number" step="0.1" defaultValue={String(automation.markupPercent)} />
          <Field
            name="minimumLineAmount"
            label="Minimum per line £ (0 = no minimum)"
            type="number"
            step="1"
            defaultValue={String(automation.minimumLineAmount ?? 0)}
          />
          <Field name="vatRate" label="VAT rate %" type="number" step="0.1" defaultValue={String(automation.vatRate)} />
          <Field name="taxType" label="Xero tax type" defaultValue={automation.taxType} />
          <Field name="accountCode" label="Xero sales account code" defaultValue={automation.accountCode} />
          <Field
            name="trackingCategoryName"
            label="Xero tracking category (optional)"
            defaultValue={automation.trackingCategoryName ?? ""}
          />
          <Field
            name="trackingCategoryOption"
            label="Tracking option (optional)"
            defaultValue={automation.trackingCategoryOption ?? ""}
          />
          <Field name="referenceTemplate" label="Invoice reference (optional)" defaultValue={automation.referenceTemplate ?? ""} />
          <Field name="paymentDueDays" label="Payment terms (days)" type="number" defaultValue={String(automation.paymentDueDays)} />

          <div className="sm:col-span-2 flex gap-3 items-center">
            <button type="submit" className="rounded-md bg-foreground text-background px-3 py-1.5 text-sm">
              Save changes
            </button>
            <Link href="/auto-invoices" className="text-sm underline opacity-70 hover:opacity-100">
              Cancel
            </Link>
          </div>
        </form>
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
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  step?: string;
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
        defaultValue={defaultValue}
        className="w-full rounded border border-current/20 bg-transparent px-2 py-1.5"
      />
    </label>
  );
}
