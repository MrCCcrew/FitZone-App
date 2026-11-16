import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  classFindMany: vi.fn(),
  trainerFindMany: vi.fn(),
  contentFindMany: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: vi.fn(async () => ({
    role: "admin",
    session: { user: { id: "test-admin" } },
  })),
}));

vi.mock("@/lib/db", () => ({
  db: {
    class: { findMany: mocks.classFindMany },
    trainer: { findMany: mocks.trainerFindMany },
    siteContent: { findMany: mocks.contentFindMany },
  },
}));

import { GET } from "@/app/api/admin/classes/route";

describe("R19 class capacity administration display", () => {
  it("excludes historical availability when showing current occupancy", async () => {
    vi.clearAllMocks();

    const now = new Date();
    const past = new Date(now.getTime() - 10 * 86400000);
    const future = new Date(now.getTime() + 10 * 86400000);

    const schedules = [
      {
        id: "historical-slot",
        date: past,
        time: "18:00",
        availableSpots: 16,
        isActive: true,
      },
      {
        id: "future-slot",
        date: future,
        time: "18:00",
        availableSpots: 21,
        isActive: true,
      },
    ];

    mocks.classFindMany.mockImplementation(async (args) => {
      const dateAnchor = args.include.schedules.where.date?.gte;

      const selected = schedules
        .filter((s) => !dateAnchor || s.date >= dateAnchor)
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .slice(0, args.include.schedules.take);

      return [{
        id: "test-class",
        name: "Test Class",
        trainerId: "trainer-one",
        trainer: { id: "trainer-one", name: "Trainer" },
        maxSpots: 25,
        schedules: selected,
        isActive: true,
      }];
    });

    mocks.trainerFindMany.mockResolvedValue([]);
    mocks.contentFindMany.mockResolvedValue([]);

    const response = await GET();
    expect(response).toBeDefined();
    if (!response) throw new Error("ADMIN_CLASSES_GET_NO_RESPONSE");
    expect(response.status).toBe(200);

    const data = await response.json();
    const gymClass = data.classes?.find(
      (item: { id: string }) => item.id === "test-class",
    );

    expect(gymClass).toBeDefined();
    expect(gymClass.capacity).toBe(25);
    expect(gymClass.enrolled).toBe(4);

    const query = mocks.classFindMany.mock.calls[0][0];
    expect(query.include.schedules.where.isActive).toBe(true);
    expect(query.include.schedules.where.date.gte).toBeInstanceOf(Date);
  });
});