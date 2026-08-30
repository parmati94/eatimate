import Link from "next/link";

export function Logomark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="14" fill="#059669" />
      <circle cx="32" cy="19.2" r="5.4" fill="#fff" />
      <rect x="16" y="28.5" width="32" height="7" rx="3.5" fill="#fff" />
      <circle cx="32" cy="44.8" r="5.4" fill="#fff" />
    </svg>
  );
}

export function Logo({ wordmark = true }: { wordmark?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="mealmath home"
      className="inline-flex items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Logomark />
      {wordmark && (
        <span className="text-[17px] font-bold tracking-tight">
          meal<span className="text-accent-strong">math</span>
        </span>
      )}
    </Link>
  );
}
