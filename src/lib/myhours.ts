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
  const bodyText = await res.text();
  console.log(`[myhours] GET ${url.toString()} -> ${res.status}`);
  console.log(`[myhours]   body (first 400 chars): ${bodyText.slice(0, 400)}`);
  if (!res.ok) {
    throw new Error(`MyHours ${path} failed: ${res.status} ${bodyText}`);
  }
  return JSON.parse(bodyText) as T;
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

// A single time log entry. MyHours typically expresses duration in seconds.
export interface MyHoursLog {
  id: number | string;
  date: string; // YYYY-MM-DD
  durationSeconds: number;
  billable?: boolean;
  clientId?: number | string | null;
  clientName?: string | null;
  projectId?: number | string | null;
  projectName?: string | null;
  userId?: number | string | null;
  userName?: string | null;
  note?: string | null;
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
  // Confirmed endpoint via MyHours' own web app:
  //   GET /api/logs/getallbetweendates?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&localDate=ISO8601
  // localDate appears to be informational (web app passes its current wall
  // clock with TZ offset); not strictly required but we send it for parity.
  const localDate = new Date().toISOString();
  const result = await get<unknown>("/logs/getallbetweendates", {
    dateFrom: from,
    dateTo: to,
    localDate,
  });
  if (!Array.isArray(result)) {
    console.log("[myhours] logs response was not an array; got:", typeof result);
    return [];
  }
  // Temporary: log the first item's keys so we can confirm the field shape
  // (clientId vs client.id vs project.client.id, durationSeconds vs duration, etc.)
  if (result.length > 0) {
    const sample = result[0] as Record<string, unknown>;
    console.log("[myhours] sample log keys:", Object.keys(sample).join(", "));
    console.log("[myhours] sample log JSON:", JSON.stringify(sample).slice(0, 600));
  }
  return result as MyHoursLog[];
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
