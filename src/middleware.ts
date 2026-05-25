export { auth as middleware } from "@/auth";

export const config = {
  // Protect every page except: NextAuth's own endpoints, the sign-in page,
  // Next's internal static assets, and our public logo.
  matcher: ["/((?!api/auth|signin|_next/static|_next/image|favicon.ico|logo.png).*)"],
};
