import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-4 text-xs text-muted">
        <span>© {new Date().getFullYear()} Eatimate</span>
        <Link href="/about" className="hover:text-fg">About</Link>
        <Link href="/privacy" className="hover:text-fg">Privacy</Link>
        <a href="https://github.com/parmati94/eatimate" rel="noopener" className="hover:text-fg">GitHub</a>
        <span className="ml-auto">Not affiliated with any restaurant.</span>
      </div>
    </footer>
  );
}
