import { NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/xero";
import { signState } from "@/lib/state";

export async function GET() {
  const state = signState({ ts: String(Date.now()) });
  return NextResponse.redirect(buildAuthUrl(state));
}
