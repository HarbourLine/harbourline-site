import { NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/xero";
import { signState } from "@/lib/state";

export async function GET() {
  const state = signState({ ts: String(Date.now()) });
  const url = buildAuthUrl(state);
  // Temporary diagnostic: log the redirect target so we can verify the scope
  // string Xero receives. Safe to leave — only the server terminal sees it.
  console.log("[xero/connect] redirecting to:", url);
  return NextResponse.redirect(url);
}
