import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "ASBK — Time vs Billing",
  description: "Reconcile MyHours tracked time against Xero invoiced amounts.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user;

  return (
    <html lang="en">
      <body className="min-h-screen">
        {user && (
          <header className="border-b border-black/10 dark:border-white/10">
            <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
              <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
                <Image
                  src="/logo.png"
                  alt="ASBK"
                  width={32}
                  height={32}
                  priority
                  className="rounded-full"
                />
                <span>ASBK</span>
              </Link>
              <nav className="flex gap-5 text-sm">
                <Link href="/" className="hover:underline">Dashboard</Link>
                <Link href="/reconcile" className="hover:underline">Reconcile</Link>
                <Link href="/mappings" className="hover:underline">Client mappings</Link>
                <Link href="/recurring" className="hover:underline">Recurring billing</Link>
                <Link href="/exclusions" className="hover:underline">Exclusions</Link>
                <Link href="/account-exclusions" className="hover:underline">Account exclusions</Link>
              </nav>
              <div className="flex items-center gap-3 text-sm">
                <span className="opacity-70 hidden sm:inline">{user.email}</span>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/signin" });
                  }}
                >
                  <button
                    type="submit"
                    className="rounded-md border border-current/20 px-2 py-1 text-xs hover:bg-foreground/5"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          </header>
        )}
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
