import { prisma } from "@/lib/db";
import * as mh from "@/lib/myhours";
import * as xero from "@/lib/xero";
import { deleteRecurring, upsertRecurring } from "./actions";

export const dynamic = "force-dynamic";

export default async function RecurringPage() {
  const items = await prisma.recurringBilling.findMany({ orderBy: { name: "asc" } });

  let myHoursClients: { id: number; name: string }[] = [];
  let xeroContacts: { id: string; name: string }[] = [];
  let myHoursError: string | null = null;
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
        myHoursError = e instanceof Error ? e.message : String(e);
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
        <h1 className="text-2xl font-semibold tracking-tight">Recurring monthly billing</h1>
        <p className="text-sm opacity-70 mt-1">
          Add a fixed monthly amount that&apos;s treated as invoiced on the Reconcile page —
          useful for retainers, annual invoices spread monthly, or any client billed outside Xero.
          The amount merges into whichever MyHours/Xero group it&apos;s attached to (so it shows up
          on the same row as that client&apos;s hours).
        </p>
      </header>

      <section className="rounded-lg border border-black/10 dark:border-white/10 p-4">
        <h2 className="font-medium mb-3">Add new recurring amount</h2>

        {(myHoursError || xeroError) && (
          <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            {myHoursError && <div>Couldn&apos;t load MyHours clients: {myHoursError}</div>}
            {xeroError && <div>Couldn&apos;t load Xero contacts: {xeroError}</div>}
          </div>
        )}

        <form action={upsertRecurring} className="grid gap-3 sm:grid-cols-2">
          <Field name="name" label="Name (for your reference)" placeholder="e.g. Associated Talent retainer" required />
          <Field name="amount" label="Amount £ per month" type="number" step="0.01" required placeholder="10000" />

          <label className="text-sm">
            <span className="block opacity-70 mb-1">MyHours client (optional)</span>
            <select
              name="myHoursClientName"
              disabled={!!myHoursError}
              defaultValue=""
              className="w-full rounded border border-current/20 bg-transparent px-2 py-1.5"
            >
              <option value="">— none —</option>
              {myHoursClients.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="block opacity-70 mb-1">Xero contact (optional)</span>
            <select
              name="xeroContact"
              disabled={!!xeroError}
              defaultValue=""
              className="w-full rounded border border-current/20 bg-transparent px-2 py-1.5"
            >
              <option value="">— none —</option>
              {xeroContacts.map((c) => (
                <option key={c.id} value={`${c.id}|${c.name}`}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <Field
            name="effectiveFrom"
            label="Effective from (YYYY-MM, optional)"
            placeholder="2026-01"
          />
          <Field
            name="effectiveTo"
            label="Effective to (YYYY-MM, optional)"
            placeholder="2026-12"
          />

          <label className="text-sm sm:col-span-2">
            <span className="block opacity-70 mb-1">Notes (optional)</span>
            <input
              name="notes"
              type="text"
              placeholder="e.g. £120k annual, paid Q1"
              className="w-full rounded border border-current/20 bg-transparent px-2 py-1.5"
            />
          </label>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-md bg-foreground text-background px-3 py-1.5 text-sm"
            >
              Save
            </button>
          </div>
        </form>

        <p className="text-xs opacity-60 mt-3">
          Pick at least one of MyHours client or Xero contact. If you pick both and they&apos;re in
          the same mapping group, the amount lands on that row. If neither matches anything, it
          appears as its own row using the name above.
        </p>
      </section>

      <section>
        <h2 className="font-medium mb-2">Existing entries ({items.length})</h2>
        {items.length === 0 ? (
          <p className="text-sm opacity-70">Nothing yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-foreground/5 text-left">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2 text-right">£/month</th>
                  <th className="px-3 py-2">MyHours</th>
                  <th className="px-3 py-2">Xero</th>
                  <th className="px-3 py-2">Effective</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-t border-black/5 dark:border-white/5">
                    <td className="px-3 py-2">
                      <div>{r.name}</div>
                      {r.notes && <div className="text-xs opacity-60">{r.notes}</div>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.amount.toFixed(2)}</td>
                    <td className="px-3 py-2">{r.myHoursClientName ?? <span className="opacity-50">—</span>}</td>
                    <td className="px-3 py-2">{r.xeroContactName ?? <span className="opacity-50">—</span>}</td>
                    <td className="px-3 py-2">
                      {r.effectiveFrom || r.effectiveTo ? (
                        <span className="text-xs">
                          {r.effectiveFrom ?? "…"} → {r.effectiveTo ?? "…"}
                        </span>
                      ) : (
                        <span className="opacity-50 text-xs">always</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <form action={deleteRecurring}>
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          type="submit"
                          className="text-xs underline opacity-70 hover:opacity-100"
                        >
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  step?: string;
  placeholder?: string;
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
        className="w-full rounded border border-current/20 bg-transparent px-2 py-1.5"
      />
    </label>
  );
}
