import { Logo } from "./Logo";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Logo />
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted sm:block">
            Nutrition math for PDF-only restaurants
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
