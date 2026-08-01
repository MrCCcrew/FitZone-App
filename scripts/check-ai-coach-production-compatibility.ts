/**
 * Read-only compatibility check. It never runs automatically and never mutates
 * records. Run only against an explicitly approved database connection.
 */
import { db } from "../src/lib/db";

const models = [
  ["Offer", () => db.offer.count()],
  ["Membership", () => db.membership.count()],
  ["Trainer", () => db.trainer.count()],
  ["Class", () => db.class.count()],
  ["Schedule", () => db.schedule.count()],
  ["ClubGoal", () => db.clubGoal.count()],
  ["MembershipGoal", () => db.membershipGoal.count()],
  ["NutritionistProfile", () => db.nutritionistProfile.count()],
  ["Product", () => db.product.count()],
  ["ProductCategory", () => db.productCategory.count()],
  ["SiteContent", () => db.siteContent.count()],
] as const;

export async function readCompatibilityReport() {
  const results = await Promise.all(models.map(async ([name, count]) => {
    try { return { name, compatible: true, count: await count() }; }
    catch { return { name, compatible: false, count: null }; }
  }));
  const count = (name: string) => results.find((item) => item.name === name)?.count ?? 0;
  return {
    schemaCompatible: results.every((item) => item.compatible),
    models: results,
    trainerDataAvailable: Number(count("Trainer")) > 0,
    scheduleDataAvailable: Number(count("Schedule")) > 0,
    customOffersAvailable: await db.membership.count({ where: { kind: "custom", isActive: true } }).then((value) => value > 0).catch(() => false),
    missingOptionalContent: ["NutritionistProfile", "SiteContent", "ProductCategory"].filter((name) => Number(count(name)) === 0),
    blockingIncompatibility: results.filter((item) => !item.compatible).map((item) => item.name),
  };
}

async function main() {
  if (process.env.AI_COACH_COMPATIBILITY_ALLOW !== "1") {
    throw new Error("Set AI_COACH_COMPATIBILITY_ALLOW=1 only after approving the target database. This script is read-only.");
  }
  console.log(JSON.stringify(await readCompatibilityReport(), null, 2));
}

if (require.main === module) main().finally(() => db.$disconnect());
