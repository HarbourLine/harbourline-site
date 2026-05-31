import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./db";
import type { StaffDashboardData } from "./staff";

const SUMMARY_MODEL = "claude-opus-4-8";
const SUMMARY_MAX_TOKENS = 1500;
const SUMMARY_TYPE = "team";

export interface TeamSummaryResult {
  content: string;
  cached: boolean;
}

export async function getOrCreateTeamSummary(
  data: StaffDashboardData,
): Promise<TeamSummaryResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const hash = hashInput(data);
  const existing = await prisma.aISummary.findUnique({
    where: {
      type_year_month: {
        type: SUMMARY_TYPE,
        year: data.anchor.year,
        month: data.anchor.month,
      },
    },
  });
  if (existing && existing.inputHash === hash) {
    return { content: existing.content, cached: true };
  }

  const content = await generateSummary(data);
  await prisma.aISummary.upsert({
    where: {
      type_year_month: {
        type: SUMMARY_TYPE,
        year: data.anchor.year,
        month: data.anchor.month,
      },
    },
    create: {
      type: SUMMARY_TYPE,
      year: data.anchor.year,
      month: data.anchor.month,
      inputHash: hash,
      content,
    },
    update: { inputHash: hash, content },
  });
  return { content, cached: false };
}

function hashInput(data: StaffDashboardData): string {
  const payload = {
    anchor: { year: data.anchor.year, month: data.anchor.month },
    firm: data.firmTotals,
    rows: data.rows.map((r) => ({
      userId: r.userId,
      userName: r.userName,
      anchor: r.anchor,
      comparison: r.comparison,
      deltas: r.deltas,
    })),
    trend: data.trend.map((m) => ({
      year: m.year,
      month: m.month,
      hours: m.staff.reduce((s, e) => s + e.hours, 0),
      billable: m.staff.reduce((s, e) => s + e.billableHours, 0),
      overRun: m.staff.reduce((s, e) => s + (e.overRunHours ?? 0), 0),
      earned: m.staff.reduce((s, e) => s + e.earnedAmount, 0),
    })),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function generateSummary(data: StaffDashboardData): Promise<string> {
  const client = new Anthropic();

  const prompt = buildPrompt(data);

  const message = await client.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: SUMMARY_MAX_TOKENS,
    thinking: { type: "adaptive" },
    system:
      "You are a senior bookkeeping practice manager at ASBK (Andrew Smith Bookkeeping Services). " +
      "You're writing a short monthly briefing for the owner about the team's productivity and " +
      "where time is being lost on over-budget work. " +
      "Tone: direct, practical, no fluff. Use British spellings and £ currency. " +
      "Output exactly 2-3 short paragraphs (no headings, no bullet lists). " +
      "Lead with what changed in the most recent month for the team as a whole, then call out " +
      "individual people who deserve attention (positive or negative — highest earners, biggest " +
      "shifts, worst over-runs). Name people directly. Be specific about numbers but don't " +
      "rattle off every figure. Don't moralise about over-run hours — they often reflect fixed-fee " +
      "clients that need re-quoting, not staff working slowly.",
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  return textBlock && "text" in textBlock ? textBlock.text.trim() : "";
}

function buildPrompt(data: StaffDashboardData): string {
  const { anchor, firmTotals, rows, trend } = data;
  const fmtMoney = (n: number) => `£${n.toLocaleString("en", { maximumFractionDigits: 0 })}`;
  const fmtRate = (n: number | null) => (n == null ? "—" : `£${n.toFixed(2)}/hr`);
  const fmtPct = (n: number | null) =>
    n == null ? "n/a" : `${n > 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;
  const fmtPctVal = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(0)}%`);

  const trendLines = trend
    .map((m) => {
      const total = m.staff.reduce((s, e) => s + e.earnedAmount, 0);
      const overRun = m.staff.reduce((s, e) => s + (e.overRunHours ?? 0), 0);
      const hours = m.staff.reduce((s, e) => s + e.hours, 0);
      const billable = m.staff.reduce((s, e) => s + e.billableHours, 0);
      const pct = hours > 0 ? billable / hours : 0;
      return (
        `  ${m.label}: ${fmtMoney(total)} earned across ${hours.toFixed(0)}h ` +
        `(${(billable).toFixed(0)}h billable, ${fmtPctVal(pct)}), over-run ${overRun.toFixed(1)}h`
      );
    })
    .join("\n");

  const peopleLines = rows
    .slice(0, 15) // keep the prompt compact
    .map((r) => {
      const a = r.anchor;
      if (!a) {
        return `  ${r.userName}: no activity in ${anchor.label}`;
      }
      return (
        `  ${r.userName}: ${a.hours.toFixed(1)}h tracked, ${a.billableHours.toFixed(1)}h billable ` +
        `(${fmtPctVal(a.billablePercent)}), over-run ${a.overRunHours.toFixed(1)}h, ` +
        `earned ${fmtMoney(a.earnedAmount)} at ${fmtRate(a.effectiveRate)}. ` +
        `Δ vs prior 3 mo: hours ${fmtPct(r.deltas.hours)}, billable ${fmtPct(r.deltas.billableHours)}, ` +
        `earned ${fmtPct(r.deltas.earnedAmount)}, over-run ${fmtPct(r.deltas.overRunHours)}`
      );
    })
    .join("\n");

  return [
    `Anchor month: ${anchor.label}`,
    "",
    "Firm totals (anchor month):",
    `  Hours: ${firmTotals.hours.toFixed(1)} | Billable: ${firmTotals.billableHours.toFixed(1)} (${fmtPctVal(firmTotals.billablePercent)}) | Earned: ${fmtMoney(firmTotals.earnedAmount)} | Effective: ${fmtRate(firmTotals.effectiveRate)}`,
    "",
    "6-month trend (totals):",
    trendLines,
    "",
    "Per person (anchor month):",
    peopleLines,
    "",
    "Notes:",
    "- 'Earned' is each person's proportional share of client invoices for the month.",
    "- 'Over-run' is hours worked beyond what the client's invoice covers at £40/hr — i.e. effectively unbilled time on fixed-fee work.",
    "- Excluded team members (owner, support, departed staff) are not in this data.",
    "",
    "Write the briefing.",
  ].join("\n");
}
