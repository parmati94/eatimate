import type { Metadata } from "next";
import Link from "next/link";
import AnalyticsToggle from "@/components/AnalyticsToggle";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Eatimate's privacy policy: no accounts, no tracking cookies, meals never leave your device.",
  alternates: { canonical: "/privacy" },
};

export default function Privacy() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Privacy</h1>
      <p className="mt-2 text-sm text-muted">Effective September 3, 2026</p>
      <div className="mt-6 space-y-4 text-[15px] leading-relaxed">
        <p>
          Eatimate is a calculator: there are no accounts, no sign-ups, and the
          meal you build is never sent to us. Totals are computed in your
          browser, and a meal you share lives entirely in the link&apos;s
          address — we never receive or store it. We do count anonymous,
          cookieless usage, described below.
        </p>
        <h2 className="pt-2 text-lg font-semibold">What the site stores on your device</h2>
        <p>
          A few conveniences in localStorage, on your device only: your
          light/dark theme choice, the last order you built at each chain (so
          the calculator can offer it back to you), and which macro the totals
          bar shows. Nothing in it leaves your browser, and clearing site data
          removes it. No tracking cookies, no advertising identifiers, no
          fingerprinting.
        </p>
        <h2 className="pt-2 text-lg font-semibold">Analytics</h2>
        <p>
          We count how the site is used, so we know which calculators are worth
          the work. It is cookieless and anonymous: no accounts, no advertising
          identifiers, no fingerprinting, no profile of you, and nothing that
          follows you to another site.
        </p>
        <p>
          What is recorded is the page you viewed, and a short list of actions
          with no detail attached: that a meal was started, that the nutrition
          label or a comparison was opened, that search was used, that a link
          was shared. Those carry the restaurant and a count of items — never
          which items. <strong>The meal you build is not sent anywhere.</strong>{" "}
          Your address bar holds it so a link can share it, and the analytics
          request has the query string deliberately stripped out, so what you
          picked stays between you and your browser.
        </p>
        <p>
          This runs on{" "}
          <a href="https://umami.is/privacy" className="underline decoration-line underline-offset-2" rel="noopener nofollow">
            Umami
          </a>
          , a privacy-focused analytics service that processes this data for us.
          It is served from our own domain rather than theirs. If your browser
          sends a Do&nbsp;Not&nbsp;Track signal, nothing is recorded at all.
        </p>
        <AnalyticsToggle />
        <h2 className="pt-2 text-lg font-semibold">Infrastructure</h2>
        <p>
          The site is served through Cloudflare, which processes IP addresses
          transiently to route traffic and block abuse, and may set strictly
          functional security cookies. See{" "}
          <a href="https://www.cloudflare.com/privacypolicy/" className="underline decoration-line underline-offset-2" rel="noopener nofollow">
            Cloudflare&apos;s privacy policy
          </a>
          . Cloudflare also reports aggregate page-view counts.
        </p>
        <h2 className="pt-2 text-lg font-semibold">Advertising</h2>
        <p>
          There are currently no ads on Eatimate. If that changes, this policy
          will be updated first, and any consent requirements will be honored.
        </p>
        <h2 className="pt-2 text-lg font-semibold">Changes</h2>
        <p>
          Updates to this policy appear on this page with a new effective date.
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
