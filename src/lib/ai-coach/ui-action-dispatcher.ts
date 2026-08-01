import { z } from "zod";
import { siteCapabilities } from "@/lib/ai-coach/site-capability-registry";

/**
 * The browser receives only these declarative actions.  In particular it never
 * receives a URL, a selector, executable code, or an arbitrary callback from
 * a model/tool response.
 */
export const COACH_UI_ACTION_EVENT = "fitzone:ai-coach-ui-actions";
export const COACH_UI_ACTION_RESULT_EVENT = "fitzone:ai-coach-ui-action-result";

const pageSchema = z.enum(["home", "offers", "memberships", "trainers", "schedule", "shop"]);
export const COACH_SECTION_IDS = [...new Set(siteCapabilities.map((capability) => capability.sectionId).filter((id): id is string => Boolean(id)))];
const sectionSchema = z.enum(COACH_SECTION_IDS as [string, ...string[]]);
const idList = z.array(z.string().min(1).max(128)).max(100);

const basePayload = z.object({
  goalId: z.string().min(1).max(128).nullable().optional(),
  trainerIds: idList.optional(),
  membershipIds: idList.optional(),
  productIds: idList.optional(),
  classIds: idList.optional(),
  filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())])).optional(),
  sort: z.enum(["price_asc", "price_desc", "date_asc"]).nullable().optional(),
  openItemId: z.string().min(1).max(128).nullable().optional(),
}).strict();

export const coachUiActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("navigateToPage"), page: pageSchema }).strict(),
  z.object({ type: z.literal("openSection"), sectionId: sectionSchema }).strict(),
  z.object({ type: z.literal("scrollToSection"), sectionId: sectionSchema }).strict(),
  z.object({ type: z.literal("setGoalFilter"), goalId: z.string().min(1).max(128).nullable() }).strict(),
  z.object({ type: z.literal("setMembershipResults"), membershipIds: idList, sort: z.enum(["price_asc", "price_desc"]).nullable().optional() }).strict(),
  z.object({ type: z.literal("setTrainerFilter"), trainerIds: idList, specialty: z.string().max(160).nullable().optional() }).strict(),
  z.object({ type: z.literal("setClassFilter"), classIds: idList.optional(), trialOnly: z.boolean().optional(), date: z.string().max(40).nullable().optional() }).strict(),
  z.object({ type: z.literal("setProductFilters"), productIds: idList.optional(), searchTerm: z.string().max(160).nullable().optional(), categoryId: z.string().max(128).nullable().optional(), sort: z.enum(["price_asc", "price_desc"]).nullable().optional() }).strict(),
  z.object({ type: z.literal("highlightItems"), itemType: z.enum(["offer", "trainer", "membership", "class", "product", "goal", "nutrition"]), ids: idList }).strict(),
  z.object({ type: z.literal("openItemDetails"), itemType: z.enum(["offer", "trainer", "membership", "class", "product", "goal", "nutrition"]), itemId: z.string().min(1).max(128) }).strict(),
  z.object({ type: z.literal("clearPreviousCoachState"), domain: z.enum(["offers", "goals", "memberships", "trainers", "classes", "products", "nutrition"]).nullable().optional() }).strict(),
]);

export const coachUiActionBatchSchema = z.object({
  actions: z.array(coachUiActionSchema).min(1).max(12),
  payload: basePayload.optional(),
}).strict();

export type CoachUiAction = z.infer<typeof coachUiActionSchema>;
export type CoachUiActionBatch = z.infer<typeof coachUiActionBatchSchema>;
export type CoachUiActionResult = {
  requestId: string;
  status: "ui_action_completed" | "ui_action_failed" | "section_not_found" | "item_not_found" | "navigation_blocked";
  completed: boolean;
};

export function parseCoachUiActionBatch(value: unknown): CoachUiActionBatch | null {
  const parsed = coachUiActionBatchSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const pageForSection: Record<string, z.infer<typeof pageSchema>> = {
  goals: "memberships",
  memberships: "memberships",
  "packages-section": "offers",
  offers: "offers",
  classes: "schedule",
  "trainers-list": "trainers",
  nutrition: "home",
  "shop-products": "shop",
};

/** Converts the existing tool contract into strictly validated browser actions. */
export function actionsFromNavigationTarget(target: { page?: string | null; sectionId?: string | null } | null | undefined, payload: z.input<typeof basePayload> = {}): CoachUiActionBatch | null {
  if (!target?.sectionId || !COACH_SECTION_IDS.includes(target.sectionId)) return null;
  const page = pageForSection[target.sectionId];
  if (!page) return null;
  return parseCoachUiActionBatch({
    actions: [
      { type: "clearPreviousCoachState" },
      { type: "navigateToPage", page },
      { type: "openSection", sectionId: target.sectionId },
      { type: "scrollToSection", sectionId: target.sectionId },
    ],
    payload,
  });
}
