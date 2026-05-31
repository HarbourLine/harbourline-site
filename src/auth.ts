import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { prisma } from "./lib/db";

const ALLOWED_DOMAIN = process.env.ALLOWED_GOOGLE_DOMAIN ?? "";

// Full NextAuth config with DB-using callbacks. Used by route handlers and
// server components/actions. Middleware uses the edge-safe authConfig
// directly (no Prisma allowed at edge).
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ profile }) {
      // Domain check is duplicated here so it can run even before the
      // authorized() callback (which only sees an already-built session).
      if (!ALLOWED_DOMAIN) return true;
      const email = profile?.email;
      const verified =
        typeof (profile as { email_verified?: boolean })?.email_verified === "boolean"
          ? (profile as { email_verified?: boolean }).email_verified
          : true;
      return Boolean(
        verified &&
          email &&
          email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN.toLowerCase()}`),
      );
    },
    async jwt({ token, user }) {
      // Bootstrap or refresh the Staff record. On the first sign-in `user` is
      // present; on every subsequent JWT validation `user` is undefined but
      // the token persists.
      //
      // We always trip into the lookup path if `staffId` is missing — that
      // handles fresh sign-ins, old sessions that pre-date the Staff table,
      // and the very first user (auto-promoted to OWNER).
      if (!token.staffId && (token.email || user?.email)) {
        const email = String(token.email ?? user?.email).toLowerCase();
        const name = String(token.name ?? user?.name ?? email);
        let staff = await prisma.staff.findUnique({ where: { email } });
        if (!staff) {
          const count = await prisma.staff.count();
          staff = await prisma.staff.create({
            data: { email, name, role: count === 0 ? "OWNER" : "JUNIOR" },
          });
        }
        token.staffId = staff.id;
        token.role = staff.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // Surface staffId + role on the session so server components don't
        // each have to re-fetch from the DB.
        (session.user as { staffId?: string }).staffId = token.staffId as string | undefined;
        (session.user as { role?: string }).role = token.role as string | undefined;
      }
      return session;
    },
  },
});
