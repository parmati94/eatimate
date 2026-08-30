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
  // True for entries we add that the source PDF has no row for — menu structure
  // the PDF can't express, e.g. a plain bowl (0 cal). Never used for real rows.
  synthetic: z.boolean().optional(),
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
    source: z.object({
      pdf_url: z.string().url(),
      retrieved: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
    disclaimer_extra: z.string().nullable().optional(),
    categories: z.array(CategorySchema).min(1),
    components: z.array(ComponentSchema).min(1),
  })
  .superRefine((chain, ctx) => {
    const catIds = new Set(chain.categories.map((c) => c.id));
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
