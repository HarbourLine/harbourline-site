import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Middleware runs in the Edge runtime, which can't bundle Prisma. So we
// build a separate NextAuth instance from the minimal edge-safe config —
// it can validate the JWT cookie and run the simple `authorized` callback,
// but doesn't touch the DB. The Node-side auth.ts handles enrichment.
const { auth } = NextAuth(authConfig);

export { auth as middleware };

export const config = {
  matcher: ["/((?!api/auth|signin|_next/static|_next/image|favicon.ico|logo.png).*)"],
};
