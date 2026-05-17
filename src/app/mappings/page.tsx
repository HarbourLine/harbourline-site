import { prisma } from "@/lib/db";
import { deleteMapping, upsertMapping } from "./actions";

export const dynamic = "force-dynamic";

export default async function MappingsPage() {
  const mappings = await prisma.clientMapping.findMany({ orderBy: { myHoursName: "asc" } });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Client mappings</h1>
        <p className="text-sm opacity-70 mt-1">
          Link a MyHours client to a Xero contact. Optional per-client hourly rate overrides{" "}
          <code>DEFAULT_HOURLY_RATE</code>.
        </p>
      </header>

      <section className="rounded-lg border border-black/10 dark:border-white/10 p-4">
        <h2 className="font-medium mb-3">Add / update mapping</h2>
        <form action={upsertMapping} className="grid gap-3 sm:grid-cols-2">
          <Field name="myHoursClientId" label="MyHours client ID" required />
          <Field name="myHoursName" label="MyHours client name" />
          <Field name="xeroContactId" label="Xero contact ID (GUID)" required />
          <Field name="xeroContactName" label="Xero contact name" />
          <Field name="hourlyRate" label="Hourly rate (optional)" type="number" step="0.01" />
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-md bg-foreground text-background px-3 py-1.5 text-sm"
            >
              Save mapping
            </button>
          </div>
        </form>
        <p className="text-xs opacity-60 mt-3">
          For now, paste IDs manually. A picker UI that lists clients/contacts from each API is on the
          to-do list.
        </p>
      </section>

      <section>
        <h2 className="font-medium mb-2">Existing mappings ({mappings.length})</h2>
        {mappings.length === 0 ? (
          <p className="text-sm opacity-70">No mappings yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-foreground/5 text-left">
                <tr>
                  <th className="px-3 py-2">MyHours</th>
                  <th className="px-3 py-2">Xero contact</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <tr key={m.id} className="border-t border-black/5 dark:border-white/5">
                    <td className="px-3 py-2">
                      <div>{m.myHoursName || <span className="opacity-50">(no name)</span>}</div>
                      <div className="text-xs opacity-50 font-mono">{m.myHoursClientId}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div>{m.xeroContactName || <span className="opacity-50">(no name)</span>}</div>
                      <div className="text-xs opacity-50 font-mono">{m.xeroContactId}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {m.hourlyRate == null ? "—" : m.hourlyRate.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <form action={deleteMapping}>
                        <input type="hidden" name="id" value={m.id} />
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
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  step?: string;
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
        className="w-full rounded border border-current/20 bg-transparent px-2 py-1.5"
      />
    </label>
  );
}
