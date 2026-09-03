import { z } from "zod";

const nonNeg = z.number().nonnegative();

export const CorrectionSchema = z.object({
  field: z.string(),
  printed: z.number().nullable(),
  used: z.number(),
  reason: z.string(),
}).strict();

export const ComponentSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  category: z.string().min(1),
  serving_desc: z.string().min(1),
  serving_g: z.number().positive().nullable(),
  calories: nonNeg,
  fat_g: nonNeg,
  sat_fat_g: nonNeg,
  trans_fat_g: nonNeg,
  // Nullable because a chain may simply not publish it. Chipotle publishes
  // every other nutrient and no cholesterol at all; storing 0 would be a
  // number we invented, and a meat bowl reading 0 mg would be a lie.
  cholesterol_mg: nonNeg.nullable(),
  sodium_mg: nonNeg,
  carbs_g: nonNeg,
  fiber_g: nonNeg,
  sugars_g: nonNeg,
  protein_g: nonNeg,
  corrections: z.array(CorrectionSchema).optional(),
  // Selecting this component activates the named chain size_mode (e.g. the
  // "Footlong" format row activates footlong scaling).
  size_mode: z.string().optional(),
  // Component is only shown while one of these modes is active (e.g. loaves
  // under six-inch/footlong, mini loaves under kids-mini). Absent = always.
  only_modes: z.array(z.string()).optional(),
  // True for entries we add that the source PDF has no row for — menu structure
  // the PDF can't express, e.g. a plain bowl (0 cal). Never used for real rows.
  synthetic: z.boolean().optional(),
  // A row the chain sells but publishes no ingredient-level figures for, whose
  // values we worked out from two figures the chain DOES publish. Carries the
  // arithmetic in plain words; the page states it on the row and in the footer,
  // because a number of ours must never pass for one of theirs.
  derived: z.string().optional(),
  // Which of this row's nutrients are our estimate rather than the chain's
  // figure. A total containing one is shown as approximate, so a screenshot of
  // the label can never pass an estimate off as a measurement.
  estimated: z.array(z.string()).optional(),
  // Size variants of one item collapse into a single row with a size selector,
  // rather than listing "Small Fries", "Medium Fries", "Large Fries" separately.
  // The group head carries only variant_label; its siblings point at it.
  variant_of: z.string().optional(),
  variant_label: z.string().optional(),
  // A row the chain publishes as part of building one specific choice rather
  // than as an alternative to it: Domino's brushes garlic oil onto a hand
  // tossed crust and dusts parmesan on the stuffed one. Picking one must NOT
  // clear the crust the way picking a different crust does -- it is additive.
  // Never inferred: sauce and cheese rows have the identical shape (gated to a
  // mode, no size_mode of their own) and are strictly alternatives.
  addon_of: z.string().optional(),
  // Surfaced in the "Make it a meal" step instead of being buried in a long
  // extras list. EDITORIAL: nothing in a nutrition document says fries are
  // ordered more than kale, so this is our judgement, set by hand per chain.
  // It affects ordering and prominence only — never a number.
  feature: z.boolean().optional(),
  // The category this menu item is published WITHOUT, in the chain's own
  // words: Chopt and Just Salad both state that a named salad's figures carry
  // no dressing. On the menu path that category is then promoted from "Add to
  // it" to a numbered step under the pick, because a step you owe and a thing
  // you may add are different claims, and the first is the one the chain made.
  // Never inferred from a wrap or sandwich, whose sauce IS in the figure.
  needs: z.string().optional(),
}).strict();

// Chain-wide size scaling (e.g. Subway 6" vs Footlong): the active mode
// multiplies every component in the listed categories. Activated by selecting
// a component that carries `size_mode`. Only for cases where the source
// document itself states the multiplier.
export const SizeModeSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  note: z.string().optional(),
  default: z.boolean().optional(),
  multipliers: z.record(z.string(), z.number().positive()),
  // How many portions the built item divides into in this mode.
  portion_count: z.number().int().positive().optional(),
}).strict();

export const CATEGORY_ROLES = [
  "preset", "entree", "format", "base", "protein", "topping", "cheese",
  "sauce", "side", "drink", "dessert", "kids", "other",
] as const;
export type CategoryRole = (typeof CATEGORY_ROLES)[number];

