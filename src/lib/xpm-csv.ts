import Papa from "papaparse";
import type { XpmClient, XpmContact } from "./xpm-sync";

// Lookup the first present value from a row, given an ordered list of
// candidate column names. Case-insensitive, whitespace-tolerant — so we
// can absorb the various header spellings XPM uses ("StreetAddress1" /
// "Street Address 1" / "Address1" etc.).
function pick(row: Record<string, string>, candidates: string[]): string | undefined {
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const lookup = new Map<string, string>();
  for (const [k, v] of Object.entries(row)) lookup.set(norm(k), (v ?? "").trim());
  for (const c of candidates) {
    const v = lookup.get(norm(c));
    if (v) return v;
  }
  return undefined;
}

function toNumberOrUndef(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

// Build a multi-line address from a numbered set of address columns plus
// city/region/postcode/country. Drops empty parts; returns undefined if the
// whole address would be empty.
function buildAddress(
  row: Record<string, string>,
  prefix: "Street" | "Postal",
): string | undefined {
  const parts = [
    pick(row, [`${prefix}Address1`, `${prefix} Address 1`, `${prefix}1`]),
    pick(row, [`${prefix}Address2`, `${prefix} Address 2`, `${prefix}2`]),
    pick(row, [`${prefix}Address3`, `${prefix} Address 3`, `${prefix}3`]),
    pick(row, [`${prefix}Address4`, `${prefix} Address 4`, `${prefix}4`]),
    pick(row, [`${prefix}Address5`, `${prefix} Address 5`, `${prefix}5`]),
    pick(row, [`${prefix}City`, "City", "Town", "Suburb"]),
    pick(row, [`${prefix}Region`, "Region", "County", "State"]),
    pick(row, [`${prefix}PostCode`, "PostCode", "Post Code", "Postcode", "Zip"]),
    pick(row, [`${prefix}Country`, "Country"]),
  ].filter((p): p is string => Boolean(p && p.length > 0));
  return parts.length > 0 ? parts.join("\n") : undefined;
}

function rowToClient(row: Record<string, string>): XpmClient | null {
  // XPM exports use UUID as the canonical client identifier.
  const id = pick(row, ["UUID", "ClientID", "Client ID", "ID", "GUID"]);
  const name = pick(row, ["Name", "Client Name", "Client", "Business Name"]);
  if (!id || !name) return null;

  return {
    id,
    name,
    status: pick(row, ["Status", "Client Status"]) ?? "ACTIVE",
    type: pick(row, ["Type", "Client Type", "Category"]),
    email: pick(row, ["Email", "Primary Email"]),
    phone: pick(row, ["Phone", "Phone Number"]),
    website: pick(row, ["WebSite", "Website", "URL"]),
    taxNumber: pick(row, ["VAT Number", "VAT", "Tax Number", "TaxNumber"]),
    businessNumber: pick(row, [
      "Company Number",
      "CompanyNumber",
      "Business Number",
      "BusinessNumber",
    ]),
    utr: pick(row, ["UTR", "Unique Taxpayer Reference"]),
    payeReference: pick(row, ["PAYE", "PAYE Reference", "PAYEReference"]),
    fyEndDay: toNumberOrUndef(pick(row, ["FY End Day", "Financial Year End Day", "Year End Day"])),
    fyEndMonth: toNumberOrUndef(pick(row, ["FY End Month", "Financial Year End Month", "Year End Month"])),
    physicalAddress: buildAddress(row, "Street"),
    postalAddress: buildAddress(row, "Postal"),
    customFields: undefined,
    primaryContactId: undefined,
  };
}

// Split a single "John Smith" / "Mary Anne Smith" into first + last on the
// LAST whitespace, which is the conventional read for English names.
function splitName(full: string): { firstName: string; lastName?: string } {
  const trimmed = full.trim();
  if (!trimmed) return { firstName: "" };
  const idx = trimmed.lastIndexOf(" ");
  if (idx < 0) return { firstName: trimmed };
  return { firstName: trimmed.slice(0, idx).trim(), lastName: trimmed.slice(idx + 1).trim() };
}

function rowToContact(row: Record<string, string>): XpmContact | null {
  // XPM uses ContactUUID as the canonical contact identifier; ClientUUID is
  // the cross-reference back to the Client.
  const id = pick(row, ["ContactUUID", "Contact ID", "ContactID", "ID", "GUID"]);
  if (!id) return null;
  const clientId = pick(row, ["ClientUUID", "Client UUID", "Client ID", "ClientID"]);
  const fullName = pick(row, ["ContactName", "Contact Name", "Full Name", "Name"]);
  const split = fullName ? splitName(fullName) : { firstName: undefined, lastName: undefined };
  const firstName = pick(row, ["First Name", "FirstName", "Given Name"]) ?? split.firstName;
  const lastName = pick(row, ["Last Name", "LastName", "Surname", "Family Name"]) ?? split.lastName;
  return {
    id,
    firstName,
    lastName,
    email: pick(row, ["ContactEmail", "Email", "Email Address"]),
    phone: pick(row, ["ContactPhone", "Phone", "Phone Number"]),
    mobile: pick(row, ["ContactMobile", "Mobile", "Mobile Number", "Cell"]),
    jobTitle: pick(row, ["ContactPosition", "Job Title", "JobTitle", "Position", "Role"]),
    clientIds: clientId ? [clientId] : [],
    isPrimary: undefined,
  };
}

export function parseClientsCsv(text: string): XpmClient[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^﻿/, ""), // strip BOM
    delimiter: "", // auto-detect (comma / tab / pipe / semicolon)
    delimitersToGuess: [",", "\t", "|", ";"],
  });
  return result.data
    .map((r) => rowToClient(r))
    .filter((c): c is XpmClient => c !== null);
}

