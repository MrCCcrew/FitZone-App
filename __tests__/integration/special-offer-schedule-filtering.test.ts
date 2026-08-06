import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { GET } from "@/app/api/public/route";
import { clearPublicApiCacheKey } from "@/lib/public-cache";

let db: PrismaClient;
let trainerId: string;
let userId: string;
let fitnessClassId: string;
let danceClassId: string;
let specialOfferId: string;
let regularOfferId: string;

function testDatabaseUrl() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) {
    throw new Error("TEST_DATABASE_URL is required for special offer schedule filtering tests.");
  }

  const url = new URL(value);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (database !== "fitzone_test") {
    throw new Error("Special offer schedule filtering tests require the fitzone_test database.");
  }
  return value;
}

beforeAll(async () => {
  process.env.DATABASE_URL = testDatabaseUrl();
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Special offer schedule filtering tests require NODE_ENV=test.");
  }

  // Create a fresh Prisma instance for this test file to avoid connection pool issues
  db = new PrismaClient({
    datasources: {
      db: {
        url: testDatabaseUrl(),
      },
    },
  });

  await db.$connect();

  // Create test user
  const user = await db.user.create({
    data: {
      name: "Special Offer Test User",
      email: `special-offer-test-${Date.now()}@test.local`,
      phone: "01000000099",
      password: "hashed",
      role: "customer",
    },
  });
  userId = user.id;

  // Create trainer
  const trainer = await db.trainer.create({
    data: {
      userId,
      name: "Test Trainer",
      specialty: "All",
      bio: "Test",
      isActive: true,
    },
  });
  trainerId = trainer.id;

  // Create fitness class with schedules
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  const fitnessClass = await db.class.create({
    data: {
      name: "Fitness Class",
      trainerId,
      type: "fitness",
      duration: 60,
      intensity: "medium",
      maxSpots: 10,
      price: 100,
      isActive: true,
      schedules: {
        create: [
          {
            date: tomorrow,
            time: "10:00",
            availableSpots: 10,
            isActive: true,
          },
        ],
      },
    },
  });
  fitnessClassId = fitnessClass.id;

  // Create dance class with schedules
  const danceClass = await db.class.create({
    data: {
      name: "تعليم رقص شرقي",
      trainerId,
      type: "oriental_dance",
      duration: 60,
      intensity: "medium",
      maxSpots: 10,
      price: 100,
      isActive: true,
      schedules: {
        create: [
          {
            date: tomorrow,
            time: "14:00",
            availableSpots: 10,
            isActive: true,
          },
        ],
      },
    },
  });
  danceClassId = danceClass.id;

  // Create special offer: fitness only
  const specialOffer = await db.offer.create({
    data: {
      title: "Special Offer - Fitness Only",
      type: "special",
      discount: 0,
      specialPrice: 500,
      expiresAt: new Date("2026-12-31"),
      isActive: true,
      maxSubscribers: 50,
      currentSubscribers: 0,
      showOnHome: true,
      showMaxSubscribers: true,
      showCurrentSubscribers: true,
      allowedClassTypes: {
        create: [{ classType: "fitness" }],
      },
    },
  });
  specialOfferId = specialOffer.id;

  // Create regular offer: direct links to both classes
  const regularOffer = await db.offer.create({
    data: {
      title: "Regular Offer - Both Classes",
      type: "percentage",
      discount: 20,
      expiresAt: new Date("2026-12-31"),
      isActive: true,
      maxSubscribers: 30,
      currentSubscribers: 0,
      showOnHome: false,
      showMaxSubscribers: true,
      showCurrentSubscribers: true,
      allowedClasses: {
        create: [
          { classId: fitnessClassId },
          { classId: danceClassId },
        ],
      },
    },
  });
  regularOfferId = regularOffer.id;
}, 30000);

afterEach(async () => {
  // Clear cache between tests to ensure isolation
  const { clearPublicApiCache } = await import("@/lib/public-cache");
  clearPublicApiCache();
});

afterAll(async () => {
  if (!db) return;

  try {
    if (specialOfferId || regularOfferId) {
      await db.offerAllowedClass.deleteMany({
        where: { offerId: { in: [specialOfferId, regularOfferId].filter(Boolean) } },
      });
    }
    if (specialOfferId) {
      await db.offerAllowedClassType.deleteMany({
        where: { offerId: specialOfferId },
      });
    }
    if (specialOfferId || regularOfferId) {
      await db.offer.deleteMany({
        where: { id: { in: [specialOfferId, regularOfferId].filter(Boolean) } },
      });
    }
    if (fitnessClassId || danceClassId) {
      await db.class.deleteMany({
        where: { id: { in: [fitnessClassId, danceClassId].filter(Boolean) } },
      });
    }
    if (trainerId) {
      await db.trainer.delete({ where: { id: trainerId } });
    }
    if (userId) {
      await db.user.delete({ where: { id: userId } });
    }
  } catch (error) {
    console.error("Cleanup error:", error);
  }

  // Disconnect this test's db instance
  if (db) await db.$disconnect();
});

