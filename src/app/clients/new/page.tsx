import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentStaff, hasRole } from "@/lib/permissions";
import { ClientForm } from "../ClientForm";
import { createClient } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  const me = await currentStaff();
  if (!me || !hasRole(me.role, "MANAGER")) {
    return <p className="text-sm opacity-70">Permission denied — Practice Managers and Founders only.</p>;
  }

  const staff = await prisma.staff.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs opacity-60 mb-1">
          <Link className="hover:underline" href="/clients">Clients</Link> /{" "}
          <span>New</span>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">New Client</h1>
      </header>

      <section className="rounded-lg border border-black/10 dark:border-white/10 p-4">
        <ClientForm action={createClient} client={null} staff={staff} submitLabel="Create Client" />
      </section>
    </div>
  );
}
