import { prisma } from "./db";

// Xero OAuth 2.0 + Accounting API.
// Docs: https://developer.xero.com/documentation/guides/oauth2/auth-flow

const AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const CONNECTIONS_URL = "https://api.xero.com/connections";
const API_BASE = "https://api.xero.com/api.xro/2.0";

// Xero introduced granular scopes on 2 March 2026. Apps created on/after
// that date no longer have access to the broad scopes (accounting.transactions,
// accounting.contacts). We use the granular .read variants where possible,
// plus a write scope for the auto-invoice feature.
// Docs: https://developer.xero.com/documentation/guides/oauth2/scopes/
//
// accounting.invoices covers read+write on Invoices (supersedes the .read
// variant we used previously). After updating this list, the user must
// disconnect + reconnect Xero from the dashboard so the new permissions
// are granted to the refresh token.
export const XERO_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "email",
  "accounting.invoices",
  "accounting.contacts.read",
].join(" ");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function buildAuthUrl(state: string): string {
  // Build manually rather than URLSearchParams: the latter encodes spaces
  // as `+`, but Xero's authorize endpoint requires `%20` between scope
  // values — otherwise it treats the whole thing as one bogus scope.
  const params = [
    ["response_type", "code"],
    ["client_id", requireEnv("XERO_CLIENT_ID")],
    ["redirect_uri", requireEnv("XERO_REDIRECT_URI")],
    ["scope", XERO_SCOPES],
    ["state", state],
  ]
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${AUTH_URL}?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface XeroTenantConnection {
  id: string;
  tenantId: string;
  tenantType: string;
  tenantName: string;
  createdDateUtc: string;
  updatedDateUtc: string;
}

function basicAuthHeader(): string {
  const id = requireEnv("XERO_CLIENT_ID");
  const secret = requireEnv("XERO_CLIENT_SECRET");
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: requireEnv("XERO_REDIRECT_URI"),
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`Xero token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`Xero token refresh failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function listConnections(accessToken: string): Promise<XeroTenantConnection[]> {
  const res = await fetch(CONNECTIONS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Xero connections fetch failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function saveConnection(tokens: TokenResponse, tenant: XeroTenantConnection) {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  await prisma.xeroConnection.upsert({
    where: { tenantId: tenant.tenantId },
    update: {
      tenantName: tenant.tenantName,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      scope: tokens.scope,
    },
    create: {
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      scope: tokens.scope,
    },
  });
}

// Returns a valid access token for the (first) stored connection, refreshing if expired.
// Returns null if no connection exists.
export async function getActiveConnection() {
  const conn = await prisma.xeroConnection.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!conn) return null;

  // Refresh if within 60s of expiry.
  if (conn.expiresAt.getTime() - Date.now() < 60_000) {
    const refreshed = await refreshTokens(conn.refreshToken);
    const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
    const updated = await prisma.xeroConnection.update({
      where: { id: conn.id },
      data: {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresAt,
        scope: refreshed.scope,
      },
    });
    return updated;
  }
  return conn;
}

interface XeroContact {
  ContactID: string;
  Name: string;
  ContactStatus?: string;
}

interface XeroContactsResponse {
  Contacts: XeroContact[];
}

// Fetch all ACTIVE contacts (paginated, up to 100 per page). Used to populate
// the mapping picker.
export async function fetchActiveContacts(): Promise<{ id: string; name: string }[]> {
  const conn = await getActiveConnection();
  if (!conn) throw new Error("No Xero connection");
  const all: XeroContact[] = [];
  let page = 1;
  while (true) {
    const url = `${API_BASE}/Contacts?where=${encodeURIComponent('ContactStatus=="ACTIVE"')}&page=${page}&order=Name`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        "Xero-Tenant-Id": conn.tenantId,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(`Xero contacts fetch failed: ${res.status} ${await res.text()}`);
    }
    const data: XeroContactsResponse = await res.json();
    const batch = data.Contacts ?? [];
    all.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return all.map((c) => ({ id: c.ContactID, name: c.Name }));
}

export interface XeroLineItem {
  LineItemID?: string;
  Description?: string;
  Quantity?: number;
  UnitAmount?: number;
  AccountCode?: string;
  ItemCode?: string;
  LineAmount?: number; // ex-VAT, = Quantity * UnitAmount minus any line discount
  DiscountRate?: number;
  TaxType?: string;
  TaxAmount?: number;
}

export interface XeroInvoice {
  InvoiceID: string;
  InvoiceNumber?: string;
  Type: "ACCREC" | "ACCPAY";
  Status: string;
  Contact: { ContactID: string; Name: string };
  Date: string; // /Date(ms+offset)/
  DueDate?: string;
  SubTotal: number;
  TotalTax: number;
  Total: number;
  AmountDue?: number;
  AmountPaid?: number;
  CurrencyCode: string;
  LineItems?: XeroLineItem[];
}

interface XeroInvoicesResponse {
  Invoices: XeroInvoice[];
}

// Fetch all ACCREC invoices for the given month (UTC). Handles pagination if needed.
// Filters out DRAFT and DELETED by default — we want raised invoices.
export async function fetchInvoicesForMonth(year: number, month: number) {
  const conn = await getActiveConnection();
  if (!conn) throw new Error("No Xero connection");

  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));

  const where = [
    'Type=="ACCREC"',
    `Date>=DateTime(${from.getUTCFullYear()},${from.getUTCMonth() + 1},${from.getUTCDate()})`,
    `Date<DateTime(${to.getUTCFullYear()},${to.getUTCMonth() + 1},${to.getUTCDate()})`,
    'Status!="DELETED"',
    'Status!="DRAFT"',
  ].join("&&");

  const all: XeroInvoice[] = [];
  let page = 1;
  while (true) {
    // summaryOnly=false explicitly requests LineItems on each invoice. Without
    // this, paginated /Invoices returns header-only summaries (no line items),
    // and we can't apply account-code exclusions per line.
    const url = `${API_BASE}/Invoices?where=${encodeURIComponent(where)}&page=${page}&order=Date&summaryOnly=false`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        "Xero-Tenant-Id": conn.tenantId,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(`Xero invoices fetch failed: ${res.status} ${await res.text()}`);
    }
    const data: XeroInvoicesResponse = await res.json();
    const batch = data.Invoices ?? [];
    all.push(...batch);
    if (batch.length < 100) break; // Xero returns up to 100/page
    page += 1;
  }
  return all;
}

