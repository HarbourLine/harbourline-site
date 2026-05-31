"use client";

import { useState, useTransition } from "react";
import type { XpmSyncResult } from "@/lib/xpm-sync";
import { runXpmSync } from "./actions";

export function SyncButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<XpmSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          setResult(null);
          startTransition(async () => {
            try {
              const r = await runXpmSync();
              setResult(r);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          });
        }}
        className="rounded-md bg-foreground text-background px-3 py-1.5 text-sm disabled:opacity-50"
      >
        {pending ? "Syncing — Please Wait…" : "Sync From XPM Now"}
      </button>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm space-y-1">
          <div>
            <strong>Clients:</strong> {result.fetchedClients} fetched · {result.clientsCreated}{" "}
            created · {result.clientsUpdated} updated
          </div>
          <div>
            <strong>Contacts:</strong> {result.fetchedContacts} fetched ·{" "}
            {result.contactsCreated} created · {result.contactsUpdated} updated ·{" "}
            {result.contactsOrphaned} orphaned (no matching client)
          </div>
          {result.errors.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer">
                {result.errors.length} error{result.errors.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-1 space-y-0.5 opacity-80">
                {result.errors.slice(0, 20).map((e, i) => (
                  <li key={i} className="font-mono">{e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
