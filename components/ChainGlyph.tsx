// Flat food illustrations for chain tiles (tinted-ground treatment): main
// shapes draw in currentColor (the chain hue), cut-out details in the surface
// color. Add a case here when a new chain's config declares a new glyph id.
export default function ChainGlyph({
  glyph,
  className = "h-11 w-11",
}: {
  glyph: string;
  className?: string;
}) {
  const detail = "var(--surface)";
  const body = {
    burger: (
      <g>
        <path d="M12 30a20 14 0 0 1 40 0v2H12Z" fill="currentColor" />
        <circle cx="24" cy="24" r="1.6" fill="var(--surface)" />
        <circle cx="32" cy="21" r="1.6" fill="var(--surface)" />
        <circle cx="40" cy="24" r="1.6" fill="var(--surface)" />
        <path d="M11 36h42a3 3 0 0 1 0 6H11a3 3 0 0 1 0-6Z" fill="currentColor" opacity=".8" />
        <path d="M13 46h38v2a6 6 0 0 1-6 6H19a6 6 0 0 1-6-6Z" fill="currentColor" />
      </g>
    ),
    burrito: (
      <g>
        <ellipse cx="32" cy="38" rx="20" ry="12" fill="currentColor" />
        <path d="M12 38a20 12 0 0 1 40 0" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <ellipse cx="32" cy="26" rx="20" ry="8" fill="currentColor" />
        <circle cx="24" cy="26" r="2.4" fill={detail} />
        <circle cx="33" cy="24" r="2.4" fill={detail} />
        <circle cx="41" cy="27" r="2.4" fill={detail} />
      </g>
    ),
    taco: (
      <g>
        <path d="M10 44a22 22 0 0 1 44 0Z" fill="currentColor" />
        <path d="M15 44a17 17 0 0 1 34 0Z" fill={detail} opacity=".35" />
        <circle cx="24" cy="38" r="2.6" fill={detail} />
        <circle cx="32" cy="34" r="2.6" fill={detail} />
        <circle cx="40" cy="38" r="2.6" fill={detail} />
        <path d="M10 44h44" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </g>
    ),
    grainbowl: (
      <g fill="currentColor">
        <path d="M12 32h40a20 20 0 0 1-40 0Z" />
        <circle cx="22" cy="26" r="3.4" />
        <circle cx="32" cy="23" r="3.4" />
        <circle cx="42" cy="26" r="3.4" />
        <rect x="24" y="50" width="16" height="5" rx="2.5" />
      </g>
    ),
    pita: (
      <g>
        <path d="M10 40a22 22 0 0 1 44 0l-2 4H12Z" fill="currentColor" />
        <path d="M17 36a15 15 0 0 1 30 0" fill="none" stroke={detail} strokeWidth="4" strokeLinecap="round" opacity=".45" />
        <circle cx="26" cy="36" r="2.6" fill={detail} />
        <circle cx="38" cy="36" r="2.6" fill={detail} />
      </g>
    ),
    salad: (
      <g fill="currentColor">
        <path d="M12 34h40a20 18 0 0 1-40 0Z" />
        <path d="M20 30c0-8 4-12 4-12s5 3 5 12" opacity=".85" />
        <path d="M35 30c0-8 4-12 4-12s5 3 5 12" opacity=".85" />
        <path d="M28 30c0-10 4-15 4-15s4 5 4 15" />
      </g>
    ),
    sub: (
      <g>
        <path d="M10 34h44v4a8 8 0 0 1-8 8H18a8 8 0 0 1-8-8Z" fill="currentColor" />
        <path d="M10 30a10 10 0 0 1 10-8h24a10 10 0 0 1 10 8v2H10Z" fill="currentColor" />
        <path d="M12 32c4 4 8-4 12 0s8-4 12 0 8-4 12 0" stroke={detail} strokeWidth="3.4" fill="none" strokeLinecap="round" />
      </g>
    ),
    wing: (
      <g fill="currentColor">
        <path d="M22 20a12 12 0 0 1 20 8c1 8-6 14-13 13l-9 9a4 4 0 1 1-6-6l9-9c-2-6 0-12-1-15Z" transform="rotate(6 32 32)" />
        <circle cx="17" cy="47" r="4.6" />
      </g>
    ),
  }[glyph];
  if (!body) return null;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      {body}
    </svg>
  );
}
