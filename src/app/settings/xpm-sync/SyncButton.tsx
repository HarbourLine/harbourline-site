"use client";

import { useState, useTransition } from "react";
import type { XpmSyncResult } from "@/lib/xpm-sync";
import { runXpmSync, runXpmSyncFromCsv } from "./actions";

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

      <ResultPanel result={result} error={error} />
    </div>
  );
}

export function CsvUploadForm() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<XpmSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        setError(null);
        setResult(null);
        startTransition(async () => {
          try {
            const r = await runXpmSyncFromCsv(formData);
            setResult(r);
          } catch (e2) {
            setError(e2 instanceof Error ? e2.message : String(e2));
          }
        });
      }}
    >
      <FileField name="clients" label="Clients CSV (from XPM export)" />
      <FileField name="contacts" label="Contacts CSV (optional)" />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground text-background px-3 py-1.5 text-sm disabled:opacity-50"
      >
        {pending ? "Importing — Please Wait…" : "Import CSV"}
      </button>

      <ResultPanel result={result} error={error} />
    </form>
  );
}

function FileField({ name, label }: { name: string; label: string }) {
  return (
    <label className="text-sm block">
      <span className="block opacity-70 mb-1">{label}</span>
      <input
        type="file"
        name={name}
        accept=".csv,text/csv"
        className="text-sm"
      />
    </label>
  );
}

function ResultPanel({
  result,
  error,
}: {
  result: XpmSyncResult | null;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
        {error}
      </div>
    );
  }
  if (!result) return null;
  return (
    <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm space-y-1">
      <div>
        <strong>Clients:</strong> {result.fetchedClients} parsed · {result.clientsCreated}{" "}
        created · {result.clientsUpdated} updated
      </div>
      <div>
        <strong>Contacts:</strong> {result.fetchedContacts} parsed ·{" "}
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
  );
}
