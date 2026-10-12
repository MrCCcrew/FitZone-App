import fs from "node:fs";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { PrismaClient } from "@prisma/client";
import { evaluateOfferAgeEligibility } from "@/lib/offer-age-eligibility";

const raw =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL;

if (!raw) {
  throw new Error(
    "REFUSING: offer age integration test requires DATABASE_URL",
  );
}

const url = new URL(raw);

if (
  process.env.APP_ENV !== "test" ||
  url.hostname !== "127.0.0.1" ||
  decodeURIComponent(url.username) !== "fitzone_test_user" ||
  url.pathname !== "/fitzone_test"
) {
  throw new Error(
    "REFUSING: offer age integration test requires fitzone_test as fitzone_test_user",
  );
}

const db = new PrismaClient();

const stamp =
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const offerId = `age-offer-${stamp}`;
const userId = `age-user-${stamp}`;
const userEmail = `age-${stamp}@test.local`;

const NOW = new Date("2026-10-10T12:00:00.000Z");

async function cleanup() {
  await db.offer.deleteMany({
    where: {
      id: offerId,
    },
  });

  await db.user.deleteMany({
    where: {
      id: userId,
    },
  });
}

async function evaluatePersistedAge(
  birthDate: Date | null,
) {
  await db.user.update({
    where: {
      id: userId,
    },
    data: {
      birthDate,
    },
  });

  const configRows =
    await db.$queryRaw<
      Array<{
        requiresBirthDate: boolean | number;
        minAgeYears: number | null;
        maxAgeYears: number | null;
      }>
    >`
      SELECT
        requiresBirthDate,
        minAgeYears,
        maxAgeYears
      FROM Offer
      WHERE id = ${offerId}
      LIMIT 1
    `;

  expect(configRows).toHaveLength(1);

  const config = configRows[0];

  const user = await db.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      birthDate: true,
    },
  });

  expect(user).not.toBeNull();

  return evaluateOfferAgeEligibility({
    requiresBirthDate:
      config.requiresBirthDate === true ||
      Number(config.requiresBirthDate) === 1,
    minAgeYears: config.minAgeYears,
    maxAgeYears: config.maxAgeYears,
    birthDate: user?.birthDate ?? null,
    now: NOW,
  });
}

beforeAll(async () => {
  await db.$connect();

  const identity =
    await db.$queryRaw<Array<{ db: string }>>`
      SELECT DATABASE() AS db
    `;

  expect(identity[0]?.db).toBe("fitzone_test");

  await cleanup();

  await db.user.create({
    data: {
      id: userId,
      email: userEmail,
      name: "Offer Age Integration User",
      emailVerified: NOW,
      role: "member",
      isActive: true,
    },
  });

  await db.$executeRaw`
    INSERT INTO Offer (
      id,
      title,
      type,
      discount,
      expiresAt,
      isActive,
      currentSubscribers,
      specialPrice,
      sessionsCount,
      durationDays,
      requiresBirthDate,
      minAgeYears,
      maxAgeYears
    )
    VALUES (
      ${offerId},
      ${"Offer Age Integration Fixture"},
      ${"special"},
      ${0},
      ${new Date("2027-12-31T23:59:59.000Z")},
      ${true},
      ${0},
      ${0},
      ${12},
      ${30},
      ${true},
      ${13},
      ${25}
    )
  `;
});

afterAll(async () => {
  try {
    await cleanup();
  } finally {
    await db.$disconnect();
  }
});

describe(
  "offer age eligibility persisted integration",
  () => {
    it(
      "rejects a restricted offer when birth date is missing",
      async () => {
        const result =
          await evaluatePersistedAge(null);

        expect(result).toMatchObject({
          eligible: false,
          ageYears: null,
          code: "BIRTH_DATE_REQUIRED",
        });
      },
    );

    it(
      "accepts the customer on the 13th birthday",
      async () => {
        const result =
          await evaluatePersistedAge(
            new Date("2013-10-10T00:00:00.000Z"),
          );

        expect(result).toMatchObject({
          eligible: true,
          ageYears: 13,
          code: null,
        });
      },
    );

    it(
      "accepts age 25 through the day before the 26th birthday",
      async () => {
        const result =
          await evaluatePersistedAge(
            new Date("2000-10-11T00:00:00.000Z"),
          );

        expect(result).toMatchObject({
          eligible: true,
          ageYears: 25,
          code: null,
        });
      },
    );

    it(
      "rejects the customer on the 26th birthday",
      async () => {
        const result =
          await evaluatePersistedAge(
            new Date("2000-10-10T00:00:00.000Z"),
          );

        expect(result).toMatchObject({
          eligible: false,
          ageYears: 26,
          code: "AGE_NOT_ELIGIBLE",
        });
      },
    );

    it(
      "keeps the authoritative age gate before synthetic membership writes",
      () => {
        const source = fs.readFileSync(
          path.join(
            process.cwd(),
            "src/app/api/subscribe/route.ts",
          ),
          "utf8",
        );

        const configIndex =
          source.indexOf("const ageConfigRows");

        const evaluationIndex =
          source.indexOf(
            "evaluateOfferAgeEligibility({",
          );

        const rejectionIndex =
          source.indexOf(
            "if (!ageEligibility.eligible)",
          );

        const syntheticIndex =
          source.indexOf(
            "const syntheticMarker",
          );

        expect(configIndex).toBeGreaterThan(-1);
        expect(evaluationIndex).toBeGreaterThan(-1);
        expect(rejectionIndex).toBeGreaterThan(-1);
        expect(syntheticIndex).toBeGreaterThan(-1);

        expect(configIndex).toBeLessThan(
          syntheticIndex,
        );

        expect(evaluationIndex).toBeLessThan(
          syntheticIndex,
        );

        expect(rejectionIndex).toBeLessThan(
          syntheticIndex,
        );

        expect(source).toContain(
          "ageEligibility.code,",
        );

        expect(source).toContain(
          '"BIRTH_DATE_REQUIRED"',
        );

        expect(source).toContain(
          '"AGE_NOT_ELIGIBLE"',
        );

        expect(source).toContain(
          '"INVALID_AGE_RULE"',
        );
      },
    );
  },
);