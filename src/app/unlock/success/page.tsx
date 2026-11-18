import type { Metadata } from "next";
import Link from "next/link";
import { getPass } from "@/lib/session";

export const metadata: Metadata = { title: "Pass unlocked" };

export default async function UnlockSuccess(props: PageProps<"/unlock/success">) {
  const sp = await props.searchParams;
  const pass = await getPass();
  const code = pass?.code ?? (typeof sp.code === "string" ? sp.code : null);
  return (
    <div className="card mx-auto max-w-lg space-y-3 text-center">
      <p className="text-4xl" aria-hidden>
        🎉
      </p>
      <h1 className="text-xl font-bold">{pass ? "Your pass is active" : "Payment received"}</h1>
      {code && (
        <>
          <p className="text-sm text-muted">Save this code to unlock SchoolPath on another phone or browser:</p>
          <p className="rounded-xl bg-paper py-3 font-mono text-2xl font-bold tracking-widest">{code}</p>
        </>
      )}
      {sp.dev && <p className="text-xs text-border">Dev mode test pass — no payment was taken.</p>}
      <div className="flex flex-wrap justify-center gap-2 pt-2">
        <Link href="/match" className="btn-primary">
          See full matches
        </Link>
        <Link href="/shortlist" className="btn-ghost">
          Compare my shortlist
        </Link>
      </div>
    </div>
  );
}
