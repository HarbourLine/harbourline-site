import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  currentStaff,
  hasRole,
  roleDescription,
  roleLabel,
  type Role,
} from "@/lib/permissions";
import { toggleActive, updateRole } from "./actions";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["OWNER", "MANAGER", "BOOKKEEPER"];

export default async function TeamPermissionsPage() {
  const me = await currentStaff();
  if (!me) {
    return <Forbidden message="Sign in required." />;
  }
  if (!hasRole(me.role, "MANAGER")) {
    return <Forbidden message="Team management is restricted to Practice Managers and Founders." />;
  }
  const isOwner = hasRole(me.role, "OWNER");

  const staff = await prisma.staff.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs opacity-60 mb-1">
          <Link className="hover:underline" href="/settings">Settings</Link> /{" "}
          <span>Team &amp; Permissions</span>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Team &amp; Permissions</h1>
        <p className="text-sm opacity-70 mt-1">
          ASBK Account Holders Are Automatically Granted Team Member Access.
        </p>
      </header>

      <section className="rounded-lg border border-black/10 dark:border-white/10 p-4">
        <h2 className="font-medium mb-3">Role Reference</h2>
        <ul className="space-y-2 text-sm">
          {ROLES.map((r) => (
            <li key={r}>
              <span className="font-medium">{roleLabel(r)}</span> —{" "}
              <span className="opacity-70">{roleDescription(r)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-medium mb-3">Staff ({staff.length})</h2>
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-foreground/5 text-left">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr
                  key={s.id}
                  className={`border-t border-black/5 dark:border-white/5 ${
                    !s.isActive ? "opacity-60" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    {s.name}
                    {s.id === me.staffId && (
                      <span className="text-xs opacity-60 ml-2">(you)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 opacity-70">{s.email}</td>
                  <td className="px-3 py-2">
                    {isOwner ? (
                      <form action={updateRole} className="flex items-center gap-2">
                        <input type="hidden" name="staffId" value={s.id} />
                        <select
                          name="role"
                          defaultValue={s.role}
                          className="rounded border border-current/20 bg-transparent px-2 py-1 text-xs"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {roleLabel(r)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="text-xs rounded-md border border-current/20 px-2 py-1 hover:bg-foreground/5"
                        >
                          Save
                        </button>
                      </form>
                    ) : (
                      <span>{roleLabel(s.role)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {s.isActive ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                        Active
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-foreground/10 opacity-70">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isOwner && s.id !== me.staffId && (
                      <form action={toggleActive}>
                        <input type="hidden" name="staffId" value={s.id} />
                        <button
                          type="submit"
                          className="text-xs underline opacity-70 hover:opacity-100"
                        >
                          {s.isActive ? "Deactivate" : "Reactivate"}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs opacity-60 mt-3">
          Role changes take effect the next time the person reloads a page.
          Deactivated staff can&apos;t sign in or appear in pickers.
        </p>
      </section>
    </div>
  );
}

function Forbidden({ message }: { message: string }) {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">Forbidden</h1>
      <p className="text-sm opacity-70">{message}</p>
      <Link href="/" className="text-sm underline">
        Back to dashboard
      </Link>
    </div>
  );
}
