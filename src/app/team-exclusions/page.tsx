import Link from "next/link";
import { prisma } from "@/lib/db";
import * as mh from "@/lib/myhours";
import { addTeamExclusion, removeTeamExclusion } from "./actions";

export const dynamic = "force-dynamic";

export default async function TeamExclusionsPage() {
  const myHoursReady = Boolean(process.env.MYHOURS_API_KEY);
  const existing = await prisma.excludedTeamMember.findMany({ orderBy: { name: "asc" } });
  const excludedIds = new Set(existing.map((e) => e.userId));

  let users: { id: number; name: string }[] = [];
  let usersError: string | null = null;
  if (myHoursReady) {
    try {
      users = await mh.listUsers();
      users.sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      usersError = e instanceof Error ? e.message : String(e);
    }
  }

  // Anyone in the exclusion table who isn't in the current MyHours list
  // (departed staff). Still listed so the user can remove them later.
  const orphanedExclusions = existing.filter((e) => !users.some((u) => u.id === e.userId));

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs opacity-60 mb-1">
          <Link className="hover:underline" href="/settings">Settings</Link> /{" "}
          <span>Team Exclusions</span>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Team Exclusions</h1>
        <p className="text-sm opacity-70 mt-1">
          Hide specific people from the Team page — useful for the owner, support roles, or
          anyone who&apos;s left. Their hours and earnings still flow through the client-side
          calculations on the Dashboard and Reconcile pages; they just don&apos;t appear as
          a row on Team.
        </p>
      </header>

      {!myHoursReady && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          MyHours API key not set — can&apos;t list users.
        </div>
      )}
      {usersError && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
          Couldn&apos;t load MyHours users: {usersError}
        </div>
      )}

      <section>
        <h2 className="font-medium mb-3">Currently Excluded ({existing.length})</h2>
        {existing.length === 0 ? (
          <p className="text-sm opacity-70">
            Nothing excluded. Pick people from the MyHours list below to hide them.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-foreground/5 text-left">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">MyHours User ID</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {existing.map((e) => (
                  <tr key={e.id} className="border-t border-black/5 dark:border-white/5">
                    <td className="px-3 py-2">{e.name}</td>
                    <td className="px-3 py-2 font-mono opacity-70">{e.userId}</td>
                    <td className="px-3 py-2 text-right">
                      <form action={removeTeamExclusion}>
                        <input type="hidden" name="id" value={e.id} />
                        <button
                          type="submit"
                          className="text-xs underline opacity-70 hover:opacity-100"
                        >
                          Show on Team page
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {orphanedExclusions.length > 0 && (
          <p className="text-xs opacity-60 mt-2">
            {orphanedExclusions.length} excluded user
            {orphanedExclusions.length === 1 ? " is" : "s are"} no longer in MyHours
            (departed staff). The exclusion still applies, just in case they reappear.
          </p>
        )}
      </section>

      <section>
        <h2 className="font-medium mb-3">MyHours Team ({users.length})</h2>
        {users.length === 0 && !usersError && myHoursReady && (
          <p className="text-sm opacity-70">No users found in MyHours.</p>
        )}
        {users.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-foreground/5 text-left">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">User ID</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isExcluded = excludedIds.has(u.id);
                  return (
                    <tr
                      key={u.id}
                      className={`border-t border-black/5 dark:border-white/5 ${
                        isExcluded ? "opacity-60" : ""
                      }`}
                    >
                      <td className="px-3 py-2">{u.name}</td>
                      <td className="px-3 py-2 font-mono opacity-70">{u.id}</td>
                      <td className="px-3 py-2 text-right">
                        {isExcluded ? (
                          <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                            Hidden
                          </span>
                        ) : (
                          <form action={addTeamExclusion}>
                            <input type="hidden" name="userId" value={u.id} />
                            <input type="hidden" name="name" value={u.name} />
                            <button
                              type="submit"
                              className="text-xs rounded-md bg-foreground text-background px-2 py-1"
                            >
                              Hide
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
