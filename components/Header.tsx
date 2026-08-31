import Link from "next/link";
import { Logo } from "./Logo";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Logo />
        <nav className="flex items-center gap-1">
          {/* "Restaurant nutrition calculators" used to sit here as static grey
              text beside this link, where it read as a nav item that had
              broken. It is a description of the site, so it lives in the
              footer now -- still on every page, no longer pretending to be
              navigation. */}
          <Link
            href="/compare"
            className="flex min-h-10 items-center rounded-full px-3 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            Compare
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
