/**
 * Integration Test: Class Transfer Feature
 *
 * Tests the complete flow of transferring classes between trainers
 * with bookings and schedules.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";

describe("Class Transfer Integration", () => {
  let testTrainer1: { id: string; name: string };
  let testTrainer2: { id: string; name: string };
  let testTrainer3: { id: string; name: string };
  let testUser: { id: string; name: string };
  let testClass1: { id: string; name: string; trainerId: string };
  let testClass2: { id: string; name: string; trainerId: string };

  beforeEach(async () => {
    // Create test trainers
    testTrainer1 = await db.trainer.create({
      data: {
        name: "Test Trainer 1",
        specialty: "Zumba",
        userId: "user_test_trainer_1",
      },
      select: { id: true, name: true },
    });

    testTrainer2 = await db.trainer.create({
      data: {
        name: "Test Trainer 2",
        specialty: "Fitness",
        userId: "user_test_trainer_2",
      },
      select: { id: true, name: true },
    });

    testTrainer3 = await db.trainer.create({
      data: {
        name: "Test Trainer 3",
        specialty: "Yoga",
        userId: "user_test_trainer_3",
      },
      select: { id: true, name: true },
    });

    // Create test user for bookings
    const createdUser = await db.user.create({
      data: {
        email: `test_${Date.now()}@test.com`,
        name: "Test Client",
      },
      select: { id: true, name: true },
    });
    testUser = { id: createdUser.id, name: createdUser.name ?? "Test Client" };

    // Create test classes
    testClass1 = await db.class.create({
      data: {
        name: "Test Class 1",
        trainerId: testTrainer1.id,
        type: "strength",
        duration: 60,
        intensity: "medium",
        maxSpots: 15,
        price: 0,
      },
      select: { id: true, name: true, trainerId: true },
    });

    testClass2 = await db.class.create({
      data: {
        name: "Test Class 2",
        trainerId: testTrainer1.id,
        type: "cardio",
        duration: 60,
        intensity: "high",
        maxSpots: 20,
        price: 0,
      },
      select: { id: true, name: true, trainerId: true },
    });
  });

  afterEach(async () => {
    // Cleanup in reverse order
    await db.booking.deleteMany({
      where: { userId: testUser.id },
    });
    await db.schedule.deleteMany({
      where: {
        classId: { in: [testClass1.id, testClass2.id] },
      },
    });
    await db.class.deleteMany({
      where: { id: { in: [testClass1.id, testClass2.id] } },
    });
    await db.trainer.deleteMany({
      where: {
        id: { in: [testTrainer1.id, testTrainer2.id, testTrainer3.id] },
      },
    });
    await db.user.deleteMany({
      where: { id: testUser.id },
    });
  });

  it("should transfer class with bookings to new trainer", async () => {
    // Create schedule and booking
    const schedule = await db.schedule.create({
      data: {
        classId: testClass1.id,
        date: new Date("2026-07-27"),
        time: "18:00",
        availableSpots: 15,
      },
    });

    const booking = await db.booking.create({
      data: {
        userId: testUser.id,
        scheduleId: schedule.id,
        status: "confirmed",
      },
    });

    // Verify initial state
    const initialClass = await db.class.findUnique({
      where: { id: testClass1.id },
      include: {
        trainer: true,
        schedules: {
          include: {
            bookings: {
              include: { user: true },
            },
          },
        },
      },
    });

    expect(initialClass?.trainerId).toBe(testTrainer1.id);
    expect(initialClass?.trainer.name).toBe("Test Trainer 1");
    expect(initialClass?.schedules[0].bookings[0].user.name).toBe("Test Client");

    // Transfer class
    await db.class.update({
      where: { id: testClass1.id },
      data: { trainerId: testTrainer2.id },
    });

    // Verify after transfer
    const transferredClass = await db.class.findUnique({
      where: { id: testClass1.id },
      include: {
        trainer: true,
        schedules: {
          include: {
            bookings: {
              include: { user: true },
            },
          },
        },
      },
    });

    // Class trainer changed
    expect(transferredClass?.trainerId).toBe(testTrainer2.id);
    expect(transferredClass?.trainer.name).toBe("Test Trainer 2");

    // Bookings stayed intact
    expect(transferredClass?.schedules.length).toBe(1);
    expect(transferredClass?.schedules[0].bookings.length).toBe(1);
    expect(transferredClass?.schedules[0].bookings[0].user.name).toBe("Test Client");

    // Verify booking-schedule-class-trainer chain
    const verifyBooking = await db.booking.findUnique({
      where: { id: booking.id },
      include: {
        schedule: {
          include: {
            class: {
              include: { trainer: true },
            },
          },
        },
      },
    });

    expect(verifyBooking?.schedule.class.trainer.name).toBe("Test Trainer 2");
  });

  it("should distribute classes evenly across multiple trainers", async () => {
    // Create 6 classes for trainer 1
    const classes = await Promise.all([
      testClass1,
      testClass2,
      ...(await Promise.all(
        Array.from({ length: 4 }, (_, i) =>
          db.class.create({
            data: {
              name: `Test Class ${i + 3}`,
              trainerId: testTrainer1.id,
              type: "strength",
              duration: 60,
              intensity: "medium",
              maxSpots: 15,
              price: 0,
            },
            select: { id: true },
          })
        )
      )),
    ]);

    const classIds = classes.map((c) => c.id);
    const targetTrainers = [testTrainer2.id, testTrainer3.id];

    // Distribute evenly
    const classesPerTrainer = Math.ceil(classIds.length / targetTrainers.length);

    for (let i = 0; i < targetTrainers.length; i++) {
      const start = i * classesPerTrainer;
      const end = Math.min(start + classesPerTrainer, classIds.length);
      const batch = classIds.slice(start, end);

      if (batch.length > 0) {
        await db.class.updateMany({
          where: { id: { in: batch } },
          data: { trainerId: targetTrainers[i] },
        });
      }
    }

    // Verify distribution
    const trainer2Classes = await db.class.count({
      where: { trainerId: testTrainer2.id },
    });

    const trainer3Classes = await db.class.count({
      where: { trainerId: testTrainer3.id },
    });

    expect(trainer2Classes).toBe(3); // 6 / 2 = 3
    expect(trainer3Classes).toBe(3);

    // Cleanup extra classes
    await db.class.deleteMany({
      where: {
        id: { in: classIds.slice(2) },
      },
    });
  });

  it("should preserve schedule integrity after transfer", async () => {
    // Create multiple schedules
    const schedules = await Promise.all([
      db.schedule.create({
        data: {
          classId: testClass1.id,
          date: new Date("2026-07-27"),
          time: "18:00",
          availableSpots: 15,
        },
      }),
      db.schedule.create({
        data: {
          classId: testClass1.id,
          date: new Date("2026-08-03"),
          time: "18:00",
          availableSpots: 15,
        },
      }),
    ]);

    // Transfer class
    await db.class.update({
      where: { id: testClass1.id },
      data: { trainerId: testTrainer2.id },
    });

    // Verify all schedules still linked
    const verifySchedules = await db.schedule.findMany({
      where: { classId: testClass1.id },
      include: {
        class: {
          include: { trainer: true },
        },
      },
    });

    expect(verifySchedules.length).toBe(2);
    verifySchedules.forEach((schedule) => {
      expect(schedule.class.trainerId).toBe(testTrainer2.id);
      expect(schedule.class.trainer.name).toBe("Test Trainer 2");
    });
  });

  it("should handle transfer of class with no bookings", async () => {
    // Transfer class without any schedules/bookings
    await db.class.update({
      where: { id: testClass1.id },
      data: { trainerId: testTrainer2.id },
    });

    const transferredClass = await db.class.findUnique({
      where: { id: testClass1.id },
      include: { trainer: true },
    });

    expect(transferredClass?.trainerId).toBe(testTrainer2.id);
    expect(transferredClass?.trainer.name).toBe("Test Trainer 2");
  });

  it("should maintain data integrity in concurrent transfers", async () => {
    // Simulate concurrent transfers (different classes)
    await Promise.all([
      db.class.update({
        where: { id: testClass1.id },
        data: { trainerId: testTrainer2.id },
      }),
      db.class.update({
        where: { id: testClass2.id },
        data: { trainerId: testTrainer3.id },
      }),
    ]);

    const [class1, class2] = await Promise.all([
      db.class.findUnique({
        where: { id: testClass1.id },
        select: { trainerId: true },
      }),
      db.class.findUnique({
        where: { id: testClass2.id },
        select: { trainerId: true },
      }),
    ]);

    expect(class1?.trainerId).toBe(testTrainer2.id);
    expect(class2?.trainerId).toBe(testTrainer3.id);
  });
});
