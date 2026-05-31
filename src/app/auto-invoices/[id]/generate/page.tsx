import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { buildInvoicePreview, type InvoicePreview } from "@/lib/auto-invoice";
import { createDraftInvoiceFromForm } from "../../actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function defaultAnchor(): { year: number; month: number } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  if (m === 1) return { year: y - 1, month: 12 };
  return { year: y, month: m - 1 };
}

export default async function GeneratePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; month?: string; error?: string; created?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const automation = await prisma.invoiceAutomation.findUnique({ where: { id } });
  if (!automation) notFound();

  const def = defaultAnchor();
  const year = sp.year ? Number(sp.year) : def.year;
  const month = sp.month ? Number(sp.month) : def.month;

  let preview: InvoicePreview | null = null;
  let previewError: string | null = null;
  try {
    preview = await buildInvoicePreview(automation, year, month);
  } catch (e) {
    previewError = e instanceof Error ? e.message : String(e);
  }

  const fmtMoney = (n: number) =>
    n.toLocaleString("en", { style: "currency", currency: "GBP", maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs opacity-60 mb-1">
          <Link className="hover:underline" href="/settings">Settings</Link> /{" "}
          <Link className="hover:underline" href="/auto-invoices">Auto-Invoices</Link> /{" "}
          <span>{automation.name}</span>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{automation.name}</h1>
        <p className="text-sm opacity-70 mt-1">
          Bills <strong>{automation.xeroContactName}</strong>, sourcing time logs from MyHours
          client <strong>{automation.myHoursClient}</strong>
          {automation.taskFilter && (
            <> (task: <strong>{automation.taskFilter}</strong>)</>
          )}
          . Markup +{automation.markupPercent}%, rounded to the nearest pound, VAT {automation.vatRate}%.
        </p>
      </header>

      {sp.created && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm">
          Draft invoice <strong>{sp.created}</strong> created in Xero. Review and send when ready.
        </div>
      )}
      {sp.error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
          {sp.error}
        </div>
      )}

      <MonthForm year={year} month={month} />

      {previewError && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
          Couldn&apos;t build the preview: {previewError}
        </div>
      )}

      {preview && (
        <PreviewView preview={preview} fmtMoney={fmtMoney} automationId={automation.id} />
      )}
    </div>
  );
}

function MonthForm({ year, month }: { year: number; month: number }) {
  const years: number[] = [];
  const thisYear = new Date().getUTCFullYear();
  for (let y = thisYear; y >= thisYear - 4; y--) years.push(y);
  return (
    <form className="flex items-end gap-2">
      <label className="text-sm">
        <span className="block opacity-70 mb-1">Billing month</span>
        <select
          name="month"
          defaultValue={month}
          className="rounded border border-current/20 bg-transparent px-2 py-1"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {new Date(Date.UTC(2000, m - 1, 1)).toLocaleString("en", { month: "long" })}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="block opacity-70 mb-1">Year</span>
        <select
          name="year"
          defaultValue={year}
          className="rounded border border-current/20 bg-transparent px-2 py-1"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </label>
      <button className="rounded-md bg-foreground text-background px-3 py-1.5 text-sm" type="submit">
        Preview
      </button>
    </form>
  );
}

function PreviewView({
  preview,
  fmtMoney,
  automationId,
}: {
  preview: InvoicePreview;
  fmtMoney: (n: number) => string;
  automationId: string;
}) {
  return (
    <>
      <section className="rounded-lg border border-black/10 dark:border-white/10 p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <KV label="Invoice Date" value={preview.invoiceDate} />
          <KV label="Due Date" value={preview.dueDate} />
          <KV label="Reference" value={preview.reference || "—"} />
          <KV label="Lines" value={String(preview.lines.length)} />
        </div>
      </section>

      <section>
        <h2 className="font-medium mb-3">Line Items</h2>
        {preview.lines.length === 0 ? (
          <p className="text-sm opacity-70">
            No matching time logs for this month. Either nothing was tracked, or the task filter
            excludes all entries.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-foreground/5 text-left">
                <tr>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Hours</th>
                  <th className="px-3 py-2 text-right">MyHours £</th>
                  <th className="px-3 py-2 text-right">+ Markup</th>
                  <th className="px-3 py-2 text-right">Invoice £</th>
                </tr>
              </thead>
              <tbody>
                {preview.lines.map((l, i) => (
                  <tr key={i} className="border-t border-black/5 dark:border-white/5">
                    <td className="px-3 py-2">
                      <div>{l.description}</div>
                      <div className="text-xs opacity-50">from project: {l.projectName}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.hours.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(l.rawAmount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums opacity-70">
                      {fmtMoney(l.markedUpAmount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {fmtMoney(l.invoiceAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-foreground/5">
                <tr>
                  <td className="px-3 py-2 text-right" colSpan={4}>Subtotal (ex VAT)</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {fmtMoney(preview.totalEx)}
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 text-right opacity-70" colSpan={4}>
                    VAT @ {preview.automation.vatRate}%
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums opacity-70">
                    {fmtMoney(preview.totalVat)}
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 text-right font-medium" colSpan={4}>Total</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {fmtMoney(preview.totalInc)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {preview.lines.length > 0 && (
        <section className="rounded-lg border border-black/10 dark:border-white/10 p-4">
          <h2 className="font-medium mb-2">Create Draft In Xero</h2>
          <p className="text-sm opacity-70 mb-3">
            Creates the invoice as a <strong>Draft</strong>. You can still review, edit, and
            authorise it in Xero before sending — nothing goes to the client from here.
          </p>
          <form action={createDraftInvoiceFromForm}>
            <input type="hidden" name="id" value={automationId} />
            <input type="hidden" name="year" value={preview.year} />
            <input type="hidden" name="month" value={preview.month} />
            <button
              type="submit"
              className="rounded-md bg-foreground text-background px-3 py-1.5 text-sm"
            >
              Create draft invoice
            </button>
          </form>
        </section>
      )}
    </>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs opacity-60">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}
