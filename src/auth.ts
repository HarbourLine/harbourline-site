import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const ALLOWED_DOMAIN = process.env.ALLOWED_GOOGLE_DOMAIN ?? "";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // hd ("hosted domain") asks Google to only show accounts on this
      // Workspace domain in the chooser. signIn() below double-checks the
      // returned email — hd is a UX hint, not a security boundary.
      authorization: { params: ALLOWED_DOMAIN ? { hd: ALLOWED_DOMAIN } : {} },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ profile }) {
      if (!ALLOWED_DOMAIN) return true;
      const email = profile?.email;
      const verified =
        typeof (profile as { email_verified?: boolean })?.email_verified === "boolean"
          ? (profile as { email_verified?: boolean }).email_verified
          : true;
      return Boolean(verified && email && email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN.toLowerCase()}`));
    },
    async authorized({ auth: session }) {
      return !!session?.user;
    },
  },
  pages: { signIn: "/signin" },
});
