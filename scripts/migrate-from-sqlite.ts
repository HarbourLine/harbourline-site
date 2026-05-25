// One-off migration: copy every row from the local SQLite dev.db into the
// currently-configured Postgres DATABASE_URL. Safe to re-run — it upserts
// by primary key, so existing rows in Postgres are updated rather than
// duplicated.
//
// Usage:
//   1. Make sure DATABASE_URL in .env / .env.local points at your Neon DB.
//   2. Run `npx prisma db push` to create the tables on Neon.
//   3. Run `npm run db:migrate-from-sqlite`.
//
// The source SQLite file path defaults to ./prisma/dev.db; override with
// SQLITE_PATH=/abs/path/dev.db if you've moved it.

import Database from "better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const SQLITE_PATH = resolve(process.env.SQLITE_PATH ?? "prisma/dev.db");

if (!existsSync(SQLITE_PATH)) {
  console.error(`No SQLite file found at ${SQLITE_PATH}.`);
  process.exit(1);
}

const sqlite = new Database(SQLITE_PATH, { readonly: true });
const prisma = new PrismaClient();

interface XeroRow {
  id: string;
  tenantId: string;
  tenantName: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string | number;
  scope: string;
  createdAt: string | number;
  updatedAt: string | number;
}
interface MappingRow {
  id: string;
  myHoursClientName: string;
  xeroContactId: string;
  xeroContactName: string;
  hourlyRate: number | null;
  createdAt: string | number;
  updatedAt: string | number;
}
interface ExclusionRow {
  id: string;
  name: string;
  createdAt: string | number;
}
interface RecurringRow {
  id: string;
  name: string;
  amount: number;
  myHoursClientName: string | null;
  xeroContactId: string | null;
  xeroContactName: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  notes: string | null;
  createdAt: string | number;
  updatedAt: string | number;
}

// SQLite stores DateTime as ms-since-epoch (Prisma default). Normalise both
// number and ISO-string forms.
function toDate(v: string | number): Date {
  return typeof v === "number" ? new Date(v) : new Date(v);
}

function tableExists(name: string): boolean {
  const row = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .get(name);
  return !!row;
}

async function main() {
  console.log(`Reading from ${SQLITE_PATH}`);
  console.log(`Writing to ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":****@")}`);

  let totals = { xero: 0, mappings: 0, exclusions: 0, recurring: 0 };

  if (tableExists("XeroConnection")) {
    const rows = sqlite.prepare(`SELECT * FROM XeroConnection`).all() as XeroRow[];
    for (const r of rows) {
      await prisma.xeroConnection.upsert({
        where: { id: r.id },
        create: {
          id: r.id,
          tenantId: r.tenantId,
          tenantName: r.tenantName,
          accessToken: r.accessToken,
          refreshToken: r.refreshToken,
          expiresAt: toDate(r.expiresAt),
          scope: r.scope,
          createdAt: toDate(r.createdAt),
          updatedAt: toDate(r.updatedAt),
        },
        update: {
          tenantId: r.tenantId,
          tenantName: r.tenantName,
          accessToken: r.accessToken,
          refreshToken: r.refreshToken,
          expiresAt: toDate(r.expiresAt),
          scope: r.scope,
        },
      });
      totals.xero++;
    }
  }

  if (tableExists("ClientMapping")) {
    const rows = sqlite.prepare(`SELECT * FROM ClientMapping`).all() as MappingRow[];
    for (const r of rows) {
      await prisma.clientMapping.upsert({
        where: { id: r.id },
        create: {
          id: r.id,
          myHoursClientName: r.myHoursClientName,
          xeroContactId: r.xeroContactId,
          xeroContactName: r.xeroContactName,
          hourlyRate: r.hourlyRate,
          createdAt: toDate(r.createdAt),
          updatedAt: toDate(r.updatedAt),
        },
        update: {
          xeroContactName: r.xeroContactName,
          hourlyRate: r.hourlyRate,
        },
      });
      totals.mappings++;
    }
  }

  if (tableExists("ExcludedName")) {
    const rows = sqlite.prepare(`SELECT * FROM ExcludedName`).all() as ExclusionRow[];
    for (const r of rows) {
      await prisma.excludedName.upsert({
        where: { id: r.id },
        create: { id: r.id, name: r.name, createdAt: toDate(r.createdAt) },
        update: { name: r.name },
      });
      totals.exclusions++;
    }
  }

  if (tableExists("RecurringBilling")) {
    const rows = sqlite.prepare(`SELECT * FROM RecurringBilling`).all() as RecurringRow[];
    for (const r of rows) {
      await prisma.recurringBilling.upsert({
        where: { id: r.id },
        create: {
          id: r.id,
          name: r.name,
          amount: r.amount,
          myHoursClientName: r.myHoursClientName,
          xeroContactId: r.xeroContactId,
          xeroContactName: r.xeroContactName,
          effectiveFrom: r.effectiveFrom,
          effectiveTo: r.effectiveTo,
          notes: r.notes,
          createdAt: toDate(r.createdAt),
          updatedAt: toDate(r.updatedAt),
        },
        update: {
          name: r.name,
          amount: r.amount,
          myHoursClientName: r.myHoursClientName,
          xeroContactId: r.xeroContactId,
          xeroContactName: r.xeroContactName,
          effectiveFrom: r.effectiveFrom,
          effectiveTo: r.effectiveTo,
          notes: r.notes,
        },
      });
      totals.recurring++;
    }
  }

  console.log("Done.");
  console.log(`  XeroConnection:    ${totals.xero}`);
  console.log(`  ClientMapping:     ${totals.mappings}`);
  console.log(`  ExcludedName:      ${totals.exclusions}`);
  console.log(`  RecurringBilling:  ${totals.recurring}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    sqlite.close();
    await prisma.$disconnect();
  });
