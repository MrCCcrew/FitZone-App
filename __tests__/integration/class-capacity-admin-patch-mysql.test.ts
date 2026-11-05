import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: vi.fn(async () => ({
    role: "admin",
    userId: "capacity-test-admin",
  })),
}));

import { db } from "@/lib/db";
import { PATCH, GET } from "@/app/api/admin/classes/route";
import { DAYS_AR } from "@/lib/schedule-maintenance";

it("preserves booked capacity through admin PATCH and GET", async () => {
  const identity = await db.$queryRaw<
    Array<{ database_name: string; db_user: string }>
  >`
    SELECT DATABASE() AS database_name,
           CURRENT_USER() AS db_user
  `;

  expect(identity[0]?.database_name).toBe("fitzone_test");
  expect(
    identity[0]?.db_user.startsWith("fitzone_test_user@"),
  ).toBe(true);

  const prefix = `capapi-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const trainerId = `${prefix}-trainer`;
  const classId = `${prefix}-class`;
  const scheduleId = `${prefix}-schedule`;

  const users = Array.from({ length: 5 }, (_, i) => ({
    id: `${prefix}-user-${i}`,
    email: `${prefix}-${i}@fitzone.test`,
    name: `Capacity API Test ${i}`,
    role: "member",
  }));

  const date = new Date(Date.now() + 3 * 86400000);
  date.setUTCHours(0, 0, 0, 0);

  const day = DAYS_AR[date.getUTCDay()];
  const time = "18:00";

  try {
    await db.$transaction(async (tx) => {
      await tx.user.createMany({ data: users });

      await tx.trainer.create({
        data: {
          id: trainerId,
          name: "Capacity API Test Trainer",
          specialty: "fitness",
        },
      });

      await tx.class.create({
        data: {
          id: classId,
          name: "Capacity API Test Class",
          trainerId,
          type: "fitness",
          duration: 60,
          intensity: "medium",
          maxSpots: 10,
        },
      });

      await tx.schedule.create({
        data: {
          id: scheduleId,
          classId,
          date,
          time,
          availableSpots: 5,
        },
      });

      await tx.booking.createMany({
        data: users.map((user, i) => ({
          id: `${prefix}-booking-${i}`,
          userId: user.id,
          scheduleId,
          status: "confirmed",
        })),
      });
    });

    const before = await db.booking.findMany({
      where: { scheduleId },
      select: {
        id: true,
        userId: true,
        status: true,
      },
      orderBy: { id: "asc" },
    });

    expect(before).toHaveLength(5);

    const response = await PATCH(
      new Request("http://localhost/api/admin/classes", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: classId,
          maxSpots: 13,
          day,
          time,
          name: "Capacity API Test Class",
          trainerId,
          duration: 60,
          active: true,
          showTrainerName: true,
        }),
      }),
    );

    if (!response) {
      throw new Error("PATCH /api/admin/classes returned no response");
    }

    const patchResult = await response.json();

    expect(response.status, JSON.stringify(patchResult)).toBe(200);
    expect(patchResult.success).toBe(true);

    const [gymClass, schedule, after] = await Promise.all([
      db.class.findUniqueOrThrow({
        where: { id: classId },
      }),
      db.schedule.findUniqueOrThrow({
        where: { id: scheduleId },
      }),
      db.booking.findMany({
        where: { scheduleId },
        select: {
          id: true,
          userId: true,
          status: true,
        },
        orderBy: { id: "asc" },
      }),
    ]);

    expect(gymClass.maxSpots).toBe(13);
    expect(schedule.availableSpots).toBe(8);
    expect(after).toEqual(before);

    const schedules = await db.schedule.findMany({
      where: { classId },
      select: {
        id: true,
        availableSpots: true,
      },
    });

    expect(schedules.length).toBeGreaterThan(0);

    for (const item of schedules) {
      expect(item.availableSpots).toBe(
        item.id === scheduleId ? 8 : 13,
      );
    }

    const getResponse = await GET();
    if (!getResponse) {
      throw new Error("GET /api/admin/classes returned no response");
    }

    const getResult = await getResponse.json();

    expect(getResponse.status).toBe(200);

    const displayedClass = getResult.classes?.find(
      (item: { id: string }) => item.id === classId,
    );

    expect(displayedClass).toBeDefined();
    expect(displayedClass.capacity).toBe(13);
    expect(displayedClass.enrolled).toBe(5);
  } finally {
    await db.$transaction(async (tx) => {
      await tx.booking.deleteMany({
        where: { scheduleId },
      });

      await tx.schedule.deleteMany({
        where: { classId },
      });

      await tx.class.deleteMany({
        where: { id: classId },
      });

      await tx.trainer.deleteMany({
        where: { id: trainerId },
      });

      await tx.user.deleteMany({
        where: {
          id: { in: users.map((user) => user.id) },
        },
      });
    });
  }
});
