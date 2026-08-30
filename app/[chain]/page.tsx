import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MealBuilder from "@/components/MealBuilder";
import { IconExternal } from "@/components/icons";
import { getChain } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/[chain]">,
): Promise<Metadata> {
  const { chain: slug } = await props.params;
  const chain = await getChain(slug);
  if (!chain) return {};
  const title = `${chain.name} nutrition calculator`;
  const description = `Build your ${chain.name} meal ingredient by ingredient and get calories, protein, carbs, fat, and sodium totals.`;
  return {
    title,
    description,
    openGraph: { title: `${title} · Eatimate`, description },
    twitter: { title: `${title} · Eatimate`, description },
  };
}

export default async function ChainPage(props: PageProps<"/[chain]">) {
  const { chain: slug } = await props.params;
  const chain = await getChain(slug);
  if (!chain) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {chain.name}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Build your order — totals update as you go.
          </p>
        </div>
        <a
          href={chain.source.pdf_url}
          rel="nofollow noopener"
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-fg"
        >
          <IconExternal className="h-3.5 w-3.5" />
          Source PDF · {chain.source.retrieved}
        </a>
      </div>

      <MealBuilder chain={chain} />

      <footer className="mt-12 space-y-1 border-t border-line pt-4 text-xs leading-relaxed text-muted">
        <p>
          Not affiliated with or endorsed by {chain.name}. Nutrition values are
          approximations derived from{" "}
          <a
            href={chain.source.pdf_url}
            className="underline decoration-line underline-offset-2 hover:text-fg"
            rel="nofollow noopener"
          >
            {chain.name}&apos;s published nutrition data
          </a>{" "}
          (retrieved {chain.source.retrieved}); actual values vary with
          portioning and preparation. Verify allergen and dietary decisions with
          the restaurant directly.
        </p>
        {chain.disclaimer_extra && <p>{chain.disclaimer_extra}</p>}
      </footer>
    </main>
  );
}
