import Link from "next/link";
import { prisma } from "@/lib/db";
import { addExclusions, deleteExclusion } from "./actions";

export const dynamic = "force-dynamic";

export default async function ExclusionsPage() {
  const exclusions = await prisma.excludedName.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs opacity-60 mb-1">
          <Link className="hover:underline" href="/settings">Settings</Link> /{" "}
          <span>Name Exclusions</span>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Name Exclusions</h1>
        <p className="text-sm opacity-70 mt-1">
          Names listed here are skipped on the Reconcile page on both sides — any MyHours client
          whose name matches, and any Xero contact whose name matches, are filtered out. Use for
          internal time tracking, archived clients, or names you don&apos;t want surfaced.
          Matching is case-insensitive.
        </p>
      </header>

      <section className="rounded-lg border border-black/10 dark:border-white/10 p-4">
        <h2 className="font-medium mb-3">Add Exclusions</h2>
        <form action={addExclusions} className="space-y-3">
          <label className="block text-sm">
            <span className="block opacity-70 mb-1">Paste one name per line</span>
            <textarea
              name="names"
              rows={6}
              placeholder={
                "Andrew Smith Bookkeeping Services Limited\nClaire Yateman\nFire Control Systems Ltd"
              }
              className="w-full rounded border border-current/20 bg-transparent px-2 py-1.5 font-mono text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-foreground text-background px-3 py-1.5 text-sm"
          >
            Add all
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-medium mb-2">Current Exclusions ({exclusions.length})</h2>
        {exclusions.length === 0 ? (
          <p className="text-sm opacity-70">No exclusions yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-foreground/5 text-left">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {exclusions.map((e) => (
                  <tr key={e.id} className="border-t border-black/5 dark:border-white/5">
                    <td className="px-3 py-2">{e.name}</td>
                    <td className="px-3 py-2 text-right">
                      <form action={deleteExclusion}>
                        <input type="hidden" name="id" value={e.id} />
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
