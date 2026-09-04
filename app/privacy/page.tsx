import type { Metadata } from "next";
import Link from "next/link";
import AnalyticsToggle from "@/components/AnalyticsToggle";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Eatimate's privacy policy: no accounts, no tracking cookies, meals never leave your device.",
  alternates: { canonical: "/privacy" },
};

const link = "underline decoration-line underline-offset-2";

export default function Privacy() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Privacy</h1>
      <p className="mt-2 text-sm text-muted">Effective September 4, 2026</p>
      <div className="mt-6 space-y-4 text-[15px] leading-relaxed">
        <p>
          Eatimate is a calculator. No accounts, no tracking cookies, no ads,
          no profile of you. Totals are worked out in your browser, and the
          meal you build is never sent to us — a shared link carries it in the
          address and nowhere else.
        </p>

        <h2 className="pt-2 text-lg font-semibold">On your device</h2>
        <p>
          localStorage keeps your theme, your last order at each chain, and
          which macro the totals bar shows. It never leaves your browser, and
          clearing site data removes it.
        </p>

        <h2 className="pt-2 text-lg font-semibold">Analytics</h2>
        <p>
          We count pages viewed and a few actions — a meal started, a label or
          comparison opened, search used, a link shared — each tagged with the
          restaurant and a number of items, never which items. The query
          string is stripped out, so your meal stays yours.
        </p>
        <p>
          When a search finds nothing, we record what was typed. It is how we
          learn which restaurant or item to add next.
        </p>
        <p>
          This runs on{" "}
          <a href="https://umami.is/" className={link} rel="noopener nofollow">
            Umami
          </a>
          , which we host on our own server — nothing goes to an analytics
          company. Do&nbsp;Not&nbsp;Track is honored.
        </p>
        <AnalyticsToggle />

        <h2 className="pt-2 text-lg font-semibold">Infrastructure</h2>
        <p>
          Cloudflare serves the site, handling IP addresses transiently to
          route traffic and block abuse, and may set functional security
          cookies. It also reports aggregate page views. See{" "}
          <a href="https://www.cloudflare.com/privacypolicy/" className={link} rel="noopener nofollow">
            their privacy policy
          </a>
          .
        </p>

        <h2 className="pt-2 text-lg font-semibold">Changes</h2>
        <p>
          If ads or anything else material change, this page is updated first,
          with a new effective date.
        </p>
      </div>
      <p className="mt-8 text-sm">
        <Link href="/" className="text-accent-strong hover:underline">
          ← All calculators
        </Link>
      </p>
    </main>
  );
}
