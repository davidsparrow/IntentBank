import { z } from "zod";
import { COMMERCIAL_CATEGORIES } from "@/lib/taxonomy";

// Shape of the model's answer. Kept free of numeric/length constraints, which structured outputs
// don't support; ranges and references are validated afterwards in merge.ts.

const commercial = COMMERCIAL_CATEGORIES.map((c) => c.slug) as [string, ...string[]];

export const HORIZONS = ["0-30 days", "1-3 months", "3-6 months", "6+ months", "ongoing interest"] as const;

export const analysisSchema = z.object({
  intents: z.array(
    z.object({
      key: z.string().describe("Stable id: reuse an existing intent's key when it is the same intent; otherwise a short kebab-case slug, e.g. 'induction-range'"),
      label: z.string().describe("Short title-case name, e.g. 'Premium Induction Range'"),
      category: z.enum(commercial),
      item_refs: z.array(z.number().int()).describe("refs of every item that supports this intent"),
      explanation: z.string().describe("One or two sentences, addressed to the user, citing the evidence"),
      purchase_horizon: z.enum(HORIZONS),
      commercial_value: z.enum(["low", "medium", "high"]),
      purchase_completed: z.boolean().describe("true only if the items show the main thing was already bought"),
    }),
  ),
  classified_items: z
    .array(z.object({ ref: z.number().int(), category: z.enum([...commercial, "none"]) }))
    .describe("A category for every item whose category is '?'"),
  sensitive_items: z.array(z.number().int()).describe("refs of items touching a sensitive topic"),
});

export type Analysis = z.infer<typeof analysisSchema>;
