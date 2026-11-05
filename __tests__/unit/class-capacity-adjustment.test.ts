import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  capacity: 15,
  available: 15,
  sql: [] as string[],
  query: vi.fn(),
  updateMany: vi.fn(),
  classUpdate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: async (
      fn: (tx: unknown) => Promise<unknown>,
    ) => fn({
      $queryRaw: m.query,
      schedule: { updateMany: m.updateMany },
      class: { update: m.classUpdate },
    }),
  },
}));

import {
  updateClassWithCapacityAdjustment,
} from "@/lib/class-capacity-adjustment";

function resize(maxSpots: number) {
  return updateClassWithCapacityAdjustment({
    classId: "test-class",
    maxSpots,
    data: { maxSpots },
  });
}

describe("Class capacity delta regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.capacity = 15;
    m.available = 15;
    m.sql = [];

    m.query.mockImplementation(async (
      strings: TemplateStringsArray,
    ) => {
      const sql = strings.join("?");
      m.sql.push(sql);

      if (sql.includes("GET_LOCK")) {
        return [{ acquired: 1 }];
      }
      if (sql.includes("RELEASE_LOCK")) {
        return [{ released: 1 }];
      }
      if (sql.includes("FROM `Class`")) {
        return [{
          id: "test-class",
          maxSpots: m.capacity,
        }];
      }
      if (sql.includes("FROM Schedule")) {
        return [{
          id: "future-schedule",
          availableSpots: m.available,
        }];
      }
      throw new Error("Unexpected SQL query");
    });

    m.updateMany.mockImplementation(async (
      args: {
        data: {
          availableSpots: { increment: number };
        };
      },
    ) => {
      m.available += args.data.availableSpots.increment;
      return { count: 1 };
    });

    m.classUpdate.mockImplementation(async (
      args: { data: { maxSpots: number } },
    ) => {
      m.capacity = args.data.maxSpots;
      return { id: "test-class" };
    });
  });

  it("15 capacity, zero occupied -> 20 capacity, zero occupied", async () => {
    await resize(20);
    expect(m.capacity).toBe(20);
    expect(m.available).toBe(20);
    expect(m.capacity - m.available).toBe(0);
  });

  it("15 capacity, five occupied -> 20 capacity, five occupied", async () => {
    m.available = 10;
    await resize(20);
    expect(m.capacity).toBe(20);
    expect(m.available).toBe(15);
    expect(m.capacity - m.available).toBe(5);
  });

  it("capacity reduction preserves occupied count", async () => {
    m.available = 10;
    await resize(12);
    expect(m.capacity).toBe(12);
    expect(m.available).toBe(7);
    expect(m.capacity - m.available).toBe(5);
  });

  it("rejects reduction below occupied count", async () => {
    m.available = 2;
    await expect(resize(10)).rejects.toThrow();
    expect(m.capacity).toBe(15);
    expect(m.available).toBe(2);
    expect(m.updateMany).not.toHaveBeenCalled();
  });

  it("rejects invalid capacity without database writes", async () => {
    await expect(resize(0)).rejects.toThrow();
    await expect(resize(1.5)).rejects.toThrow();
    expect(m.updateMany).not.toHaveBeenCalled();
    expect(m.classUpdate).not.toHaveBeenCalled();
  });

  it("uses database locks and future-only schedule selection", async () => {
    await resize(20);

    expect(m.sql.some(x => x.includes("GET_LOCK"))).toBe(true);
    expect(m.sql.some(x =>
      x.includes("FROM `Class`") &&
      x.includes("FOR UPDATE")
    )).toBe(true);
    expect(m.sql.some(x =>
      x.includes("FROM Schedule") &&
      x.includes("date >= ") &&
      x.includes("FOR UPDATE")
    )).toBe(true);
    expect(m.sql.some(x => x.includes("RELEASE_LOCK"))).toBe(true);
  });
});
