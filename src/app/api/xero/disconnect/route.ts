import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  await prisma.xeroConnection.deleteMany({});
  return NextResponse.redirect(new URL("/?xero=disconnected", req.url), { status: 303 });
}
