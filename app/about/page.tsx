import type { Metadata } from "next";
import Link from "next/link";
import { listChains } from "@/lib/data";

export const metadata: Metadata = {
  title: "About",
  description:
    "What Eatimate is, where every nutrition number comes from, and how the data is kept honest.",
  alternates: { canonical: "/about" },
};

export default async function About() {
  const chains = await listChains();
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">About Eatimate</h1>
      <div className="mt-6 space-y-4 text-[15px] leading-relaxed">
        <p>
          Eatimate is a free nutrition calculator for build-your-own restaurant
          meals. Pick your ingredients the way you&apos;d order at the counter —
          base, protein, toppings, sauces — and the totals add up live, with an
          FDA-style label you can share as a link or copy into trackers like
          Lose&nbsp;It!.
        </p>
        <h2 className="pt-2 text-lg font-semibold">Where the numbers come from</h2>
        <p>
          Every number traces to the restaurant&apos;s own published nutrition
          data — each calculator links its source document and the date we
          retrieved it. Values are stored exactly as printed and only rounded
          for display using FDA labeling rules (21 CFR 101.9). In the rare case
          a published document contradicts itself, the correction is recorded
          in the data with the printed value, the value used, and the reason.
        </p>
        <p>
          Restaurants change recipes and rotate menus; treat totals as close
          approximations, and verify allergen or medical dietary decisions with
          the restaurant directly — allergens are deliberately out of scope
          here.
        </p>
        <h2 className="pt-2 text-lg font-semibold">Covered restaurants</h2>
        <p>{chains.map((c) => c.name).join(" · ")} — with more on the way.</p>
        <h2 className="pt-2 text-lg font-semibold">Not affiliated</h2>
        <p>
          Eatimate is independent: not affiliated with, endorsed by, or
          sponsored by any restaurant listed. Restaurant names are used only to
          identify whose published data a calculator is built from.
        </p>
        <h2 className="pt-2 text-lg font-semibold">Contact</h2>
        <p>
          Found a wrong number or want a restaurant added? Open an issue on{" "}
          <a
            href="https://github.com/parmati94/eatimate"
            className="underline decoration-line underline-offset-2 hover:text-accent-strong"
            rel="noopener"
          >
            GitHub
          </a>
          .
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
