"use client";

import { useState, useTransition } from "react";
import type { XpmSyncResult } from "@/lib/xpm-sync";
import { runXpmSync, runXpmSyncFromCsv, type XpmCsvSyncResult } from "./actions";

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
  const [result, setResult] = useState<XpmCsvSyncResult | null>(null);
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
      {result && (result.clientsDiagnostic || result.contactsDiagnostic) && (
        <div className="rounded-md border border-current/20 px-3 py-2 text-xs space-y-2">
          <div className="font-medium opacity-80">Diagnostic</div>
          {result.clientsDiagnostic && (
            <div>
              <div className="opacity-70 mb-1">
                Clients CSV — {result.clientsDiagnostic.rowCount} rows · detected{" "}
                {result.clientsDiagnostic.headers.length} columns
              </div>
              <ul className="opacity-80 space-y-0.5">
                <li>With email: {result.clientsDiagnostic.withEmail}</li>
                <li>With phone: {result.clientsDiagnostic.withPhone}</li>
                <li>With website: {result.clientsDiagnostic.withWebsite}</li>
                <li>With address: {result.clientsDiagnostic.withAddress}</li>
                <li>With VAT number: {result.clientsDiagnostic.withVatNumber}</li>
                <li>With company number: {result.clientsDiagnostic.withCompanyNumber}</li>
              </ul>
              <details className="mt-1">
                <summary className="cursor-pointer opacity-70">Detected headers</summary>
                <div className="font-mono mt-1 opacity-70 break-all">
                  {result.clientsDiagnostic.headers.join(" | ")}
                </div>
              </details>
            </div>
          )}
          {result.contactsDiagnostic && (
            <div>
              <div className="opacity-70 mb-1">
                Contacts CSV — {result.contactsDiagnostic.rowCount} rows · detected{" "}
                {result.contactsDiagnostic.headers.length} columns
              </div>
              <ul className="opacity-80 space-y-0.5">
                <li>With contact ID: {result.contactsDiagnostic.withId}</li>
                <li>With client ID: {result.contactsDiagnostic.withClientId}</li>
                <li>With name: {result.contactsDiagnostic.withName}</li>
              </ul>
              <details className="mt-1">
                <summary className="cursor-pointer opacity-70">Detected headers</summary>
                <div className="font-mono mt-1 opacity-70 break-all">
                  {result.contactsDiagnostic.headers.join(" | ")}
                </div>
              </details>
            </div>
          )}
        </div>
      )}
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
