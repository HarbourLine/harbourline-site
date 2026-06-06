import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, listConnections, saveConnection } from "@/lib/xero";
import { verifyState } from "@/lib/state";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/?xero_error=${encodeURIComponent(error)}`, req.url));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL("/?xero_error=missing_params", req.url));
  }
  if (!verifyState(state)) {
    return NextResponse.redirect(new URL("/?xero_error=bad_state", req.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const connections = await listConnections(tokens.access_token);
    if (connections.length === 0) {
      return NextResponse.redirect(new URL("/?xero_error=no_tenant", req.url));
    }
    // saveConnection picks the ORGANISATION tenant as primary and stores
    // any PRACTICEMANAGER tenant alongside it for XPM sync.
    await saveConnection(tokens, connections);
    return NextResponse.redirect(new URL("/?xero=connected", req.url));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.redirect(new URL(`/?xero_error=${encodeURIComponent(msg)}`, req.url));
  }
}