export function parseContactsCsv(text: string): XpmContact[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^﻿/, ""),
    delimiter: "",
    delimitersToGuess: [",", "\t", "|", ";"],
  });
  return result.data
    .map((r) => rowToContact(r))
    .filter((c): c is XpmContact => c !== null);
}

// Diagnostic — return shape info about what was parsed so we can show it on
// the UI when something doesn't look right. Helps distinguish "delimiter
// wrong" from "column names wrong" from "data wasn't there to start with".
export function diagnoseClients(text: string): {
  rowCount: number;
  headers: string[];
  withEmail: number;
  withPhone: number;
  withWebsite: number;
  withAddress: number;
  withVatNumber: number;
  withCompanyNumber: number;
} {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^﻿/, ""),
    delimiter: "",
    delimitersToGuess: [",", "\t", "|", ";"],
  });
  const rows = result.data;
  const headers = result.meta.fields ?? [];
  let withEmail = 0, withPhone = 0, withWebsite = 0, withAddress = 0;
  let withVatNumber = 0, withCompanyNumber = 0;
  for (const r of rows) {
    const c = rowToClient(r);
    if (!c) continue;
    if (c.email) withEmail++;
    if (c.phone) withPhone++;
    if (c.website) withWebsite++;
    if (c.physicalAddress || c.postalAddress) withAddress++;
    if (c.taxNumber) withVatNumber++;
    if (c.businessNumber) withCompanyNumber++;
  }
  return {
    rowCount: rows.length,
    headers,
    withEmail,
    withPhone,
    withWebsite,
    withAddress,
    withVatNumber,
    withCompanyNumber,
  };
}

export function diagnoseContacts(text: string): {
  rowCount: number;
  headers: string[];
  withId: number;
  withClientId: number;
  withName: number;
} {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^﻿/, ""),
    delimiter: "",
    delimitersToGuess: [",", "\t", "|", ";"],
  });
  const rows = result.data;
  const headers = result.meta.fields ?? [];
  let withId = 0, withClientId = 0, withName = 0;
  for (const r of rows) {
    const ct = rowToContact(r);
    if (!ct) continue;
    if (ct.id) withId++;
    if (ct.clientIds.length > 0) withClientId++;
    if (ct.firstName || ct.lastName) withName++;
  }
  return { rowCount: rows.length, headers, withId, withClientId, withName };
}
