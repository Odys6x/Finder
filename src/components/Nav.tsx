"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/match", label: "Matches", icon: "M4 6h16M4 12h10M4 18h6" },
  { href: "/schools", label: "Schools", icon: "M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6" },
  { href: "/chat", label: "Ask AI", icon: "M4 5h16v11H8l-4 4z" },
  { href: "/shortlist", label: "Shortlist", icon: "M6 3h12v18l-6-4-6 4z" },
  { href: "/profile", label: "Profile", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0" },
];

export function Nav({ variant }: { variant: "top" | "bottom" }) {
  const path = usePathname();
  const active = (href: string) => path === href || path.startsWith(href + "/");

  if (variant === "top") {
    return (
      <nav aria-label="Main" className="hidden gap-1 md:flex">
        {ITEMS.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${active(i.href) ? "bg-brand-soft text-brand-dark" : "text-muted hover:text-ink"}`}
          >
            {i.label}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav
      aria-label="Main"
      className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="grid grid-cols-5">
        {ITEMS.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active(i.href) ? "text-brand" : "text-muted"}`}
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={i.icon} />
            </svg>
            {i.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
