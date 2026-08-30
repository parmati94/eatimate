import { listChains } from "@/lib/data";
import ChainSearch from "@/components/ChainSearch";

export const dynamic = "force-dynamic";

export default async function Home() {
  const chains = await listChains();
  const totalComponents = chains.reduce(
    (n, c) => n + c.components.length,
    0,
  );

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-16 pt-16 sm:pt-24">
      <div className="text-center">
        <h1 className="text-5xl font-extrabold tracking-tight">
          meal<span className="text-emerald-600 dark:text-emerald-500">math</span>
        </h1>
        <p className="mx-auto mt-3 max-w-md text-lg text-neutral-500">
          Nutrition math for restaurants that only publish a PDF.
        </p>
      </div>

      <div className="mt-10">
        <ChainSearch
          chains={chains.map((c) => ({
            slug: c.slug,
            name: c.name,
            componentCount: c.components.length,
            retrieved: c.source.retrieved,
          }))}
        />
      </div>

      <p className="mt-12 text-center text-sm text-neutral-400 dark:text-neutral-500">
        {chains.length} restaurant{chains.length === 1 ? "" : "s"} ·{" "}
        {totalComponents} ingredients · every number traced to official
        nutrition PDFs
      </p>
    </main>
  );
}
