import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./db";
import type { DashboardData } from "./dashboard";

// Cached summary is reused as long as the underlying data hash matches —
// so a snapshot refresh that doesn't change the numbers (most cases) is a
// free no-op, while a refresh that does change them regenerates the summary.

const SUMMARY_MODEL = "claude-opus-4-8";
const SUMMARY_MAX_TOKENS = 1500;

export interface AISummaryResult {
  content: string;
  cached: boolean;
}

export async function getOrCreateAISummary(data: DashboardData): Promise<AISummaryResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const hash = hashInput(data);
  const existing = await prisma.aISummary.findUnique({
    where: {
      type_year_month: { type: "dashboard", year: data.anchor.year, month: data.anchor.month },
    },
  });
  if (existing && existing.inputHash === hash) {
    return { content: existing.content, cached: true };
  }

  const content = await generateSummary(data);
  await prisma.aISummary.upsert({
    where: {
      type_year_month: { type: "dashboard", year: data.anchor.year, month: data.anchor.month },
    },
    create: {
      type: "dashboard",
      year: data.anchor.year,
      month: data.anchor.month,
      inputHash: hash,
      content,
    },
    update: { inputHash: hash, content },
  });
  return { content, cached: false };
}

function hashInput(data: DashboardData): string {
  const payload = {
    anchor: { year: data.anchor.year, month: data.anchor.month },
    trend: data.trend.map((m) => ({
      year: m.year,
      month: m.month,
      hours: m.result.totals.hours,
      billableHours: m.result.totals.billableHours,
      totalBilled: m.result.totals.totalBilled,
      effectiveRate: m.result.totals.effectiveRate,
    })),
    watchlist: data.watchlist.map((w) => ({
      clientName: w.clientName,
      monthsBelow: w.monthsBelow,
      avgRate: w.avgRate,
      totalBillableHours: w.totalBillableHours,
    })),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function generateSummary(data: DashboardData): Promise<string> {
  const client = new Anthropic();

  const prompt = buildPrompt(data);

  const message = await client.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: SUMMARY_MAX_TOKENS,
    thinking: { type: "adaptive" },
    system:
      "You are a senior bookkeeping practice manager at ASBK (Andrew Smith Bookkeeping Services). " +
      "You're writing a short monthly briefing for the owner about the firm's billing performance. " +
      "Tone: direct, practical, no fluff. Use British spellings and £ currency. " +
      "Output exactly 2-3 short paragraphs (no headings, no bullet lists). " +
      "Lead with what changed in the most recent month, then what's worth attention next.",
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  return textBlock && "text" in textBlock ? textBlock.text.trim() : "";
}

function buildPrompt(data: DashboardData): string {
  const { anchor, trend, deltas, watchlist } = data;
  const fmtMoney = (n: number) => `£${n.toLocaleString("en", { maximumFractionDigits: 0 })}`;
  const fmtRate = (n: number | null) => (n == null ? "—" : `£${n.toFixed(2)}/hr`);
  const fmtPct = (n: number | null) =>
    n == null ? "n/a" : `${n > 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;

  const trendLines = trend
    .map(
      (m) =>
        `  ${m.label}: ${m.result.totals.hours.toFixed(1)}h tracked, ` +
        `${m.result.totals.billableHours.toFixed(1)}h billable, ` +
        `${fmtMoney(m.result.totals.totalBilled)} billed, ` +
        `effective ${fmtRate(m.result.totals.effectiveRate)}`,
    )
    .join("\n");

  const watchlistLines =
    watchlist.length === 0
      ? "  None — no clients have been under £35/hr in 2+ of the last 3 months."
      : watchlist
          .slice(0, 8) // keep the prompt concise
          .map(
            (w) =>
              `  ${w.clientName}: avg ${fmtRate(w.avgRate)} across ${w.totalBillableHours.toFixed(1)}h billable, ` +
              `under £35 in ${w.monthsBelow} of last 3 months`,
          )
          .join("\n");

  return [
    `Anchor month (most recently completed): ${anchor.label}`,
    "",
    "6-month trend (totals):",
    trendLines,
    "",
    `Deltas — ${anchor.label} vs preceding 3-month average:`,
    `  Hours tracked: ${fmtPct(deltas.hours)}`,
    `  Billable hours: ${fmtPct(deltas.billableHours)}`,
    `  Billed £: ${fmtPct(deltas.totalBilled)}`,
    `  Effective £/hr: ${fmtPct(deltas.effectiveRate)}`,
    "",
    "Watchlist (clients consistently below £35/hr):",
    watchlistLines,
    "",
    "Write the briefing.",
  ].join("\n");
}
