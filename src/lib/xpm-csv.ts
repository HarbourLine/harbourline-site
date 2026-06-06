import Papa from "papaparse";
import type { XpmClient, XpmContact } from "./xpm-sync";

// Lookup the first present value from a row, given an ordered list of
// candidate column names. Case-insensitive, whitespace-tolerant — so we
// can absorb the various header spellings XPM uses in its exports
// ("Client ID" / "ClientID" / "ID" / "GUID" etc.).
function pick(row: Record<string, string>, candidates: string[]): string | undefined {
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  // Pre-normalise the row keys once.
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

function rowToClient(row: Record<string, string>): XpmClient | null {
  const id = pick(row, ["Client ID", "ClientID", "ID", "GUID", "UUID"]);
  const name = pick(row, ["Name", "Client Name", "Client", "Business Name"]);
  if (!id || !name) return null;

  // Address — XPM exports often give one column per line.
  const addressParts = [
    pick(row, ["Address 1", "Address1", "Postal Address 1", "Street 1"]),
    pick(row, ["Address 2", "Address2", "Postal Address 2", "Street 2"]),
    pick(row, ["Address 3", "Address3"]),
    pick(row, ["City", "Town", "Suburb"]),
    pick(row, ["Region", "County", "State"]),
    pick(row, ["Post Code", "PostCode", "Postcode", "Zip"]),
    pick(row, ["Country"]),
  ].filter((p): p is string => Boolean(p && p.length > 0));
  const tradingAddress = addressParts.length > 0 ? addressParts.join("\n") : undefined;

  return {
    id,
    name,
    status: pick(row, ["Status", "Client Status"]) ?? "ACTIVE",
    type: pick(row, ["Type", "Client Type", "Category"]),
    email: pick(row, ["Email", "Primary Email"]),
    phone: pick(row, ["Phone", "Phone Number"]),
    website: pick(row, ["Website", "URL"]),
    taxNumber: pick(row, ["VAT Number", "VAT", "Tax Number", "TaxNumber"]),
    businessNumber: pick(row, ["Company Number", "CompanyNumber", "Business Number", "BusinessNumber"]),
    utr: pick(row, ["UTR", "Unique Taxpayer Reference"]),
    payeReference: pick(row, ["PAYE", "PAYE Reference", "PAYEReference"]),
    fyEndDay: toNumberOrUndef(pick(row, ["FY End Day", "Financial Year End Day", "Year End Day"])),
    fyEndMonth: toNumberOrUndef(pick(row, ["FY End Month", "Financial Year End Month", "Year End Month"])),
    postalAddress: tradingAddress,
    physicalAddress: tradingAddress,
    customFields: undefined,
    primaryContactId: pick(row, ["Primary Contact ID", "PrimaryContactID"]),
  };
}

function rowToContact(row: Record<string, string>): XpmContact | null {
  const id = pick(row, ["Contact ID", "ContactID", "ID", "GUID"]);
  if (!id) return null;
  // Client linkage — XPM CSV may use either ClientID or the client's name.
  const clientId =
    pick(row, ["Client ID", "ClientID"]) ??
    pick(row, ["Client", "Client Name"]); // fallback to name; sync layer matches by xpmClientId so name match fails — we handle this in the sync step
  return {
    id,
    firstName: pick(row, ["First Name", "FirstName", "Given Name"]),
    lastName: pick(row, ["Last Name", "LastName", "Surname", "Family Name"]),
    email: pick(row, ["Email", "Email Address"]),
    phone: pick(row, ["Phone", "Phone Number"]),
    mobile: pick(row, ["Mobile", "Mobile Number", "Cell"]),
    jobTitle: pick(row, ["Job Title", "JobTitle", "Position", "Role"]),
    clientIds: clientId ? [clientId] : [],
    isPrimary: undefined,
  };
}

export function parseClientsCsv(text: string): XpmClient[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return result.data
    .map((r) => rowToClient(r))
    .filter((c): c is XpmClient => c !== null);
}

export function parseContactsCsv(text: string): XpmContact[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return result.data
    .map((r) => rowToContact(r))
    .filter((c): c is XpmContact => c !== null);
}
