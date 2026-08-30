import { z } from "zod";

const nonNeg = z.number().nonnegative();

export const CorrectionSchema = z.object({
  field: z.string(),
  printed: z.number().nullable(),
  used: z.number(),
  reason: z.string(),
});

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
  cholesterol_mg: nonNeg,
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
});

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
});

export const CategorySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  select: z.enum(["single", "multi"]),
  // "build" categories form the numbered build-your-own flow; "extras" render
  // as collapsed add-on sections (drinks, kids, signature items...). Absent = build.
  flow: z.enum(["build", "extras"]).optional(),
});

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
      .refine((s) => Boolean(s.pdf_url ?? s.html_url), {
        message: "source needs either pdf_url or html_url",
      }),
    disclaimer_extra: z.string().nullable().optional(),
    // Homepage tile illustration id (see components/ChainGlyph.tsx).
    glyph: z.string().optional(),
    // Short unique intro shown under the page title (and used as the meta
    // description). Editorial, not from the PDF.
    blurb: z.string().nullable().optional(),
    categories: z.array(CategorySchema).min(1),
    size_modes: z.array(SizeModeSchema).min(2).optional(),
    components: z.array(ComponentSchema).min(1),
  })
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
export type Totals = Record<NutrientField, number>;
