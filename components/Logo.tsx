import Link from "next/link";

export function Logomark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="14" fill="#0d9488" />
      <g fill="#fff" transform="translate(8 8) scale(0.75)">
        <path
          fillRule="evenodd"
          d="M6 22 H58 A26 26 0 0 1 6 22 Z M22 29 H42 a2.5 2.5 0 0 1 0 5 H22 a2.5 2.5 0 0 1 0 -5 Z M22 38 H42 a2.5 2.5 0 0 1 0 5 H22 a2.5 2.5 0 0 1 0 -5 Z"
        />
        <path d="M22 52 H42 a3 3 0 0 1 0 6 H22 a3 3 0 0 1 0 -6 Z" />
      </g>
    </svg>
  );
}

export function Logo({ wordmark = true }: { wordmark?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="eatimate home"
      className="inline-flex items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Logomark />
      {wordmark && (
        <span className="text-[17px] font-bold tracking-tight">
          eat<span className="text-accent-strong">imate</span>
        </span>
      )}
    </Link>
  );
}
