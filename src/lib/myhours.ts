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
  id: number;
  name: string;
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

// /clients/getall returns 400 ("getall is not valid") on MyHours v2 — that
// route segment is parsed as a numeric id. The web app uses
// /clients/getallforfilters for the picker list. Try that first, then a
// couple of likely fallbacks before giving up.
export async function listClients(): Promise<MyHoursClient[]> {
  const candidates = ["/clients/getallforfilters", "/clients/getAll", "/clients"];
  let raw: unknown = null;
  let lastError: unknown = null;
  for (const path of candidates) {
    try {
      raw = await get<unknown>(path);
      console.log(`[myhours] listClients using ${path}`);
      break;
    } catch (e) {
      lastError = e;
      console.log(
        `[myhours] listClients ${path} failed: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`,
      );
    }
  }
  if (raw == null) throw lastError ?? new Error("All clients endpoints failed");

  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((c) => {
      const obj = c as Record<string, unknown>;
      const id = Number(obj.id ?? obj.Id ?? 0);
      const name = String(obj.name ?? obj.Name ?? "").trim();
      const archived = Boolean(obj.archived ?? obj.Archived ?? false);
      return { id, name, archived };
    })
    .filter((c) => c.name && !c.archived);
}

export async function listLogs(from: string, to: string): Promise<MyHoursLog[]> {
  // Confirmed via the MyHours web app:
  //   GET /api/logs/getallbetweendates?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&localDate=ISO8601
  // localDate is informational; the API accepts UTC or a TZ offset.
  const result = await get<MyHoursLog[]>("/logs/getallbetweendates", {
    dateFrom: from,
    dateTo: to,
    localDate: new Date().toISOString(),
  });
  // Diagnostic: tell us if we're getting team-wide data or just one user's.
  const userIds = new Set(result.map((l) => l.userId).filter((id) => id != null));
  console.log(
    `[myhours] listLogs ${from}..${to}: ${result.length} entries from ${userIds.size} user(s) — userIds=${[...userIds].join(",")}`,
  );
  return result;
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
