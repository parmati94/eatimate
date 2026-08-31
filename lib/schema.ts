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
  // Surfaced in the "Make it a meal" step instead of being buried in a long
  // extras list. EDITORIAL: nothing in a nutrition document says fries are
  // ordered more than kale, so this is our judgement, set by hand per chain.
  // It affects ordering and prominence only — never a number.
  feature: z.boolean().optional(),
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

export const CategorySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  select: z.enum(["single", "multi"]),
  // "build" categories form the numbered build-your-own flow; "extras" render
  // as collapsed add-on sections (drinks, kids, signature items...). Absent = build.
  // "preset" opens the flow: pick a published menu item as a starting point.
  flow: z.enum(["preset", "build", "extras"]).optional(),
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
