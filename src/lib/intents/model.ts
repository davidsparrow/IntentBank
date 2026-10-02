import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { serverEnv } from "@/lib/env";
import { COMMERCIAL_CATEGORIES } from "@/lib/taxonomy";
import { type Item, renderItems } from "./items";
import { type Analysis, analysisSchema } from "./schema";

export const INTENT_MODEL = "claude-sonnet-5-5";

const SYSTEM = `You are IntentBank's intent engine. IntentBank is a personal data vault: a person imports their own browsing, search and purchase history so they can see the commercial profile it implies and decide who may act on it. You work for that person.

You receive a table of their activity. Each row is an item: a search, page visit, video, purchase or something they told us directly ("stated"), with how many times it occurred and when it was last seen. Group items into intents — things the person is actively researching, planning or shopping for — so they can review them.

An intent is specific and commercial: "Premium Induction Range", "Iceland Trip", "Electric SUV", "AI Coding Tools". Not a topic ("Cooking"), not a site ("Amazon"), not a trait of the person. Prefer fewer, well-supported intents over many thin ones. Every intent needs at least two supporting items unless one of them is a stated interest. Items that don't support any intent can be left out — most browsing is not intent.

Categories: ${COMMERCIAL_CATEGORIES.map((c) => c.slug).join(", ")}.

For each intent:
- key: if one of the existing intents listed in the request is the same intent, reuse its key exactly so the person's corrections carry over; otherwise a short kebab-case slug.
- explanation: one or two plain sentences addressed to the person ("You compared…", "You searched for…") that point to the evidence. Never speculate beyond the items.
- purchase_horizon: how soon a purchase seems likely from the evidence; "ongoing interest" for continuing interests without a single purchase.
- purchase_completed: true only if a purchase item shows they already bought the main thing (accessories for it don't count).

Also classify every item whose category is "?" into one of the categories, or "none" if it isn't commercial.

Sensitive topics are never part of IntentBank: health or medical, personal finances or debt, politics, religion, sexuality or dating, children, precise location or addresses, private communications. Never infer them and never build an intent around them. If any item touches one of these topics, list its ref in sensitive_items so it can be deleted.`;

export interface ExistingIntentSummary {
  key: string;
  label: string;
  category_slug: string;
  feedback: string | null;
}

export interface ModelResult {
  analysis: Analysis;
  usage: { input: number; output: number };
}

export class ModelRefusalError extends Error {}

export async function runIntentModel(items: Item[], existing: ExistingIntentSummary[]): Promise<ModelResult> {
  const client = new Anthropic({ apiKey: serverEnv().anthropicApiKey, timeout: 240_000 });

  const existingText = existing.length
    ? existing.map((e) => `${e.key}\t${e.label}${e.feedback ? `\t(person said: ${e.feedback.replace(/_/g, " ")})` : ""}`).join("\n")
    : "(none)";

  const response = await client.beta.messages.parse({
    model: INTENT_MODEL,
    max_tokens: 16000,
    // Retries category-specific refusals on the recommended fallback model, server-side.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "medium", format: betaZodOutputFormat(analysisSchema) },
    messages: [
      {
        role: "user",
        content: `Existing intents:\n${existingText}\n\nActivity (${items.length} items):\n${renderItems(items)}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new ModelRefusalError("The analysis model declined this request.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("The analysis ran out of room. Try again with a shorter import window.");
  }
  if (!response.parsed_output) {
    throw new Error("The analysis returned an unreadable result.");
  }
  return {
    analysis: response.parsed_output,
    usage: {
      input:
        response.usage.input_tokens +
        (response.usage.cache_read_input_tokens ?? 0) +
        (response.usage.cache_creation_input_tokens ?? 0),
      output: response.usage.output_tokens,
    },
  };
}