export const CategorySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  select: z.enum(["single", "multi"]),
  // "build" categories form the numbered build-your-own flow; "extras" render
  // as collapsed add-on sections (drinks, kids, signature items...). Absent = build.
  // "preset" opens the flow: pick a published menu item as a starting point.
  // "both" is a numbered step in EITHER path -- the toppings you pile on are
  // the same act whether you started from a Wreck or built one, and burying
  // them under "add to it" misreads how a sandwich shop is ordered.
  flow: z.enum(["preset", "build", "extras", "both"]).optional(),
  // A named menu item already comes with one of these, so the menu path does
  // not offer it. A `build` category otherwise appears on BOTH paths -- as a
  // numbered step when building from scratch, and under "Add to it" when
  // starting from a menu item -- which had Jimmy John's offering a second loaf
  // of bread under a sandwich whose bread you picked in step 1.
  //
  // Declared rather than inferred from `select: "single"`, which gets seven of
  // the eight cases right and then misses Just Salad's "Wrap / Bread": two
  // rows, multi-select, and every bit as structural as a size.
  in_preset: z.boolean().optional(),
  // Whether the SIZE is the question in this category, which decides if the
  // size chips render before a row is picked or wait for it. Inferred from
  // `flow` when absent -- extras lead with size, everything else holds it back
  // -- because on most chains "which item" comes first and chips on every row
  // are the whole cost of the list (Chick-fil-A's fourteen menu items ran
  // 3,219px against Burger King's 851px, and 2,987px of that was chip rows).
  //
  // Declared here because the inference breaks on a drinks-led chain: Sonic's
  // Soft Drinks is `flow: "both"` so it can head the build path, which made it
  // hide its cup sizes while the Limeades beside it showed theirs -- and the
  // cup size is exactly what a Route 44 is chosen by.
  size_leads: z.boolean().optional(),

  // What KIND of thing this category holds, from a fixed list, so cross-chain
  // code can ask "the sauces" or "the proteins" instead of guessing from a
  // name -- which is what the consistency test did, with a regex over
  // category names, before this existed. Editorial, set per chain; it never
  // changes a number. `preset` is a list of published whole items you start
  // from; `entree` is a whole item filed elsewhere (Domino's pasta under
  // extras); `format` is the structural pick (bun, crust, size, tortilla).
  role: z.enum(CATEGORY_ROLES).optional(),
  // Optional explanatory line shown under the category heading.
  note: z.string().optional(),
}).strict();

// How much of the built item was eaten, for chains whose published unit is a
// fraction of what you order: Papa John's publishes per slice, but you build a
// pizza. Coverage stays per-component (half pepperoni); this is the portion.
export const PortionSchema = z.object({
  unit: z.string().min(1),
  categories: z.array(z.string()).min(1),
}).strict();

