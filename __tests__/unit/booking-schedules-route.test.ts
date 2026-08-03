import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentAppUser: vi.fn(),
  findMemberships: vi.fn(),
  findClasses: vi.fn(),
  findBookings: vi.fn(),
  resolveEligibility: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({ getCurrentAppUser: mocks.getCurrentAppUser }));
vi.mock("@/lib/db", () => ({
  db: {
    userMembership: { findMany: mocks.findMemberships },
    class: { findMany: mocks.findClasses },
    booking: { findMany: mocks.findBookings },
  },
}));
vi.mock("@/lib/membership-class-eligibility", () => ({
  resolveMembershipClassEligibility: mocks.resolveEligibility,
}));

import { GET } from "@/app/api/me/booking-schedules/route";
import { GET as getBookings } from "@/app/api/me/bookings/route";

function gymClass(id: string, availableSpots = 3) {
  return {
    id,
    name: id,
    type: id,
    subType: null,
    showTrainerName: true,
    trainer: { name: "Trainer" },
    schedules: [{
      id: "schedule-" + id,
      date: new Date("2030-01-01T00:00:00.000Z"),
      time: "10:00",
      availableSpots,
    }],
  };
}

function membership(id: string) {
  return {
    id,
    status: "active",
    startDate: new Date("2020-01-01T00:00:00.000Z"),
    endDate: new Date("2031-01-01T00:00:00.000Z"),
    allowedClassTypesSnapshot: null,
    membership: { classSessions: JSON.stringify([{ classId: "yoga" }]) },
  };
}

function eligibility(overrides: Partial<{ hasEligibleMembership: boolean; unrestricted: boolean; allowedClassIds: string[]; eligibleMembershipIds: string[] }> = {}) {
  return {
    hasEligibleMembership: true,
    unrestricted: false,
    allowedClassIds: ["yoga"],
    eligibleMembershipIds: ["membership-1"],
    ...overrides,
  };
}

describe("GET /api/me/booking-schedules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentAppUser.mockResolvedValue({ id: "user-1" });
    mocks.findMemberships.mockResolvedValue([membership("membership-1")]);
    mocks.findClasses.mockResolvedValue([gymClass("yoga"), gymClass("boxing"), gymClass("dance")]);
    mocks.findBookings.mockResolvedValue([]);
    mocks.resolveEligibility.mockResolvedValue(eligibility());
  });

  it("returns only classes included by a restricted membership", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.schedules.map((schedule: { classId: string }) => schedule.classId)).toEqual(["yoga"]);
  });

  it("returns the union allowed by two active memberships", async () => {
    const first = membership("membership-1");
    const second = membership("membership-2");
    mocks.findMemberships.mockResolvedValue([first, second]);
    mocks.resolveEligibility.mockResolvedValue(eligibility({
      allowedClassIds: ["yoga", "boxing"],
      eligibleMembershipIds: [first.id, second.id],
    }));

    const body = await (await GET()).json();

    expect(body.schedules.map((schedule: { classId: string }) => schedule.classId)).toEqual(["yoga", "boxing"]);
    expect(mocks.resolveEligibility).toHaveBeenCalledWith(expect.objectContaining({
      memberships: [first, second],
    }));
  });

  it("keeps every previously visible class for an unrestricted membership", async () => {
    mocks.resolveEligibility.mockResolvedValue(eligibility({ unrestricted: true, allowedClassIds: [] }));

    const body = await (await GET()).json();

    expect(body.schedules.map((schedule: { classId: string }) => schedule.classId)).toEqual(["yoga", "boxing", "dance"]);
  });

  it.each(["pending_payment", "expired", "cancelled"])("does not return bookable schedules for %s-only memberships", async () => {
    mocks.findMemberships.mockResolvedValue([]);
    mocks.resolveEligibility.mockResolvedValue(eligibility({
      hasEligibleMembership: false,
      unrestricted: false,
      allowedClassIds: [],
      eligibleMembershipIds: [],
    }));

    const body = await (await GET()).json();

    expect(body.schedules).toEqual([]);
  });

  it("preserves the existing full-slot behavior without making a full schedule selectable", async () => {
    mocks.findClasses.mockResolvedValue([gymClass("yoga", 0)]);

    const body = await (await GET()).json();

    expect(body.schedules).toEqual([expect.objectContaining({ classId: "yoga", availableSpots: 0 })]);
  });

  it("relies on the server catalog query to exclude inactive classes and schedules", async () => {
    await GET();

    expect(mocks.findClasses).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ isActive: true }),
      include: expect.objectContaining({
        schedules: expect.objectContaining({ where: expect.objectContaining({ isActive: true }) }),
      }),
    }));
  });

  it("does not filter historical bookings when a class is no longer eligible for new bookings", async () => {
    mocks.findBookings.mockResolvedValue([{
      id: "historic-booking",
      scheduleId: "schedule-removed-class",
      status: "attended",
      schedule: {
        classId: "removed-class",
        date: new Date("2020-01-01T00:00:00.000Z"),
        time: "10:00",
        class: { name: "Removed class", type: "yoga", trainer: { name: "Trainer" } },
      },
    }]);

    const body = await (await getBookings()).json();

    expect(body).toEqual([expect.objectContaining({ id: "historic-booking", classId: "removed-class" })]);
  });
});
