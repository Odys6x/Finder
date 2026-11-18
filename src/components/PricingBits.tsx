"use client";
import { useState } from "react";
import { refreshMe, startCheckout, useMe } from "@/lib/client/me";

export function BuyButton({ tier, label, ghost }: { tier: "season" | "family"; label: string; ghost?: boolean }) {
  const me = useMe();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (me?.pass) return <p className="rounded-xl bg-safe-soft p-2 text-center text-sm font-medium text-safe">You have a {me.pass.tier} pass ✓</p>;
  return (
    <div>
      <button
        className={ghost ? "btn-ghost w-full" : "btn-primary w-full"}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr("");
          try {
            await startCheckout(tier);
          } catch (e) {
            setErr((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy ? "Opening checkout…" : label}
      </button>
      {err && <p className="mt-1 text-xs text-reach">{err}</p>}
    </div>
  );
}

export function RestorePass() {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <form
      className="card space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await fetch("/api/pass/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const b = await r.json();
        setMsg(r.ok ? "Pass restored on this device ✓" : b.error);
        if (r.ok) refreshMe();
      }}
    >
      <label className="label" htmlFor="code">
        Already paid? Restore your pass on this device
      </label>
      <div className="flex gap-2">
        <input id="code" className="input max-w-56 uppercase" placeholder="SP-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value)} />
        <button className="btn-ghost" type="submit">
          Restore
        </button>
      </div>
      {msg && <p className="text-sm text-muted">{msg}</p>}
    </form>
  );
}