describe("Special Offer Schedule Filtering - /api/public", () => {
  it("special offer with fitness only returns NO dance class", async () => {
    const request = new Request(
      `http://localhost:3000/api/public?lang=ar&offerId=${specialOfferId}`
    );
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    const classes = data.classes as Array<{ id: string; type: string; name: string }>;

    // Should contain fitness class
    const hasFitness = classes.some((c) => c.id === fitnessClassId);
    expect(hasFitness).toBe(true);

    // Should NOT contain dance class
    const hasDance = classes.some((c) => c.id === danceClassId);
    expect(hasDance).toBe(false);
  });

  it("special offer with empty types returns zero classes", async () => {
    const emptyOffer = await db.offer.create({
      data: {
        title: "Empty Special Offer",
        type: "special",
        discount: 0,
        specialPrice: 300,
        expiresAt: new Date("2026-12-31"),
        isActive: true,
        maxSubscribers: 20,
        currentSubscribers: 0,
        showOnHome: false,
        showMaxSubscribers: true,
        showCurrentSubscribers: true,
      },
    });

    const request = new Request(
      `http://localhost:3000/api/public?lang=ar&offerId=${emptyOffer.id}`
    );
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    const classes = data.classes as Array<unknown>;
    expect(classes.length).toBe(0);

    await db.offer.delete({ where: { id: emptyOffer.id } });
  });

  it("regular offer with offerId returns 400 (not supported)", async () => {
    const request = new Request(
      `http://localhost:3000/api/public?lang=ar&offerId=${regularOfferId}`
    );
    const response = await GET(request);

    // Regular offers don't support schedule filtering via offerId
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("special offers");
  });

  it("request without offerId returns all active classes", async () => {
    const request = new Request("http://localhost:3000/api/public?lang=ar");
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    const classes = data.classes as Array<{ id: string }>;

    const classIds = classes.map((c) => c.id);
    expect(classIds).toContain(fitnessClassId);
    expect(classIds).toContain(danceClassId);
  });

  it("changing allowedClassTypes changes results", async () => {
    const testOffer = await db.offer.create({
      data: {
        title: "Test Update Offer",
        type: "special",
        discount: 0,
        specialPrice: 400,
        expiresAt: new Date("2026-12-31"),
        isActive: true,
        maxSubscribers: 30,
        currentSubscribers: 0,
        showOnHome: false,
        showMaxSubscribers: true,
        showCurrentSubscribers: true,
        allowedClassTypes: {
          create: [{ classType: "fitness" }],
        },
      },
    });

    // First fetch: should see fitness
    let request = new Request(
      `http://localhost:3000/api/public?lang=ar&offerId=${testOffer.id}`
    );
    let response = await GET(request);
    let data = await response.json();
    let classes = data.classes as Array<{ id: string; type: string }>;

    expect(classes.some((c) => c.type === "fitness")).toBe(true);
    expect(classes.some((c) => c.type === "oriental_dance")).toBe(false);

    // Update to oriental_dance
    await db.offerAllowedClassType.deleteMany({
      where: { offerId: testOffer.id },
    });
    await db.offerAllowedClassType.create({
      data: {
        offerId: testOffer.id,
        classType: "oriental_dance",
      },
    });

    // Clear cache for this specific offer
    clearPublicApiCacheKey(`ar:offer:${testOffer.id}`);

    // Second fetch: should see oriental_dance
    request = new Request(
      `http://localhost:3000/api/public?lang=ar&offerId=${testOffer.id}`
    );
    response = await GET(request);
    data = await response.json();
    classes = data.classes as Array<{ id: string; type: string }>;

    expect(classes.some((c) => c.type === "oriental_dance")).toBe(true);
    expect(classes.some((c) => c.type === "fitness")).toBe(false);

    // Cleanup
    await db.offerAllowedClassType.deleteMany({
      where: { offerId: testOffer.id },
    });
    await db.offer.delete({ where: { id: testOffer.id } });
  });

  it("invalid offerId returns 400 error", async () => {
    const request = new Request(
      "http://localhost:3000/api/public?lang=ar&offerId=invalid-uuid-12345"
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
    expect(data.error).toContain("not found or inactive");
  });

  it("inactive special offer returns 400 error (no fallback)", async () => {
    const inactiveOffer = await db.offer.create({
      data: {
        title: "Inactive Special Offer",
        type: "special",
        specialPrice: 400,
        expiresAt: new Date("2026-12-31"),
        isActive: false, // INACTIVE
        discount: 0,
        maxSubscribers: 50,
        currentSubscribers: 0,
        showOnHome: false,
        showMaxSubscribers: true,
        showCurrentSubscribers: true,
        allowedClassTypes: {
          create: [{ classType: "fitness" }],
        },
      },
    });

    const request = new Request(
      `http://localhost:3000/api/public?lang=ar&offerId=${inactiveOffer.id}`
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
    expect(data.error).toContain("not found or inactive");
    expect(data.classes).toBeUndefined(); // No fallback to all classes

    // Cleanup
    await db.offerAllowedClassType.deleteMany({
      where: { offerId: inactiveOffer.id },
    });
    await db.offer.delete({ where: { id: inactiveOffer.id } });
  });

  it("expired special offer returns 400 error (no fallback)", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const expiredOffer = await db.offer.create({
      data: {
        title: "Expired Special Offer",
        type: "special",
        specialPrice: 500,
        expiresAt: yesterday, // EXPIRED
        isActive: true,
        discount: 0,
        maxSubscribers: 50,
        currentSubscribers: 0,
        showOnHome: false,
        showMaxSubscribers: true,
        showCurrentSubscribers: true,
        allowedClassTypes: {
          create: [{ classType: "fitness" }],
        },
      },
    });

    const request = new Request(
      `http://localhost:3000/api/public?lang=ar&offerId=${expiredOffer.id}`
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
    expect(data.error).toContain("not found or inactive");
    expect(data.classes).toBeUndefined(); // No fallback to all classes

    // Cleanup
    await db.offerAllowedClassType.deleteMany({
      where: { offerId: expiredOffer.id },
    });
    await db.offer.delete({ where: { id: expiredOffer.id } });
  });

  it("cache isolation: offer A does not leak to offer B", async () => {
    // Create two special offers with different types
    const offerA = await db.offer.create({
      data: {
        title: "Offer A - Fitness",
        type: "special",
        specialPrice: 500,
        expiresAt: new Date("2026-12-31"),
        isActive: true,
        discount: 0,
        maxSubscribers: 50,
        currentSubscribers: 0,
        showOnHome: false,
        showMaxSubscribers: true,
        showCurrentSubscribers: true,
        allowedClassTypes: {
          create: [{ classType: "fitness" }],
        },
      },
    });

    const offerB = await db.offer.create({
      data: {
        title: "Offer B - Dance",
        type: "special",
        specialPrice: 600,
        expiresAt: new Date("2026-12-31"),
        isActive: true,
        discount: 0,
        maxSubscribers: 50,
        currentSubscribers: 0,
        showOnHome: false,
        showMaxSubscribers: true,
        showCurrentSubscribers: true,
        allowedClassTypes: {
          create: [{ classType: "oriental_dance" }],
        },
      },
    });

    // Fetch offer A
    const requestA = new Request(
      `http://localhost:3000/api/public?lang=ar&offerId=${offerA.id}`
    );
    const responseA = await GET(requestA);
    const dataA = await responseA.json();
    const classesA = dataA.classes as Array<{ id: string; type: string }>;

    // Fetch offer B
    const requestB = new Request(
      `http://localhost:3000/api/public?lang=ar&offerId=${offerB.id}`
    );
    const responseB = await GET(requestB);
    const dataB = await responseB.json();
    const classesB = dataB.classes as Array<{ id: string; type: string }>;

    // Offer A should have fitness only
    expect(classesA.some((c) => c.type === "fitness")).toBe(true);
    expect(classesA.some((c) => c.type === "oriental_dance")).toBe(false);

    // Offer B should have dance only
    expect(classesB.some((c) => c.type === "oriental_dance")).toBe(true);
    expect(classesB.some((c) => c.type === "fitness")).toBe(false);

    // Cleanup
    await db.offerAllowedClassType.deleteMany({
      where: { offerId: { in: [offerA.id, offerB.id] } },
    });
    await db.offer.deleteMany({
      where: { id: { in: [offerA.id, offerB.id] } },
    });
  });
});
