import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ASBK — Time vs Billing",
  description: "Reconcile MyHours tracked time against Xero invoiced amounts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-black/10 dark:border-white/10">
          <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
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
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
