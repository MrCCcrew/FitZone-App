import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentAppUser: vi.fn(),
  findSchedule: vi.fn(),
  findExistingBooking: vi.fn(),
  findMemberships: vi.fn(),
  countBookings: vi.fn(),
  createBooking: vi.fn(),
  updateSchedule: vi.fn(),
  createNotification: vi.fn(),
  resolveEligibility: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({ getCurrentAppUser: mocks.getCurrentAppUser }));
vi.mock("@/lib/db", () => ({
  db: {
    schedule: { findUnique: mocks.findSchedule, update: mocks.updateSchedule },
    booking: {
      findFirst: mocks.findExistingBooking,
      count: mocks.countBookings,
      create: mocks.createBooking,
    },
    userMembership: { findMany: mocks.findMemberships },
    notification: { create: mocks.createNotification },
  },
}));
vi.mock("@/lib/membership-class-eligibility", () => ({
  resolveMembershipClassEligibility: mocks.resolveEligibility,
}));

import { POST } from "@/app/api/bookings/route";

const classId = "class-yoga";
const classRecord = { id: classId, name: "Yoga", type: "yoga", price: 120 };
const schedule = {
  id: "schedule-1",
  isActive: true,
  availableSpots: 4,
  class: classRecord,
  time: "10:00",
  date: new Date("2030-01-01T00:00:00.000Z"),
};

function membership(id: string, status = "active", classSessions: string | null = JSON.stringify([{ classId }])) {
  return {
    id,
    status,
    startDate: new Date("2020-01-01T00:00:00.000Z"),
    endDate: new Date("2031-01-01T00:00:00.000Z"),
    totalSessions: null,
    allowedClassTypesSnapshot: null,
    membership: { classSessions },
  };
}

function request() {
  return new Request("http://localhost/api/bookings", {
    method: "POST",
    body: JSON.stringify({ scheduleId: schedule.id }),
  });
}

function eligible(overrides: Partial<{ unrestricted: boolean; allowedClassIds: string[]; eligibleMembershipIds: string[] }> = {}) {
  return {
    hasEligibleMembership: true,
    unrestricted: false,
    allowedClassIds: [classId],
    eligibleMembershipIds: ["membership-1"],
    ...overrides,
  };
}

describe("POST /api/bookings membership eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentAppUser.mockResolvedValue({ id: "user-1" });
    mocks.findSchedule.mockResolvedValue(schedule);
    mocks.findExistingBooking.mockResolvedValue(null);
    mocks.findMemberships.mockResolvedValue([membership("membership-1")]);
    mocks.countBookings.mockResolvedValue(0);
    mocks.createBooking.mockResolvedValue({ id: "booking-1" });
    mocks.updateSchedule.mockResolvedValue({});
    mocks.createNotification.mockResolvedValue({});
    mocks.resolveEligibility.mockResolvedValue(eligible());
  });

  it("allows a class included by a restricted membership", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.resolveEligibility).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      classes: [classRecord],
      memberships: [expect.objectContaining({ id: "membership-1" })],
    }));
    expect(mocks.createBooking).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userMembershipId: "membership-1" }),
    }));
  });

  it("rejects a class outside restricted membership classes", async () => {
    mocks.resolveEligibility.mockResolvedValue(eligible({ allowedClassIds: ["class-boxing"] }));

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("CLASS_NOT_INCLUDED_IN_MEMBERSHIP");
    expect(mocks.createBooking).not.toHaveBeenCalled();
  });

  it("uses the second active membership when it is the one that includes the class", async () => {
    const first = membership("membership-first", "active", JSON.stringify([{ classId: "class-boxing" }]));
    const second = membership("membership-second");
    mocks.findMemberships.mockResolvedValue([first, second]);
    mocks.resolveEligibility.mockResolvedValue(eligible({ eligibleMembershipIds: [first.id, second.id] }));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.createBooking).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userMembershipId: second.id }),
    }));
  });

  it("uses an unrestricted membership rather than an earlier restricted non-matching membership", async () => {
    const restricted = membership("membership-restricted", "active", JSON.stringify([{ classId: "class-boxing" }]));
    const unrestricted = membership("membership-unrestricted", "active", null);
    mocks.findMemberships.mockResolvedValue([restricted, unrestricted]);
    mocks.resolveEligibility.mockResolvedValue(eligible({
      unrestricted: true,
      allowedClassIds: [],
      eligibleMembershipIds: [restricted.id, unrestricted.id],
    }));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.createBooking).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userMembershipId: unrestricted.id }),
    }));
  });

  it.each(["pending_payment", "expired", "cancelled"])("does not allow a %s membership to grant a booking", async () => {
    mocks.findMemberships.mockResolvedValue([]);
    mocks.resolveEligibility.mockResolvedValue({
      hasEligibleMembership: false,
      unrestricted: false,
      allowedClassIds: [],
      eligibleMembershipIds: [],
    });

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("NO_ELIGIBLE_MEMBERSHIP");
    expect(mocks.createBooking).not.toHaveBeenCalled();
  });
});
