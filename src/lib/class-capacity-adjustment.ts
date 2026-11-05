import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { cairoCalendarDateKey } from "@/lib/fitzone-time";

export class ClassCapacityError extends Error {
  constructor(
    message: string,
    public readonly status: number = 409,
  ) {
    super(message);
    this.name = "ClassCapacityError";
  }
}

export async function updateClassWithCapacityAdjustment(input: {
  classId: string;
  maxSpots: number;
  data: Record<string, unknown>;
}): Promise<void> {
  if (
    !Number.isSafeInteger(input.maxSpots) ||
    input.maxSpots < 1 ||
    input.maxSpots > 1000
  ) {
    throw new ClassCapacityError("سعة الكلاس غير صالحة.", 400);
  }

  const dateAnchor = new Date(
    `${cairoCalendarDateKey(new Date())}T00:00:00.000Z`,
  );
  const lockName = `fitzone:schedule:${input.classId}`;

  await db.$transaction(async (tx) => {
    const lockRows = await tx.$queryRaw<
      Array<{ acquired: number | bigint | null }>
    >`SELECT GET_LOCK(${lockName}, 10) AS acquired`;

    if (Number(lockRows[0]?.acquired ?? 0) !== 1) {
      throw new ClassCapacityError(
        "تعذر تأمين تعديل سعة الكلاس. حاولي مرة أخرى.",
      );
    }

    try {
      const current = await tx.$queryRaw<
        Array<{ id: string; maxSpots: number }>
      >`
        SELECT id, maxSpots
        FROM \`Class\`
        WHERE id = ${input.classId}
        FOR UPDATE
      `;

      if (current.length !== 1) {
        throw new ClassCapacityError("الكلاس غير موجود.", 404);
      }

      const previousCapacity = Number(current[0].maxSpots);
      const difference = input.maxSpots - previousCapacity;

      if (!Number.isSafeInteger(previousCapacity) ||
          previousCapacity < 1) {
        throw new ClassCapacityError(
          "سعة الكلاس الحالية تحتاج مراجعة.",
        );
      }

      if (difference !== 0) {
        const schedules = await tx.$queryRaw<
          Array<{ id: string; availableSpots: number }>
        >`
          SELECT id, availableSpots
          FROM Schedule
          WHERE classId = ${input.classId}
            AND date >= ${dateAnchor}
          FOR UPDATE
        `;

        for (const schedule of schedules) {
          const nextAvailable =
            Number(schedule.availableSpots) + difference;

          if (
            !Number.isSafeInteger(nextAvailable) ||
            nextAvailable < 0 ||
            nextAvailable > input.maxSpots
          ) {
            throw new ClassCapacityError(
              "تعذر تعديل السعة دون التأثير على الحجوزات الحالية. يلزم مراجعة الأماكن المتاحة.",
            );
          }
        }

        const changed = await tx.schedule.updateMany({
          where: {
            classId: input.classId,
            date: { gte: dateAnchor },
          },
          data: {
            availableSpots: { increment: difference },
          },
        });

        if (changed.count !== schedules.length) {
          throw new ClassCapacityError(
            "تغيرت الجداول أثناء تعديل السعة. أعيدي المحاولة.",
          );
        }
      }

      await tx.class.update({
        where: { id: input.classId },
        data: input.data as Prisma.ClassUncheckedUpdateInput,
      });
    } finally {
      await tx.$queryRaw`
        SELECT RELEASE_LOCK(${lockName})
      `.catch(() => null);
    }
  }, { timeout: 20000 });
}
