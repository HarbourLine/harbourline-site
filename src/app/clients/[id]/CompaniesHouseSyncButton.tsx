"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncCompaniesHouseForClient, type CompaniesHouseSyncResult } from "../actions";

export function CompaniesHouseSyncButton({ clientId }: { clientId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<CompaniesHouseSyncResult | null>(null);
  const router = useRouter();

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            const r = await syncCompaniesHouseForClient(clientId);
            setResult(r);
            if (r.ok) router.refresh();
          });
        }}
        className="rounded-md border border-current/20 px-3 py-1.5 text-xs hover:bg-foreground/5 disabled:opacity-50"
      >
        {pending ? "Syncing…" : "Sync From Companies House"}
      </button>
      {result && !result.ok && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs">
          {result.error}
        </div>
      )}
    </div>
  );
}
