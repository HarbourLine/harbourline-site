import Image from "next/image";
import { signIn } from "@/auth";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const sp = await searchParams;
  const callbackUrl = sp.callbackUrl ?? "/";

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border border-black/10 dark:border-white/10 p-8 text-center space-y-6">
        <div className="flex flex-col items-center gap-3">
          <Image src="/logo.png" alt="ASBK" width={56} height={56} className="rounded-full" priority />
          <h1 className="text-xl font-semibold tracking-tight">ASBK Time vs Billing</h1>
          <p className="text-sm opacity-70">Sign in with your ASBK Google account to continue.</p>
        </div>

        {sp.error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-left">
            {sp.error === "AccessDenied"
              ? "That Google account isn't part of asbookkeepingservices.com. Sign in with your ASBK account."
              : `Sign-in error: ${sp.error}`}
          </div>
        )}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: callbackUrl });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    </div>
  );
}
