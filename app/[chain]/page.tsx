import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MealBuilder from "@/components/MealBuilder";
import { getChain } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/[chain]">,
): Promise<Metadata> {
  const { chain: slug } = await props.params;
  const chain = await getChain(slug);
  if (!chain) return {};
  return {
    title: `${chain.name} Nutrition Calculator | mealmath`,
    description: `Build your ${chain.name} meal ingredient by ingredient and get calories, protein, carbs, fat, and sodium totals.`,
  };
}

export default async function ChainPage(props: PageProps<"/[chain]">) {
  const { chain: slug } = await props.params;
  const chain = await getChain(slug);
  if (!chain) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <nav className="text-sm text-neutral-500">
        <Link href="/" className="hover:underline">
          mealmath
        </Link>{" "}
        / {chain.name}
      </nav>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
        {chain.name}{" "}
        <span className="text-emerald-600 dark:text-emerald-500">
          Nutrition Calculator
        </span>
      </h1>
      <p className="mb-6 mt-1 text-sm text-neutral-500">
        Build your order; the label updates as you go.
      </p>
      <MealBuilder chain={chain} />
      <footer className="mt-10 space-y-1 border-t border-neutral-200 pt-4 text-xs text-neutral-500 dark:border-neutral-800">
        <p>
          Not affiliated with or endorsed by {chain.name}. Nutrition values are
          approximations derived from{" "}
          <a
            href={chain.source.pdf_url}
            className="underline"
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
