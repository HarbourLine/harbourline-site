import { prisma } from "./db";

// Connected-component pass over the legacy ClientMapping table → one Client
// per group, with a ClientLink for every distinct MyHours name and Xero
// contact in that group. Idempotent: any ClientLink that already exists is
// skipped, so this can be run repeatedly without producing duplicates.
export async function migrateFromClientMappings(): Promise<{
  groups: number;
  clientsCreated: number;
  linksCreated: number;
  skipped: number;
}> {
  const mappings = await prisma.clientMapping.findMany();

  // Union-find: each MH name and Xero contactId is a node; each row is an edge.
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    if (!parent.has(k)) parent.set(k, k);
    let cur = k;
    while (parent.get(cur) !== cur) cur = parent.get(cur)!;
    let node = k;
    while (parent.get(node) !== cur) {
      const next = parent.get(node)!;
      parent.set(node, cur);
      node = next;
    }
    return cur;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const m of mappings) {
    union(`mh:${m.myHoursClientName}`, `xero:${m.xeroContactId}`);
  }

  // Collect: root → group of distinct MH names + Xero (id → name) pairs.
  const groups = new Map<string, { mhNames: Set<string>; xero: Map<string, string> }>();
  for (const m of mappings) {
    const root = find(`mh:${m.myHoursClientName}`);
    let g = groups.get(root);
    if (!g) {
      g = { mhNames: new Set(), xero: new Map() };
      groups.set(root, g);
    }
    g.mhNames.add(m.myHoursClientName);
    g.xero.set(m.xeroContactId, m.xeroContactName);
  }

  let clientsCreated = 0;
  let linksCreated = 0;
  let skipped = 0;

  for (const g of groups.values()) {
    const mhArr = [...g.mhNames];
    const xeroArr = [...g.xero.entries()];

    // Pick a display name using the same rule the Reconcile page uses.
    let displayName: string;
    if (mhArr.length === 1) displayName = mhArr[0];
    else if (mhArr.length > 1 && xeroArr.length === 1) displayName = xeroArr[0][1];
    else if (mhArr.length === 0) displayName = xeroArr.map(([, n]) => n).join(" · ");
    else displayName = mhArr.join(" · ");

    const links: { source: string; externalKey: string; externalName: string | null }[] = [
      ...mhArr.map((n) => ({ source: "myhours", externalKey: n, externalName: null })),
      ...xeroArr.map(([id, name]) => ({ source: "xero", externalKey: id, externalName: name })),
    ];

    // If ANY link in this group already exists, that group has already been
    // migrated (or partially) — skip the whole group so we don't double up
    // or have to reconcile partials.
    let alreadyLinked = false;
    for (const link of links) {
      const existing = await prisma.clientLink.findUnique({
        where: { source_externalKey: { source: link.source, externalKey: link.externalKey } },
      });
      if (existing) {
        alreadyLinked = true;
        break;
      }
    }
    if (alreadyLinked) {
      skipped += 1;
      continue;
    }

    await prisma.client.create({
      data: {
        name: displayName,
        status: "ACTIVE",
        links: { create: links },
      },
    });
    clientsCreated += 1;
    linksCreated += links.length;
  }

  return { groups: groups.size, clientsCreated, linksCreated, skipped };
}
