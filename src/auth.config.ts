import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

const ALLOWED_DOMAIN = process.env.ALLOWED_GOOGLE_DOMAIN ?? "";

// Edge-safe NextAuth config. Used by middleware (Edge runtime, no Prisma).
// auth.ts re-imports this and layers on DB-using callbacks for the full
// Node-runtime side (server actions, route handlers, server components).
export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: { params: ALLOWED_DOMAIN ? { hd: ALLOWED_DOMAIN } : {} },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async authorized({ auth: session }) {
      return !!session?.user;
    },
  },
  pages: { signIn: "/signin" },
};