export const ChainSchema = z
  .object({
    name: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    // A chain's published source is a PDF for most chains and a web page for
    // others (Panda Express). Exactly one of the two is required.
    source: z
      .object({
        pdf_url: z.string().url().optional(),
        html_url: z.string().url().optional(),
        retrieved: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        // Last date refresh.py found the source unchanged. Optional: it is
        // absent until the first --touch, and never earlier than retrieved.
        verified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .strict()
      .refine((s) => Boolean(s.pdf_url ?? s.html_url), {
        message: "source needs either pdf_url or html_url",
      }),
    disclaimer_extra: z.string().nullable().optional(),
    // Homepage tile illustration id (see components/ChainGlyph.tsx).
    glyph: z.string().optional(),
    // Short unique intro. Editorial, not from the PDF. Rendered below the
    // builder (it is reading, and the builder is the reason for the visit) and
    // reused as the meta description with a provenance clause appended.
    blurb: z.string().nullable().optional(),
    // What the chain sells, in a customer's words -- "Burrito", "Bowl". Shown
    // under the homepage tile, where an ingredient count used to be: nobody
    // picks a restaurant by ingredient count, and 784 vs 35 made the better
    // covered chain look worse.
    formats: z.array(z.string().min(1)).min(1).max(5).optional(),
    // Which path the page opens on, for a chain where one of them is plainly
    // the common order. Pizza is built far more often than a whole specialty
    // pizza is picked off the list, so making everyone answer "how do you want
    // to start?" first spends a click on a question with a usual answer. The
    // chooser is not removed -- "Change" still switches paths.
    default_flow: z.enum(["menu", "build"]).optional(),
    // Deliberate departures from what the chain's cuisine peers do, each with
    // the reason. lib/consistency.test.ts fails CI on an UNDECLARED departure,
    // so the only way past it is to fix the chain or write down why it differs
    // -- which is the point: with seventeen chains and more coming, drift is
    // found by a reader noticing, and readers stop noticing.
    consistency: z.record(z.string(), z.string().min(20)).optional(),
    categories: z.array(CategorySchema).min(1),
    size_modes: z.array(SizeModeSchema).min(2).optional(),
    portion: PortionSchema.optional(),
    components: z.array(ComponentSchema).min(1),
  })
  .strict()
  .superRefine((chain, ctx) => {
    const catIds = new Set(chain.categories.map((c) => c.id));
    const modeIds = new Set((chain.size_modes ?? []).map((m) => m.id));
    for (const comp of chain.components) {
      for (const m of comp.only_modes ?? []) {
        if (!modeIds.has(m)) {
          ctx.addIssue({
            code: "custom",
            message: `component "${comp.id}" gated on unknown size mode "${m}"`,
          });
        }
      }
      if (comp.size_mode && !modeIds.has(comp.size_mode)) {
        ctx.addIssue({
          code: "custom",
          message: `component "${comp.id}" references unknown size mode "${comp.size_mode}"`,
        });
      }
    }
    for (const mode of chain.size_modes ?? []) {
      for (const cat of Object.keys(mode.multipliers)) {
        if (!catIds.has(cat)) {
          ctx.addIssue({
            code: "custom",
            message: `size mode "${mode.id}" multiplies unknown category "${cat}"`,
          });
        }
      }
    }
    // Variant groups: a head must exist, sit in the same category, and not
    // itself be a variant (no chains of variants).
    const byId = new Map(chain.components.map((c) => [c.id, c]));
    for (const comp of chain.components) {
      if (!comp.variant_of) continue;
      const head = byId.get(comp.variant_of);
      if (!head) {
        ctx.addIssue({
          code: "custom",
          message: `component "${comp.id}" is a variant of unknown component "${comp.variant_of}"`,
        });
      } else if (head.variant_of) {
        ctx.addIssue({
          code: "custom",
          message: `component "${comp.id}" points at "${head.id}", which is itself a variant`,
        });
      } else if (head.category !== comp.category) {
        ctx.addIssue({
          code: "custom",
          message: `variant "${comp.id}" is in category "${comp.category}" but its head "${head.id}" is in "${head.category}"`,
        });
      }
      if (!comp.variant_label) {
        ctx.addIssue({
          code: "custom",
          message: `variant "${comp.id}" needs a variant_label for the size selector`,
        });
      }
    }

    for (const comp of chain.components) {
      if (!comp.addon_of) continue;
      const parent = byId.get(comp.addon_of);
      if (!parent) {
        ctx.addIssue({
          code: "custom",
          message: `component "${comp.id}" is an add-on to unknown component "${comp.addon_of}"`,
        });
      } else if (parent.category !== comp.category) {
        ctx.addIssue({
          code: "custom",
          message: `add-on "${comp.id}" is in category "${comp.category}" but its parent "${parent.id}" is in "${parent.category}"`,
        });
      } else if (parent.addon_of) {
        ctx.addIssue({
          code: "custom",
          message: `add-on "${comp.id}" points at "${parent.id}", which is itself an add-on`,
        });
      }
    }

    const flowOf = new Map(chain.categories.map((c) => [c.id, c.flow ?? "build"]));
    for (const comp of chain.components) {
      if (!comp.needs) continue;
      if (!catIds.has(comp.needs)) {
        ctx.addIssue({
          code: "custom",
          message: `component "${comp.id}" needs unknown category "${comp.needs}"`,
        });
      } else if (flowOf.get(comp.needs) !== "both") {
        // Only a `both` category is on the menu path to be promoted; a `build`
        // one would sit in an accordion the promotion cannot reach.
        ctx.addIssue({
          code: "custom",
          message: `component "${comp.id}" needs "${comp.needs}", which is not a \`both\` category`,
        });
      } else if (flowOf.get(comp.category) !== "preset") {
        ctx.addIssue({
          code: "custom",
          message: `component "${comp.id}" carries \`needs\` but is not a menu item`,
        });
      }
    }

    for (const cat of chain.portion?.categories ?? []) {
      if (!catIds.has(cat)) {
        ctx.addIssue({
          code: "custom",
          message: `portion scales unknown category "${cat}"`,
        });
      }
    }

    const compIds = new Set<string>();
    for (const comp of chain.components) {
      if (!catIds.has(comp.category)) {
        ctx.addIssue({
          code: "custom",
          message: `component "${comp.id}" references unknown category "${comp.category}"`,
        });
      }
      if (compIds.has(comp.id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate component id "${comp.id}"`,
        });
      }
      compIds.add(comp.id);
    }
  });

export type Correction = z.infer<typeof CorrectionSchema>;
export type SizeMode = z.infer<typeof SizeModeSchema>;
export type Component = z.infer<typeof ComponentSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type Chain = z.infer<typeof ChainSchema>;

export const NUTRIENT_FIELDS = [
  "calories",
  "fat_g",
  "sat_fat_g",
  "trans_fat_g",
  "cholesterol_mg",
  "sodium_mg",
  "carbs_g",
  "fiber_g",
  "sugars_g",
  "protein_g",
] as const;

export type NutrientField = (typeof NUTRIENT_FIELDS)[number];

/** Field names as a person would read them, for corrections and label copy. */
export const NUTRIENT_LABELS: Record<NutrientField, string> = {
  calories: "calories",
  fat_g: "total fat",
  sat_fat_g: "saturated fat",
  trans_fat_g: "trans fat",
  cholesterol_mg: "cholesterol",
  sodium_mg: "sodium",
  carbs_g: "carbohydrate",
  fiber_g: "dietary fibre",
  sugars_g: "sugars",
  protein_g: "protein",
};

export const NUTRIENT_UNITS: Record<NutrientField, string> = {
  calories: "cal",
  fat_g: "g",
  sat_fat_g: "g",
  trans_fat_g: "g",
  cholesterol_mg: "mg",
  sodium_mg: "mg",
  carbs_g: "g",
  fiber_g: "g",
  sugars_g: "g",
  protein_g: "g",
};
export type Totals = Record<NutrientField, number>;
