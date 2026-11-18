"use client";
import { useShortlist } from "@/lib/client/store";

const MAX = 10;

export function ShortlistButton({ code, compact, inList }: { code: string; compact?: boolean; inList?: boolean }) {
  const [list, setList] = useShortlist();
  const saved = inList ?? list.includes(code);
  const full = !saved && list.length >= MAX;
  return (
    <button
      type="button"
      onClick={() => setList(saved ? list.filter((c) => c !== code) : [...list, code])}
      disabled={full}
      title={full ? `Shortlist is full (${MAX})` : undefined}
      aria-pressed={saved}
      className={`${saved ? "chip-on" : "chip"} shrink-0 ${compact ? "min-h-9" : "min-h-11 px-4 text-sm"}`}
    >
      {saved ? "★ Saved" : full ? "List full" : "☆ Save"}
    </button>
  );
}
