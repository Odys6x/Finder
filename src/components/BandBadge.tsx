import type { Band } from "@/lib/types";

const STYLE: Record<Band, { cls: string; label: string; dot: string }> = {
  safe: { cls: "bg-safe-soft text-safe", label: "Safe", dot: "bg-safe" },
  borderline: { cls: "bg-border-soft text-border", label: "Borderline", dot: "bg-border" },
  reach: { cls: "bg-reach-soft text-reach", label: "Reach", dot: "bg-reach" },
};

export function BandBadge({ band }: { band: Band | null }) {
  if (!band)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-paper px-2.5 py-1 text-xs font-semibold text-muted">
        <span className="h-2 w-2 rounded-full border border-muted" aria-hidden />
        No COP yet
      </span>
    );
  const s = STYLE[band];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${s.cls}`}>
      <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}

export const BAND_LABEL = { safe: "Safe", borderline: "Borderline", reach: "Reach" } as const;
export const BAND_COLOR = { safe: "#136c33", borderline: "#c27a00", reach: "#b42318" } as const;
