import { prisma } from "@/lib/db";
import * as mh from "@/lib/myhours";
import * as xero from "@/lib/xero";
import { deleteMapping, upsertMapping } from "./actions";

export const dynamic = "force-dynamic";

export default async function MappingsPage() {
  const mappings = await prisma.clientMapping.findMany({
    orderBy: { myHoursClientName: "asc" },
  });

  // Fetch both pickers' source data in parallel. If either fails, the form
  // falls back to plain text inputs so you can still set mappings manually.
  let myHoursClients: { id: number; name: string }[] = [];
  let xeroContacts: { id: string; name: string }[] = [];
  let myHoursError: string | null = null;
  let xeroError: string | null = null;

  await Promise.all([
    mh
      .listClients()
      .then((cs) => {
        myHoursClients = cs.sort((a, b) => a.name.localeCompare(b.name));
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

  const mappedNames = new Set(mappings.map((m) => m.myHoursClientName));
  const mappedXeroIds = new Set(mappings.map((m) => m.xeroContactId));

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

        {(myHoursError || xeroError) && (
          <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            {myHoursError && <div>Couldn&apos;t load MyHours clients: {myHoursError}</div>}
            {xeroError && <div>Couldn&apos;t load Xero contacts: {xeroError}</div>}
          </div>
        )}

        <form action={upsertMapping} className="grid gap-3 sm:grid-cols-2">
          <Select
            name="myHoursClientName"
            label="MyHours client"
            required
            disabled={!!myHoursError}
            placeholder={myHoursError ? "Unavailable" : "— choose —"}
            options={myHoursClients.map((c) => ({
              value: c.name,
              label: mappedNames.has(c.name) ? `${c.name} (already mapped)` : c.name,
            }))}
            fallbackInputHint="(API unavailable — paste MyHours client name exactly as it appears in MyHours)"
            fallback={!!myHoursError}
          />

          <Select
            name="xeroContact"
            label="Xero contact"
            required
            disabled={!!xeroError}
            placeholder={xeroError ? "Unavailable" : "— choose —"}
            options={xeroContacts.map((c) => ({
              value: `${c.id}|${c.name}`,
              label: mappedXeroIds.has(c.id) ? `${c.name} (already mapped)` : c.name,
            }))}
            fallbackInputHint="(API unavailable — paste 'contactGUID|Contact Name')"
            fallback={!!xeroError}
          />

          <label className="text-sm">
            <span className="block opacity-70 mb-1">Hourly rate (optional)</span>
            <input
              name="hourlyRate"
              type="number"
              step="0.01"
              className="w-full rounded border border-current/20 bg-transparent px-2 py-1.5"
            />
          </label>

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
          Choosing an already-mapped client updates the existing mapping.
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
                  <th className="px-3 py-2">MyHours client</th>
                  <th className="px-3 py-2">Xero contact</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <tr key={m.id} className="border-t border-black/5 dark:border-white/5">
                    <td className="px-3 py-2">{m.myHoursClientName}</td>
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

function Select({
  name,
  label,
  required,
  disabled,
  placeholder,
  options,
  fallback,
  fallbackInputHint,
}: {
  name: string;
  label: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  options: { value: string; label: string }[];
  fallback?: boolean;
  fallbackInputHint?: string;
}) {
  return (
    <label className="text-sm">
      <span className="block opacity-70 mb-1">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {fallback ? (
        <>
          <input
            name={name}
            required={required}
            className="w-full rounded border border-current/20 bg-transparent px-2 py-1.5"
          />
          {fallbackInputHint && <span className="block text-xs opacity-60 mt-1">{fallbackInputHint}</span>}
        </>
      ) : (
        <select
          name={name}
          required={required}
          disabled={disabled}
          defaultValue=""
          className="w-full rounded border border-current/20 bg-transparent px-2 py-1.5"
        >
          <option value="" disabled>
            {placeholder ?? "— choose —"}
          </option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </label>
  );
}
