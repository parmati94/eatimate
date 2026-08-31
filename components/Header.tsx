import Link from "next/link";
import { Logo } from "./Logo";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Logo />
        <div className="flex items-center gap-3">
          <Link
            href="/compare"
            className="rounded-full px-2.5 py-1 text-sm text-muted transition-colors hover:text-fg"
          >
            Compare
          </Link>
          <span className="hidden text-xs text-muted md:block">
            Restaurant nutrition calculators
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
