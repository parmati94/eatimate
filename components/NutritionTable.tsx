import type { Chain } from "@/lib/schema";
import {
  roundCalories,
  roundCholesterol,
  roundFat,
  roundGrams,
  roundSodium,
} from "@/lib/rounding";

// A plain, crawlable rendering of every published value. The builder above is
// the product; this exists so the page also answers "<chain> nutrition facts"
// for people (and crawlers) who just want the table.
export default function NutritionTable({ chain }: { chain: Chain }) {
  const byCategory = chain.categories
    .map((cat) => ({
      cat,
      rows: chain.components.filter(
        (c) => c.category === cat.id && !c.synthetic,
      ),
    }))
    .filter((g) => g.rows.length > 0);

  const items = chain.components.filter((c) => !c.synthetic).length;

  // Collapsed by default: it is a reference, not the product. Still rendered
  // into the HTML (not display:none) so it stays crawlable and linkable.
  return (
    <section className="mt-10 border-t border-line pt-4">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-baseline gap-2 [&::-webkit-details-marker]:hidden">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
            {chain.name} Nutrition Facts
          </h2>
          <span className="text-sm text-muted">
            all {items} items
            <span className="ml-1 group-open:hidden" aria-hidden>
              &#9656;
            </span>
            <span className="ml-1 hidden group-open:inline" aria-hidden>
              &#9662;
            </span>
          </span>
        </summary>

      <p className="mt-2 max-w-3xl text-sm text-muted">
        Every item {chain.name} publishes, as served. Values come from{" "}
        {chain.name}&rsquo;s official nutrition guide (retrieved{" "}
        {chain.source.retrieved}) and are rounded for display using FDA labeling
        rules.
      </p>

      {byCategory.map(({ cat, rows }) => (
        <div key={cat.id} className="mt-8">
          <h3 className="text-base font-semibold">
            {chain.name} {cat.name}
          </h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <caption className="sr-only">
                {chain.name} {cat.name} nutrition facts
              </caption>
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Item
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Serving
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    Cal
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    Fat
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    Sat
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    Chol
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    Sodium
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    Carbs
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    Fiber
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    Sugars
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Protein
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-line/60">
                    <th
                      scope="row"
                      className="py-1.5 pr-3 text-left font-normal"
                    >
                      {c.name}
                    </th>
                    <td className="py-1.5 pr-3 text-muted">{c.serving_desc}</td>
                    <td className="py-1.5 pr-3 text-right">
                      {roundCalories(c.calories)}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {roundFat(c.fat_g)}g
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {roundFat(c.sat_fat_g)}g
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {roundCholesterol(c.cholesterol_mg)}mg
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {roundSodium(c.sodium_mg)}mg
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {roundGrams(c.carbs_g)}g
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {roundGrams(c.fiber_g)}g
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {roundGrams(c.sugars_g)}g
                    </td>
                    <td className="py-1.5 text-right">
                      {roundGrams(c.protein_g)}g
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      </details>
    </section>
  );
}
