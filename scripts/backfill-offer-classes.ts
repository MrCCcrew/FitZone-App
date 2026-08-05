#!/usr/bin/env tsx
/**
 * Backfill Script: Convert OfferAllowedClassType → OfferAllowedClass
 *
 * Purpose:
 * - Migrates legacy classType-based filtering to classId-based filtering
 * - Creates OfferAllowedClass entries for each offer's allowed class types
 *
 * Usage:
 *   npm run backfill:offer-classes -- --dry-run    (preview only)
 *   npm run backfill:offer-classes -- --apply      (execute changes)
 *   npm run backfill:offer-classes -- --apply --verbose
 *
 * Safety:
 * - Dry-run by default
 * - Transactional execution
 * - Idempotent (safe to run multiple times)
 * - Does NOT modify bookings, memberships, capacity, or sessions
 * - Does NOT delete legacy OfferAllowedClassType entries
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

interface BackfillStats {
  offersProcessed: number;
  totalClassLinks: number;
  duplicatesSkipped: number;
  unmatchedTypes: Set<string>;
  offersWithNoMatches: string[];
}

interface OfferBackfillResult {
  offerId: string;
  offerTitle: string;
  legacyTypes: string[];
  matchingClasses: Array<{ id: string; name: string; type: string }>;
  linksCreated: number;
}

async function backfillOfferClasses(options: {
  dryRun: boolean;
  verbose: boolean;
}): Promise<void> {
  const { dryRun, verbose } = options;

  console.log("\n" + "=".repeat(70));
  console.log(
    dryRun
      ? "🔍 BACKFILL PREVIEW - DRY RUN MODE"
      : "⚠️  BACKFILL EXECUTION - APPLYING CHANGES"
  );
  console.log("=".repeat(70) + "\n");

  const stats: BackfillStats = {
    offersProcessed: 0,
    totalClassLinks: 0,
    duplicatesSkipped: 0,
    unmatchedTypes: new Set(),
    offersWithNoMatches: [],
  };

  try {
    // 1. Load all offers with legacy classType entries
    const offers = await db.offer.findMany({
      include: {
        allowedClassTypes: true,
        allowedClasses: true, // Check existing direct links
      },
      orderBy: { title: "asc" },
    });

    console.log(`📊 Total Offers Found: ${offers.length}\n`);

    if (offers.length === 0) {
      console.log("✅ No offers to process.\n");
      return;
    }

    const results: OfferBackfillResult[] = [];

    // 2. Process each offer
    for (const offer of offers) {
      const legacyTypes = offer.allowedClassTypes.map((t) =>
        t.classType.toLowerCase().trim()
      );

      if (legacyTypes.length === 0) {
        if (verbose) {
          console.log(`⏭️  Offer: ${offer.title}`);
          console.log(`   No legacy class types defined\n`);
        }
        continue;
      }

      // 3. Find all active classes matching the legacy types
      const matchingClasses = await db.class.findMany({
        where: {
          type: {
            in: legacyTypes,
          },
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          type: true,
        },
        orderBy: [{ type: "asc" }, { name: "asc" }],
      });

      // Track unmatched types
      const matchedTypes = new Set(
        matchingClasses.map((c) => c.type.toLowerCase())
      );
      legacyTypes.forEach((type) => {
        if (!matchedTypes.has(type)) {
          stats.unmatchedTypes.add(type);
        }
      });

      if (matchingClasses.length === 0) {
        stats.offersWithNoMatches.push(offer.title);
      }

      results.push({
        offerId: offer.id,
        offerTitle: offer.title,
        legacyTypes: offer.allowedClassTypes.map((t) => t.classType),
        matchingClasses,
        linksCreated: 0,
      });

      stats.offersProcessed++;
    }

    // 4. Display preview
    console.log("📋 PREVIEW:\n");
    for (const result of results) {
      console.log(`Offer: ${result.offerTitle}`);
      console.log(`  Legacy types: ${result.legacyTypes.join(", ")}`);
      console.log(`  Matched classes: ${result.matchingClasses.length}`);

      if (verbose && result.matchingClasses.length > 0) {
        result.matchingClasses.forEach((cls) => {
          console.log(`    - ${cls.name} (${cls.type})`);
        });
      }

      if (result.matchingClasses.length === 0) {
        console.log(`  ⚠️  WARNING: No active classes found for this offer!`);
      }

      console.log("");
    }

    // 5. Execute or skip based on mode
    if (!dryRun) {
      console.log("🔄 Applying changes...\n");

      for (const result of results) {
        if (result.matchingClasses.length === 0) continue;

        try {
          // Use transaction for safety
          await db.$transaction(
            result.matchingClasses.map((cls) =>
              db.offerAllowedClass.upsert({
                where: {
                  offerId_classId: {
                    offerId: result.offerId,
                    classId: cls.id,
                  },
                },
                create: {
                  offerId: result.offerId,
                  classId: cls.id,
                },
                update: {}, // No updates needed if exists
              })
            )
          );

          // Count how many were actually created (vs already existed)
          const existingCount = await db.offerAllowedClass.count({
            where: { offerId: result.offerId },
          });

          result.linksCreated = existingCount;
          stats.totalClassLinks += existingCount;

          console.log(
            `✅ ${result.offerTitle}: ${existingCount} class links verified`
          );
        } catch (error) {
          console.error(`❌ Error processing ${result.offerTitle}:`, error);
          throw error; // Abort on any error
        }
      }
    } else {
      // Dry run: calculate what would be created
      for (const result of results) {
        stats.totalClassLinks += result.matchingClasses.length;
      }
    }

    // 6. Summary
    console.log("\n" + "=".repeat(70));
    console.log("📊 SUMMARY:");
    console.log("=".repeat(70));
    console.log(`Offers processed: ${stats.offersProcessed}`);
    console.log(
      `Total class links ${dryRun ? "to create" : "created/verified"}: ${
        stats.totalClassLinks
      }`
    );

    if (stats.unmatchedTypes.size > 0) {
      console.log(
        `\n⚠️  Unmatched legacy types (no active classes found):`
      );
      Array.from(stats.unmatchedTypes)
        .sort()
        .forEach((type) => console.log(`   - ${type}`));
    }

    if (stats.offersWithNoMatches.length > 0) {
      console.log(`\n⚠️  Offers with NO matched classes:`);
      stats.offersWithNoMatches.forEach((title) =>
        console.log(`   - ${title}`)
      );
    }

    if (dryRun) {
      console.log(
        "\n💡 No data was modified (dry-run mode)."
      );
      console.log("   To apply changes, run: npm run backfill:offer-classes -- --apply\n");
    } else {
      console.log("\n✅ Backfill completed successfully!\n");
      console.log("⚠️  IMPORTANT:");
      console.log("   - Legacy OfferAllowedClassType entries were NOT deleted");
      console.log("   - They serve as fallback during transition period");
      console.log(
        "   - Monitor logs for 'Legacy fallback used' warnings"
      );
      console.log(
        "   - After 1 month with no warnings, legacy can be removed\n"
      );
    }
  } catch (error) {
    console.error("\n❌ Backfill failed:", error);
    throw error;
  } finally {
    await db.$disconnect();
  }
}

// Parse CLI arguments
const args = process.argv.slice(2);
const dryRun = !args.includes("--apply");
const verbose = args.includes("--verbose") || args.includes("-v");

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Backfill Offer Classes Script

Usage:
  npm run backfill:offer-classes              (dry-run preview)
  npm run backfill:offer-classes -- --dry-run (explicit dry-run)
  npm run backfill:offer-classes -- --apply   (execute changes)
  npm run backfill:offer-classes -- --apply --verbose

Options:
  --dry-run    Preview changes without modifying database (default)
  --apply      Apply changes to database
  --verbose    Show detailed class listings
  -v           Alias for --verbose
  --help       Show this help message
  -h           Alias for --help

Safety:
  - Dry-run by default (requires explicit --apply)
  - Transactional execution
  - Idempotent (safe to run multiple times)
  - Does NOT delete legacy entries
  - Does NOT modify bookings or sessions
`);
  process.exit(0);
}

// Execute
backfillOfferClasses({ dryRun, verbose })
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
