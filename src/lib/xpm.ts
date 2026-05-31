import { XMLParser } from "fast-xml-parser";
import { getActiveConnection } from "./xero";

const XPM_API_BASE = "https://api.xero.com/practicemanager/3.0";

// Raw XPM Client shape — only the bits we actually map onto our model.
// Many XPM fields are camel-case in JSON but the API returns XML, so we
// parse and normalise here.
export interface XpmClient {
  id: string;                // GUID
  name: string;
  status: string;            // raw XPM status string
  type?: string;             // category/type
  email?: string;
  phone?: string;
  website?: string;
  taxNumber?: string;
  businessNumber?: string;
  utr?: string;
  payeReference?: string;
  fyEndDay?: number;
  fyEndMonth?: number;
  postalAddress?: string;    // formatted multi-line
  physicalAddress?: string;
  customFields?: Record<string, string>;
  primaryContactId?: string;
}

export interface XpmContact {
  id: string;                // GUID
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  jobTitle?: string;
  clientIds: string[];       // XPM contacts can be attached to multiple clients
  isPrimary?: boolean;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: true,
  parseAttributeValue: true,
  trimValues: true,
});

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

async function xpmFetch(path: string): Promise<unknown> {
  const conn = await getActiveConnection();
  if (!conn) throw new Error("No Xero connection");
  if (!conn.xpmTenantId) {
    throw new Error(
      "Xero Practice Manager tenant not connected. Reconnect Xero so the practicemanager scope is granted.",
    );
  }
  const res = await fetch(`${XPM_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${conn.accessToken}`,
      "Xero-Tenant-Id": conn.xpmTenantId,
      Accept: "application/xml",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`XPM ${path} failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const xml = await res.text();
  return xmlParser.parse(xml);
}

function extractAddress(node: unknown): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  const a = node as Record<string, unknown>;
  const lines = [
    a.Address1,
    a.Address2,
    a.Address3,
    a.Address4,
    a.City,
    a.Region,
    a.PostCode,
    a.Country,
  ]
    .map((v) => (v == null ? "" : String(v).trim()))
    .filter((v) => v.length > 0);
  return lines.length > 0 ? lines.join("\n") : undefined;
}

function extractCustomFields(node: unknown): Record<string, string> | undefined {
  if (!node || typeof node !== "object") return undefined;
  const out: Record<string, string> = {};
  const fields = asArray((node as Record<string, unknown>).CustomField as unknown);
  for (const f of fields) {
    if (!f || typeof f !== "object") continue;
    const ff = f as Record<string, unknown>;
    const name = String(ff.Name ?? ff.Key ?? "").trim();
    const value = String(ff.Value ?? ff.Text ?? "").trim();
    if (name && value) out[name] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normaliseClient(node: Record<string, unknown>): XpmClient {
  const addresses = asArray((node.Addresses as Record<string, unknown>)?.Address);
  const postal = addresses.find(
    (a) => (a as Record<string, unknown>).Type === "POSTAL",
  );
  const physical = addresses.find(
    (a) => (a as Record<string, unknown>).Type === "STREET" || (a as Record<string, unknown>).Type === "PHYSICAL",
  );
  return {
    id: String(node.ID ?? node.UUID ?? ""),
    name: String(node.Name ?? ""),
    status: String(node.Status ?? "ACTIVE"),
    type: node.Type ? String(node.Type) : undefined,
    email: node.Email ? String(node.Email) : undefined,
    phone: node.Phone ? String(node.Phone) : undefined,
    website: node.Website ? String(node.Website) : undefined,
    taxNumber: node.TaxNumber ? String(node.TaxNumber) : undefined,
    businessNumber: node.BusinessNumber ? String(node.BusinessNumber) : undefined,
    utr: node.UTR ? String(node.UTR) : undefined,
    payeReference: node.PAYEReference ? String(node.PAYEReference) : undefined,
    fyEndDay: node.FinancialYearEndDay ? Number(node.FinancialYearEndDay) : undefined,
    fyEndMonth: node.FinancialYearEndMonth ? Number(node.FinancialYearEndMonth) : undefined,
    postalAddress: extractAddress(postal),
    physicalAddress: extractAddress(physical),
    customFields: extractCustomFields(node.CustomFields),
    primaryContactId: node.PrimaryContactID ? String(node.PrimaryContactID) : undefined,
  };
}

function normaliseContact(node: Record<string, unknown>): XpmContact {
  const clientIds = asArray((node.Clients as Record<string, unknown>)?.Client).map((c) =>
    String((c as Record<string, unknown>).ID ?? ""),
  );
  return {
    id: String(node.ID ?? node.UUID ?? ""),
    firstName: node.FirstName ? String(node.FirstName) : undefined,
    lastName: node.LastName ? String(node.LastName) : undefined,
    email: node.Email ? String(node.Email) : undefined,
    phone: node.Phone ? String(node.Phone) : undefined,
    mobile: node.Mobile ? String(node.Mobile) : undefined,
    jobTitle: node.JobTitle ? String(node.JobTitle) : undefined,
    clientIds: clientIds.filter((c) => c.length > 0),
    isPrimary: undefined,
  };
}

// Pagination — XPM returns up to 100 per page. We loop until a page has
// fewer than 100 entries.
export async function fetchAllClients(includeArchived: boolean): Promise<XpmClient[]> {
  const out: XpmClient[] = [];
  let page = 1;
  while (true) {
    const status = includeArchived ? "ALL" : "ACTIVE";
    const raw = (await xpmFetch(`/Clients?page=${page}&status=${status}`)) as Record<string, unknown>;
    const root = raw.Response as Record<string, unknown> | undefined;
    const container = (root?.Clients as Record<string, unknown> | undefined) ?? {};
    const nodes = asArray(container.Client) as Record<string, unknown>[];
    for (const n of nodes) out.push(normaliseClient(n));
    if (nodes.length < 100) break;
    page += 1;
  }
  return out;
}

export async function fetchAllContacts(): Promise<XpmContact[]> {
  const out: XpmContact[] = [];
  let page = 1;
  while (true) {
    const raw = (await xpmFetch(`/Contacts?page=${page}`)) as Record<string, unknown>;
    const root = raw.Response as Record<string, unknown> | undefined;
    const container = (root?.Contacts as Record<string, unknown> | undefined) ?? {};
    const nodes = asArray(container.Contact) as Record<string, unknown>[];
    for (const n of nodes) out.push(normaliseContact(n));
    if (nodes.length < 100) break;
    page += 1;
  }
  return out;
}
