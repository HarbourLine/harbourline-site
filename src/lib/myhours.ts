// MyHours API client.
// Docs (v2): https://docs.myhours.com — auth via Bearer personal access token.
// Note: exact response shapes vary by endpoint; types below cover the fields we use.
// If the live API returns different field casing or names, narrow the parsing in one place here.

const API_BASE = "https://api2.myhours.com/api";

function requireKey(): string {
  const v = process.env.MYHOURS_API_KEY;
  if (!v) throw new Error("Missing env var: MYHOURS_API_KEY");
  return v;
}

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(API_BASE + path);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: {
      // MyHours uses the literal prefix "apikey", not "Bearer".
      Authorization: `apikey ${requireKey()}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const bodyText = await res.text();
    throw new Error(`MyHours ${path} failed: ${res.status} ${bodyText}`);
  }
  return res.json() as Promise<T>;
}

export interface MyHoursClient {
  id: number | string;
  name: string;
  archived?: boolean;
}

export interface MyHoursProject {
  id: number | string;
  name: string;
  clientId?: number | string | null;
  clientName?: string | null;
  archived?: boolean;
}

// A single time log entry as returned by /logs/getallbetweendates.
// Note: MyHours doesn't expose a client ID on log entries — only the name.
// `duration` is in SECONDS; `billableHours` is in hours.
export interface MyHoursLog {
  id: number;
  date: string; // "YYYY-MM-DDT00:00:00"
  duration: number; // seconds
  billable: boolean;
  billableHours: number; // hours (pre-computed by MyHours)
  billableDuration: number; // seconds
  clientName: string | null;
  projectName: string | null;
  projectId: number;
  taskName: string | null;
  taskId: number;
  userId: number;
  note: string | null;
  rate: number;
  amount: number;
  billableAmount: number;
  status: number;
  invoiceId: number;
}

// ---- Public surface ----

export async function listClients(): Promise<MyHoursClient[]> {
  // TODO: confirm exact endpoint path against the live API.
  return get<MyHoursClient[]>("/Clients");
}

export async function listProjects(): Promise<MyHoursProject[]> {
  return get<MyHoursProject[]>("/Projects");
}

// Fetch all time logs in the given inclusive date range (YYYY-MM-DD strings).
// Aggregation is done by the caller (reconcile.ts) so we keep this raw.
// We probe several known/likely endpoint+param combinations until one returns
// data — MyHours has changed shape over versions and the public docs are
// behind auth so we don't know the canonical form. The first non-empty result
// wins; the rest is logged for diagnostics.
export async function listLogs(from: string, to: string): Promise<MyHoursLog[]> {
  // Confirmed via the MyHours web app:
  //   GET /api/logs/getallbetweendates?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&localDate=ISO8601
  // localDate is informational; the API accepts UTC or a TZ offset.
  return get<MyHoursLog[]>("/logs/getallbetweendates", {
    dateFrom: from,
    dateTo: to,
    localDate: new Date().toISOString(),
  });
}

// Convenience: month range in UTC.
export function monthRange(year: number, month: number): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}
