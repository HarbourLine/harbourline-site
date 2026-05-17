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
    throw new Error(`MyHours ${path} failed: ${res.status} ${await res.text()}`);
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
export async function listLogs(from: string, to: string): Promise<MyHoursLog[]> {
  // TODO: confirm endpoint + param names. Common shapes are /Logs?from=&to=
  // or /TimeLogs?dateFrom=&dateTo=. We'll harden this once we have a live key.
  return get<MyHoursLog[]>("/Logs", { from, to });
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