// Aggregated view of an account code as it actually appears on invoices —
// fuel for the /account-exclusions discovery page so the user picks codes by
// recognising them (sample descriptions + totals) rather than guessing.
export interface AccountCodeUsage {
  code: string;
  totalAmount: number;        // ex-VAT total across all matching lines
  lineCount: number;
  invoiceCount: number;
  sampleDescriptions: string[];   // up to 3 distinct, recent-first
}

// Aggregate account codes across the last N months of invoices.
// Fetches sequentially (one month at a time) to stay well clear of Xero's
// 60 calls/min rate limit. Discovery is cached upstream, so the latency hit
// of serialising is paid at most once per refresh.
export async function fetchAccountCodeUsage(monthsBack: number): Promise<AccountCodeUsage[]> {
  const now = new Date();
  const months: { year: number; month: number }[] = [];
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth() + 1;
  for (let i = 0; i < monthsBack; i++) {
    months.push({ year: y, month: m });
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }

  const allInvoices: XeroInvoice[] = [];
  for (const mo of months) {
    const batch = await fetchInvoicesForMonth(mo.year, mo.month);
    allInvoices.push(...batch);
  }

  const byCode = new Map<
    string,
    {
      code: string;
      totalAmount: number;
      lineCount: number;
      invoiceIds: Set<string>;
      descriptions: Map<string, number>; // dedupe + count
    }
  >();

  for (const inv of allInvoices) {
    for (const line of inv.LineItems ?? []) {
      const code = (line.AccountCode ?? "").trim();
      if (!code) continue;
      const existing = byCode.get(code) ?? {
        code,
        totalAmount: 0,
        lineCount: 0,
        invoiceIds: new Set<string>(),
        descriptions: new Map<string, number>(),
      };
      existing.totalAmount += line.LineAmount ?? 0;
      existing.lineCount += 1;
      existing.invoiceIds.add(inv.InvoiceID);
      const desc = (line.Description ?? "").trim();
      if (desc) existing.descriptions.set(desc, (existing.descriptions.get(desc) ?? 0) + 1);
      byCode.set(code, existing);
    }
  }

  const out: AccountCodeUsage[] = [...byCode.values()].map((v) => ({
    code: v.code,
    totalAmount: Math.round(v.totalAmount * 100) / 100,
    lineCount: v.lineCount,
    invoiceCount: v.invoiceIds.size,
    sampleDescriptions: [...v.descriptions.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([d]) => d),
  }));
  out.sort((a, b) => b.totalAmount - a.totalAmount);
  return out;
}

export interface CreateInvoiceLineItem {
  description: string;
  quantity: number;
  unitAmount: number;
  accountCode: string;
  taxType: string;
}

export interface CreateInvoiceParams {
  contactId: string;
  date: string;       // YYYY-MM-DD
  dueDate: string;    // YYYY-MM-DD
  reference?: string;
  status?: "DRAFT" | "AUTHORISED" | "SUBMITTED";
  lineItems: CreateInvoiceLineItem[];
}

export interface CreatedInvoice {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  total: number;
  subTotal: number;
  totalTax: number;
}

// Create a sales invoice (ACCREC) in Xero. Requires the accounting.invoices
// scope (read+write); a "Forbidden" error here means the refresh token was
// granted under read-only scopes and the user needs to reconnect.
export async function createInvoice(params: CreateInvoiceParams): Promise<CreatedInvoice> {
  const conn = await getActiveConnection();
  if (!conn) throw new Error("No Xero connection");

  const body = {
    Invoices: [
      {
        Type: "ACCREC",
        Contact: { ContactID: params.contactId },
        Date: params.date,
        DueDate: params.dueDate,
        Reference: params.reference ?? "",
        Status: params.status ?? "DRAFT",
        LineAmountTypes: "Exclusive", // line UnitAmounts are pre-VAT
        LineItems: params.lineItems.map((li) => ({
          Description: li.description,
          Quantity: li.quantity,
          UnitAmount: li.unitAmount,
          AccountCode: li.accountCode,
          TaxType: li.taxType,
        })),
      },
    ],
  };

  const res = await fetch(`${API_BASE}/Invoices`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.accessToken}`,
      "Xero-Tenant-Id": conn.tenantId,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 403) {
      throw new Error(
        "Xero rejected the request: missing write scope. Reconnect Xero from the dashboard so the new permissions are granted.",
      );
    }
    throw new Error(`Xero create invoice failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as {
    Invoices: Array<{
      InvoiceID: string;
      InvoiceNumber: string;
      Status: string;
      Total: number;
      SubTotal: number;
      TotalTax: number;
    }>;
  };
  const inv = data.Invoices?.[0];
  if (!inv) throw new Error("Xero create invoice returned no invoice");
  return {
    invoiceId: inv.InvoiceID,
    invoiceNumber: inv.InvoiceNumber,
    status: inv.Status,
    total: inv.Total,
    subTotal: inv.SubTotal,
    totalTax: inv.TotalTax,
  };
}
