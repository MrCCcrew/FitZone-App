import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  updateClassWithCapacityAdjustment,
} from "@/lib/class-capacity-adjustment";

it("preserves five real bookings when capacity grows from 10 to 13", async () => {
  const database = await db.$queryRaw<
    Array<{ database_name: string; db_user: string }>
  >`
    SELECT DATABASE() AS database_name,
           CURRENT_USER() AS db_user
  `;

  expect(database[0]?.database_name).toBe("fitzone_test");
  expect(database[0]?.db_user.startsWith("fitzone_test_user@")).toBe(true);

  const prefix = `cap-${randomUUID()}`;
  const trainerId = `${prefix}-trainer`;
  const classId = `${prefix}-class`;
  const scheduleId = `${prefix}-schedule`;

  const users = Array.from({ length: 5 }, (_, i) => ({
    id: `${prefix}-user-${i}`,
    email: `${prefix}-user-${i}@fitzone.test`,
    name: `Capacity Test User ${i}`,
    role: "member",
  }));

  const bookingIds = users.map(
    (_, i) => `${prefix}-booking-${i}`,
  );

  const scheduleDate = new Date(Date.now() + 3 * 86400000);
  scheduleDate.setUTCHours(0, 0, 0, 0);

  try {
    await db.$transaction(async (tx) => {
      await tx.user.createMany({ data: users });

      await tx.trainer.create({
        data: {
          id: trainerId,
          name: "Capacity Regression Trainer",
          specialty: "fitness",
        },
      });

      await tx.class.create({
        data: {
          id: classId,
          name: "Capacity Regression Class",
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
          date: scheduleDate,
          time: "18:00",
          availableSpots: 5,
        },
      });

      await tx.booking.createMany({
        data: users.map((user, i) => ({
          id: bookingIds[i],
          userId: user.id,
          scheduleId,
          status: "confirmed",
        })),
      });
    });

    const readState = async () => {
      const [gymClass, schedule, bookings] = await Promise.all([
        db.class.findUniqueOrThrow({
          where: { id: classId },
        }),
        db.schedule.findUniqueOrThrow({
          where: { id: scheduleId },
        }),
        db.booking.findMany({
          where: { scheduleId },
          select: { id: true, userId: true, status: true },
          orderBy: { id: "asc" },
        }),
      ]);

      return {
        capacity: gymClass.maxSpots,
        available: schedule.availableSpots,
        bookings,
      };
    };

    const before = await readState();

    expect(before.capacity).toBe(10);
    expect(before.available).toBe(5);
    expect(before.bookings).toHaveLength(5);

    await updateClassWithCapacityAdjustment({
      classId,
      maxSpots: 13,
      data: { maxSpots: 13 },
    });

    const after = await readState();

    expect(after.capacity).toBe(13);
    expect(after.available).toBe(8);
    expect(after.bookings).toEqual(before.bookings);
    expect(after.capacity - after.available).toBe(5);

    await updateClassWithCapacityAdjustment({
      classId,
      maxSpots: 13,
      data: { maxSpots: 13 },
    });

    const repeated = await readState();

    expect(repeated).toEqual(after);

    await expect(
      updateClassWithCapacityAdjustment({
        classId,
        maxSpots: 4,
        data: { maxSpots: 4 },
      }),
    ).rejects.toThrow();

    const rejected = await readState();

    expect(rejected).toEqual(after);
  } finally {
    await db.$transaction(async (tx) => {
      await tx.booking.deleteMany({
        where: { id: { in: bookingIds } },
      });

      await tx.schedule.deleteMany({
        where: { id: scheduleId },
      });

      await tx.class.deleteMany({
        where: { id: classId },
      });

      await tx.trainer.deleteMany({
        where: { id: trainerId },
      });

      await tx.user.deleteMany({
        where: { id: { in: users.map((u) => u.id) } },
      });
    });
  }
});
