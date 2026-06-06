import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { fetchAllClients, fetchAllContacts, type XpmClient, type XpmContact } from "./xpm";

export type { XpmClient, XpmContact };

export interface XpmSyncResult {
  fetchedClients: number;
  fetchedContacts: number;
  clientsCreated: number;
  clientsUpdated: number;
  contactsCreated: number;
  contactsUpdated: number;
  contactsOrphaned: number; // contacts whose XPM ClientID we don't have
  errors: string[];
}

// Map XPM's status string onto our ClientStatus enum. XPM uses ACTIVE /
// PROSPECT / ARCHIVED most commonly; we fall back to ARCHIVED for anything
// non-active that we don't recognise, so nothing accidentally lands as
// ACTIVE.
function mapStatus(xpmStatus: string | undefined | null) {
  const s = (xpmStatus ?? "").trim().toUpperCase();
  if (s === "ACTIVE") return "ACTIVE" as const;
  if (s === "PROSPECT") return "LEAD" as const;
  if (s === "DORMANT") return "DORMANT" as const;
  if (s === "OFFBOARDED" || s === "OFFBOARDING") return "OFFBOARDED" as const;
  // ARCHIVED, INACTIVE, anything else — treat as archived so the row is
  // imported but doesn't pollute active-client lists.
  return "ARCHIVED" as const;
}

// Build a Date for the financial year end. XPM gives us day + month; the
// year is meaningless for display purposes so we anchor it to 2000 to
// keep it stable.
function fyEndDate(day?: number, month?: number): Date | null {
  if (!day || !month) return null;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return new Date(Date.UTC(2000, month - 1, day));
}

// Core upsert logic. Takes already-collected XPM data and writes it into the
// DB. Used by both the API-driven sync (syncFromXpm) and the CSV import path.
export async function syncWithData(
  clients: XpmClient[],
  contacts: XpmContact[],
): Promise<XpmSyncResult> {
  const result: XpmSyncResult = {
    fetchedClients: clients.length,
    fetchedContacts: contacts.length,
    clientsCreated: 0,
    clientsUpdated: 0,
    contactsCreated: 0,
    contactsUpdated: 0,
    contactsOrphaned: 0,
    errors: [],
  };

  // Upsert clients keyed by xpmClientId.
  const now = new Date();
  const xpmIdToOurId = new Map<string, string>();

  for (const c of clients) {
    if (!c.id) continue;
    const data = {
      name: c.name || "(unnamed)",
      status: mapStatus(c.status),
      xpmStatus: c.status,
      xpmLastSyncedAt: now,
      email: c.email ?? null,
      phone: c.phone ?? null,
      website: c.website ?? null,
      companyNumber: c.businessNumber ?? null,
      vatNumber: c.taxNumber ?? null,
      utr: c.utr ?? null,
      payeReference: c.payeReference ?? null,
      tradingAddress: c.physicalAddress ?? c.postalAddress ?? null,
      postalAddress: c.postalAddress ?? null,
      financialYearEnd: fyEndDate(c.fyEndDay, c.fyEndMonth),
      // Prisma JSON nullable fields need DbNull sentinel rather than plain
      // null, so we don't accidentally set the column to JSON null vs SQL NULL.
      customFields: c.customFields ? (c.customFields as Prisma.InputJsonValue) : Prisma.DbNull,
    };
    try {
      const existing = await prisma.client.findUnique({ where: { xpmClientId: c.id } });
      if (existing) {
        await prisma.client.update({
          where: { id: existing.id },
          data,
        });
        xpmIdToOurId.set(c.id, existing.id);
        result.clientsUpdated += 1;
      } else {
        const created = await prisma.client.create({
          data: { ...data, xpmClientId: c.id },
        });
        xpmIdToOurId.set(c.id, created.id);
        result.clientsCreated += 1;
      }
    } catch (e) {
      result.errors.push(
        `client ${c.id} (${c.name}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // Resolve primary contacts in a second pass (we couldn't know our Client
  // IDs while creating contacts). Build a map from XPM client → primary
  // contact's XPM ID first.
  const primaryContactByXpmClient = new Map<string, string>();
  for (const c of clients) {
    if (c.primaryContactId && c.id) primaryContactByXpmClient.set(c.id, c.primaryContactId);
  }

  // Upsert contacts.
  for (const ct of contacts) {
    if (!ct.id) continue;
    if (ct.clientIds.length === 0) {
      // Contact not attached to any client we know about — skip.
      result.contactsOrphaned += 1;
      continue;
    }
    // For now we attach to the first client only (XPM allows many; we'll
    // revisit when a real case demands it).
    const xpmClientId = ct.clientIds[0];
    const ourClientId = xpmIdToOurId.get(xpmClientId);
    if (!ourClientId) {
      result.contactsOrphaned += 1;
      continue;
    }
    const isPrimary = primaryContactByXpmClient.get(xpmClientId) === ct.id;
    const data = {
      firstName: ct.firstName ?? null,
      lastName: ct.lastName ?? null,
      email: ct.email ?? null,
      phone: ct.phone ?? null,
      mobile: ct.mobile ?? null,
      jobTitle: ct.jobTitle ?? null,
      isPrimary,
      xpmLastSyncedAt: now,
    };
    try {
      const existing = await prisma.contact.findUnique({ where: { xpmContactId: ct.id } });
      if (existing) {
        await prisma.contact.update({
          where: { id: existing.id },
          data: { ...data, clientId: ourClientId },
        });
        result.contactsUpdated += 1;
      } else {
        await prisma.contact.create({
          data: { ...data, clientId: ourClientId, xpmContactId: ct.id },
        });
        result.contactsCreated += 1;
      }
    } catch (e) {
      result.errors.push(
        `contact ${ct.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return result;
}

// Live-API path: fetches from XPM then runs the upsert. Requires the
// practicemanager scope on the Xero connection.
export async function syncFromXpm(includeArchived: boolean): Promise<XpmSyncResult> {
  let clients: XpmClient[] = [];
  let contacts: XpmContact[] = [];
  const errors: string[] = [];
  try {
    clients = await fetchAllClients(includeArchived);
  } catch (e) {
    errors.push(`fetchAllClients: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    contacts = await fetchAllContacts();
  } catch (e) {
    errors.push(`fetchAllContacts: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (errors.length > 0 && clients.length === 0) {
    return {
      fetchedClients: 0,
      fetchedContacts: 0,
      clientsCreated: 0,
      clientsUpdated: 0,
      contactsCreated: 0,
      contactsUpdated: 0,
      contactsOrphaned: 0,
      errors,
    };
  }
  const r = await syncWithData(clients, contacts);
  r.errors.unshift(...errors);
  return r;
}
