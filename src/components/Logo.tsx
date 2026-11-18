/** Brand mark: a compass needle on teal (a "path finder"). Also used as the assistant avatar. */
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="10" fill="#0f6e6a" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="#e2f1ef" strokeWidth="1.5" opacity="0.6" />
      <path d="M16 6.5 19.2 16 16 25.5 12.8 16Z" fill="#fde8e0" />
      <path d="M16 6.5 19.2 16H12.8Z" fill="#e8603c" />
      <circle cx="16" cy="16" r="1.6" fill="#0f6e6a" />
    </svg>
  );
}
