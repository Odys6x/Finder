"use client";
import Link from "next/link";
import { useState } from "react";
import { useShortlist } from "@/lib/client/store";
import { Logo } from "./Logo";
import { Sheet } from "./Sheet";

/** One slim header for the whole app: logo, shortlist count, menu. Replaces the old tab bar. */
export function AppHeader({ onShortlist }: { onShortlist?: () => void }) {
  const [list] = useShortlist();
  const [menu, setMenu] = useState(false);
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line/70 bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-[17px] font-extrabold tracking-tight text-ink" aria-label="SchoolPath home">
          <Logo className="h-8 w-8" />
          SchoolPath
        </Link>
        <div className="flex items-center gap-1">
          {onShortlist ? (
            <button className="chip" onClick={onShortlist} aria-label={`Shortlist, ${list.length} saved`}>
              ★ <span className="tabular-nums">{list.length}</span>
            </button>
          ) : (
            <Link className="chip" href="/shortlist" aria-label={`Shortlist, ${list.length} saved`}>
              ★ <span className="tabular-nums">{list.length}</span>
            </Link>
          )}
          <button className="grid h-10 w-10 place-items-center rounded-full hover:bg-card" onClick={() => setMenu(true)} aria-label="Menu">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </div>
      <Sheet open={menu} onClose={() => setMenu(false)} title="Menu">
        <nav className="grid gap-1 text-base">
          {[
            ["/", "💬", "Chat"],
            ["/match", "📋", "All my matches"],
            ["/schools", "🏫", "Browse all schools"],
            ["/shortlist", "★", "Shortlist, compare & share"],
            ["/profile", "✏️", "My answers"],
            ["/pricing", "🎟️", "Season Pass"],
            ["/about-data", "ℹ️", "How it works & data"],
            ["/privacy", "🔒", "Privacy"],
          ].map(([href, icon, label]) => (
            <Link key={href} href={href} onClick={() => setMenu(false)} className="flex items-center gap-3 rounded-2xl px-3 py-3 font-medium hover:bg-paper">
              <span aria-hidden className="w-6 text-center">
                {icon}
              </span>
              {label}
            </Link>
          ))}
        </nav>
      </Sheet>
    </header>
  );
}
