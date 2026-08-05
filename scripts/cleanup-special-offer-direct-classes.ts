#!/usr/bin/env tsx
/**
 * Cleanup Script: Remove OfferAllowedClass direct links from SPECIAL offers
 *
 * Purpose:
 * - Special offers (type === "special") should ONLY use OfferAllowedClassType
 * - Direct OfferAllowedClass links were incorrectly created by backfill
 * - This script removes those incorrect direct links
 *
 * Safety:
 * - Works ONLY on special offers (type === "special")
 * - Does NOT touch percentage/fixed offers
 * - Does NOT delete OfferAllowedClassType
 * - Does NOT delete Offers
 * - Does NOT modify Bookings
 * - Does NOT modify UserMemberships
 * - Does NOT change sessions or capacity
 * - Transaction-safe
 * - Idempotent
 *
 * Usage:
 *   npm run cleanup:special-offer-classes              (dry-run)
 *   npm run cleanup:special-offer-classes -- --apply   (execute)
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

interface CleanupStats {
  specialOffersCount: number;
  totalDirectLinksFound: number;
  totalDirectLinksDeleted: number;
  offerDetails: Array<{
    id: string;
    title: string;
    directLinksCount: number;
    classTypesCount: number;
  }>;
}

async function cleanupSpecialOfferDirectClasses(options: {
  dryRun: boolean;
}): Promise<void> {
  const { dryRun } = options;

  console.log("\n" + "=".repeat(70));
  console.log(
    dryRun
      ? "🔍 CLEANUP PREVIEW - DRY RUN MODE"
      : "⚠️  CLEANUP EXECUTION - APPLYING CHANGES"
  );
  console.log("=".repeat(70) + "\n");

  const stats: CleanupStats = {
    specialOffersCount: 0,
    totalDirectLinksFound: 0,
    totalDirectLinksDeleted: 0,
    offerDetails: [],
  };

  try {
    // 1. Find all special offers
    const specialOffers = await db.offer.findMany({
      where: { type: "special" },
      include: {
        allowedClasses: true,
        allowedClassTypes: true,
      },
      orderBy: { title: "asc" },
    });

    stats.specialOffersCount = specialOffers.length;

    console.log(`📊 Found ${stats.specialOffersCount} special offer(s)\n`);

    if (specialOffers.length === 0) {
      console.log("✅ No special offers to process.\n");
      return;
    }

    // 2. Analyze each special offer
    for (const offer of specialOffers) {
      const directLinksCount = offer.allowedClasses.length;
      const classTypesCount = offer.allowedClassTypes.length;

      stats.totalDirectLinksFound += directLinksCount;

      stats.offerDetails.push({
        id: offer.id,
        title: offer.title,
        directLinksCount,
        classTypesCount,
      });

      console.log(`📌 Offer: ${offer.title}`);
      console.log(`   ID: ${offer.id}`);
      console.log(`   Direct Links (OfferAllowedClass): ${directLinksCount}`);
      console.log(`   Class Types (OfferAllowedClassType): ${classTypesCount}`);
      console.log(
        `   Types: ${offer.allowedClassTypes.map((t) => t.classType).join(", ") || "none"}\n`
      );
    }

    // 3. Show summary before execution
    console.log("─".repeat(70));
    console.log("📋 CLEANUP SUMMARY:");
    console.log("─".repeat(70));
    console.log(`Total special offers: ${stats.specialOffersCount}`);
    console.log(
      `Total OfferAllowedClass links to delete: ${stats.totalDirectLinksFound}`
    );
    console.log(
      `OfferAllowedClassType will remain: ${stats.offerDetails.reduce((sum, o) => sum + o.classTypesCount, 0)}`
    );
    console.log("");

    if (stats.totalDirectLinksFound === 0) {
      console.log("✅ No direct links found. Nothing to clean up.\n");
      return;
    }

    // 4. Execute cleanup if --apply
    if (!dryRun) {
      console.log("🔄 Executing cleanup...\n");

      await db.$transaction(async (tx) => {
        for (const offer of specialOffers) {
          if (offer.allowedClasses.length > 0) {
            const deleted = await tx.offerAllowedClass.deleteMany({
              where: { offerId: offer.id },
            });

            stats.totalDirectLinksDeleted += deleted.count;

            console.log(
              `  ✅ ${offer.title}: Deleted ${deleted.count} direct link(s)`
            );
          }
        }
      });

      console.log("");
      console.log("─".repeat(70));
      console.log("✅ CLEANUP COMPLETED SUCCESSFULLY");
      console.log("─".repeat(70));
      console.log(`Total direct links deleted: ${stats.totalDirectLinksDeleted}`);
      console.log("");
      console.log("⚠️  IMPORTANT:");
      console.log("   - OfferAllowedClassType entries preserved");
      console.log("   - Offers NOT deleted");
      console.log("   - Bookings NOT modified");
      console.log("   - UserMemberships NOT modified");
      console.log("   - Sessions and capacity unchanged");
      console.log("");
    } else {
      console.log("💡 No data was modified (dry-run mode).");
      console.log(
        "   To apply changes, run: npm run cleanup:special-offer-classes -- --apply\n"
      );
    }

    // 5. Verify integrity
    console.log("─".repeat(70));
    console.log("🔍 VERIFICATION:");
    console.log("─".repeat(70));

    const remainingLinks = await db.offerAllowedClass.count({
      where: {
        offer: { type: "special" },
      },
    });

    console.log(`Remaining OfferAllowedClass for special offers: ${remainingLinks}`);

    if (!dryRun && remainingLinks > 0) {
      console.warn(
        "⚠️  WARNING: Some direct links still exist. This should not happen."
      );
    }

    if (!dryRun && remainingLinks === 0 && stats.totalDirectLinksFound > 0) {
      console.log("✅ All direct links successfully removed from special offers.");
    }

    console.log("");
  } catch (error) {
    console.error("\n❌ Cleanup failed:", error);
    throw error;
  } finally {
    await db.$disconnect();
  }
}

// Parse CLI arguments
const args = process.argv.slice(2);
const dryRun = !args.includes("--apply");

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Cleanup Special Offer Direct Classes Script

Purpose:
  Remove OfferAllowedClass direct links from special offers (type === "special")
  Special offers should ONLY use class types (OfferAllowedClassType)

Usage:
  npm run cleanup:special-offer-classes              (dry-run preview)
  npm run cleanup:special-offer-classes -- --apply   (execute cleanup)

Options:
  --apply      Apply changes to database
  --help       Show this help message
  -h           Alias for --help

Safety:
  - Works ONLY on special offers
  - Preserves OfferAllowedClassType
  - Does NOT modify bookings or memberships
  - Transaction-safe
  - Idempotent
`);
  process.exit(0);
}

// Execute
cleanupSpecialOfferDirectClasses({ dryRun })
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
