// Companies House public REST API client. Free, no quota beyond rate
// limiting (600 requests / 5 minutes / IP). Auth is HTTP Basic with the
// API key as the username and an empty password.
//
// Docs: https://developer.company-information.service.gov.uk/api/docs/

const BASE_URL = "https://api.company-information.service.gov.uk";

export interface CompanyProfile {
  companyNumber: string;
  companyName: string;
  registeredAddress: string | null;
  nextYearEnd: Date | null;
  nextAccountsDue: Date | null;
  nextConfirmationStatementDue: Date | null;
}

// CH company numbers are 8 chars. Older limited companies sometimes get
// stored as plain digits ("12345") — pad to 8 with leading zeros. Anything
// with non-digits (Scottish/NI prefixes like SC123456, NI012345) we send
// through unchanged.
function normaliseCompanyNumber(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!cleaned) throw new Error("Empty company number");
  return /^\d+$/.test(cleaned) ? cleaned.padStart(8, "0") : cleaned;
}

function toDateOrNull(s: unknown): Date | null {
  if (typeof s !== "string" || !s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

interface CompaniesHouseResponse {
  company_name?: string;
  registered_office_address?: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  };
  accounts?: {
    next_made_up_to?: string;
    next_due?: string;
  };
  confirmation_statement?: {
    next_due?: string;
  };
}

export async function fetchCompanyProfile(companyNumber: string): Promise<CompanyProfile> {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "COMPANIES_HOUSE_API_KEY is not configured. Add it in Vercel → Project → Settings → Environment Variables.",
    );
  }
  const number = normaliseCompanyNumber(companyNumber);
  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  const res = await fetch(`${BASE_URL}/company/${number}`, {
    headers: { Authorization: `Basic ${auth}` },
    cache: "no-store",
  });
  if (res.status === 404) {
    throw new Error(`Company ${number} not found at Companies House`);
  }
  if (res.status === 401) {
    throw new Error("Companies House rejected the API key. Check COMPANIES_HOUSE_API_KEY.");
  }
  if (!res.ok) {
    throw new Error(`Companies House: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as CompaniesHouseResponse;
  const addr = data.registered_office_address ?? {};
  const addressParts = [
    addr.address_line_1,
    addr.address_line_2,
    addr.locality,
    addr.region,
    addr.postal_code,
    addr.country,
  ].filter((p): p is string => Boolean(p && p.trim()));

  return {
    companyNumber: number,
    companyName: data.company_name ?? "",
    registeredAddress: addressParts.length > 0 ? addressParts.join("\n") : null,
    nextYearEnd: toDateOrNull(data.accounts?.next_made_up_to),
    nextAccountsDue: toDateOrNull(data.accounts?.next_due),
    nextConfirmationStatementDue: toDateOrNull(data.confirmation_statement?.next_due),
  };
}
