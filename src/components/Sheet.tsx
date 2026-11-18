"use client";
import { useEffect, useRef } from "react";

/** Bottom sheet on phones, centred dialog on larger screens. Uses the native <dialog> for focus and Esc. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  tall,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  tall?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className="m-0 mt-auto w-full max-w-none rounded-t-3xl bg-card p-0 text-ink shadow-2xl backdrop:bg-ink/40 sm:m-auto sm:max-w-lg sm:rounded-3xl"
    >
      <div className={`flex flex-col ${tall ? "h-[85dvh]" : "max-h-[85dvh]"}`}>
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-paper" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{open && children}</div>
      </div>
    </dialog>
  );
}
