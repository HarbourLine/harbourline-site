import type { Client } from "@prisma/client";

interface StaffOption {
  id: string;
  name: string;
}

interface Props {
  action: (formData: FormData) => void;
  client?: Client | null;
  staff: StaffOption[];
  submitLabel: string;
}

const STATUS_OPTIONS = [
  { value: "LEAD", label: "Lead" },
  { value: "ONBOARDING", label: "Onboarding" },
  { value: "ACTIVE", label: "Active" },
  { value: "DORMANT", label: "Dormant" },
  { value: "OFFBOARDED", label: "Offboarded" },
];

const AML_OPTIONS = [
  { value: "NOT_REQUIRED", label: "Not required" },
  { value: "PENDING", label: "Pending" },
  { value: "PASSED", label: "Passed" },
  { value: "EXPIRED", label: "Expired" },
  { value: "REJECTED", label: "Rejected" },
];

function toDateInput(d: Date | null | undefined): string {
  if (!d) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ClientForm({ action, client, staff, submitLabel }: Props) {
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {client && <input type="hidden" name="id" value={client.id} />}

      <Field
        name="name"
        label="Name"
        required
        defaultValue={client?.name ?? ""}
      />

      <Select
        name="status"
        label="Status"
        defaultValue={client?.status ?? "ACTIVE"}
        options={STATUS_OPTIONS}
      />

      <Field
        name="companyNumber"
        label="Company Number"
        defaultValue={client?.companyNumber ?? ""}
      />
      <Field
        name="vatNumber"
        label="VAT Number"
        defaultValue={client?.vatNumber ?? ""}
      />

      <label className="text-sm sm:col-span-2">
        <span className="block opacity-70 mb-1">Trading Address</span>
        <textarea
          name="tradingAddress"
          rows={2}
          defaultValue={client?.tradingAddress ?? ""}
          className="w-full rounded border border-current/20 bg-transparent px-2 py-1.5"
        />
      </label>

      <Field
        name="financialYearEnd"
        label="Financial Year End"
        type="date"
        defaultValue={toDateInput(client?.financialYearEnd)}
      />
      <Field
        name="defaultHourlyRate"
        label="Default Hourly Rate £"
        type="number"
        step="0.01"
        defaultValue={client?.defaultHourlyRate?.toString() ?? ""}
      />

      <Select
        name="accountManagerId"
        label="Account Manager"
        defaultValue={client?.accountManagerId ?? ""}
        options={[
          { value: "", label: "— None —" },
          ...staff.map((s) => ({ value: s.id, label: s.name })),
        ]}
      />

      <Select
        name="amlStatus"
        label="AML Status"
        defaultValue={client?.amlStatus ?? "NOT_REQUIRED"}
        options={AML_OPTIONS}
      />

      <Field
        name="amlExpiresAt"
        label="AML Expires"
        type="date"
        defaultValue={toDateInput(client?.amlExpiresAt)}
      />

      <label className="text-sm sm:col-span-2">
        <span className="block opacity-70 mb-1">Notes</span>
        <textarea
          name="notes"
          rows={4}
          defaultValue={client?.notes ?? ""}
          className="w-full rounded border border-current/20 bg-transparent px-2 py-1.5"
        />
      </label>

      <div className="sm:col-span-2">
        <button
          type="submit"
          className="rounded-md bg-foreground text-background px-3 py-1.5 text-sm"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  step,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  step?: string;
  defaultValue?: string;
}) {
  return (
    <label className="text-sm">
      <span className="block opacity-70 mb-1">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        defaultValue={defaultValue}
        className="w-full rounded border border-current/20 bg-transparent px-2 py-1.5"
      />
    </label>
  );
}

function Select({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue: string;
}) {
  return (
    <label className="text-sm">
      <span className="block opacity-70 mb-1">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded border border-current/20 bg-transparent px-2 py-1.5"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
