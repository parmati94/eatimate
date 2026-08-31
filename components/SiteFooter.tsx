import Link from "next/link";

/** Footer links get a 44px row on touch: they were 16px tall, the smallest
 *  targets on every page. */
const link =
  "inline-flex min-h-11 items-center transition-colors hover:text-fg";

export default function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 px-4 py-2 text-xs text-muted">
        <span className="inline-flex min-h-11 items-center">
          © {new Date().getFullYear()} Eatimate
        </span>
        <Link href="/about" className={link}>
          About
        </Link>
        <Link href="/privacy" className={link}>
          Privacy
        </Link>
        <a
          href="https://github.com/parmati94/eatimate"
          rel="noopener"
          className={link}
        >
          GitHub
        </a>
        <span className="ml-auto inline-flex min-h-11 items-center">
          Restaurant nutrition calculators · not affiliated with any restaurant.
        </span>
      </div>
    </footer>
  );
}
