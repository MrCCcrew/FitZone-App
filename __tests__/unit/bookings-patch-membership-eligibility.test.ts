import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentAppUser: vi.fn(),
  isBookingOperational: vi.fn(),
  findBooking: vi.fn(),
  findSchedule: vi.fn(),
  findMemberships: vi.fn(),
  updateBooking: vi.fn(),
  updateSchedule: vi.fn(),
  createNotification: vi.fn(),
  transaction: vi.fn(),
  findAdmins: vi.fn(),
  findUser: vi.fn(),
  resolveEligibility: vi.fn(),
  canBookClass: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({ getCurrentAppUser: mocks.getCurrentAppUser }));
vi.mock("@/lib/booking-operational", () => ({ isBookingOperational: mocks.isBookingOperational }));
vi.mock("@/lib/db", () => ({
  db: {
    booking: { findFirst: mocks.findBooking, update: mocks.updateBooking },
    schedule: { findUnique: mocks.findSchedule, update: mocks.updateSchedule },
    userMembership: { findMany: mocks.findMemberships },
    notification: { create: mocks.createNotification },
    user: { findMany: mocks.findAdmins, findUnique: mocks.findUser },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/membership-class-eligibility", () => ({
  resolveMembershipClassEligibility: mocks.resolveEligibility,
  canMembershipBookClass: mocks.canBookClass,
}));

import { PATCH } from "@/app/api/bookings/route";

const oldClass = { id: "class-old", name: "Old", type: "old", price: 100 };
const newClass = { id: "class-new", name: "New", type: "new", price: 100 };
const oldSchedule = { id: "schedule-old", date: new Date("2030-01-02T00:00:00.000Z"), time: "10:00", class: oldClass };
const newSchedule = { id: "schedule-new", isActive: true, availableSpots: 3, date: new Date("2030-01-03T00:00:00.000Z"), time: "10:00", class: newClass };

function membership(id: string) {
  return {
    id,
    status: "active",
    startDate: new Date("2020-01-01T00:00:00.000Z"),
    endDate: new Date("2031-01-01T00:00:00.000Z"),
    totalSessions: null,
    allowedClassTypesSnapshot: null,
    membership: { classSessions: JSON.stringify([{ classId: newClass.id }]) },
  };
}

function booking(userMembershipId = "membership-current") {
  return {
    id: "booking-1",
    userId: "user-1",
    userMembershipId,
    scheduleId: oldSchedule.id,
    status: "confirmed",
    userMembership: { status: "active" },
    schedule: oldSchedule,
  };
}

function request(scheduleId = newSchedule.id) {
  return new Request("http://localhost/api/bookings", {
    method: "PATCH",
    body: JSON.stringify({ bookingId: "booking-1", scheduleId }),
  });
}

function eligible(overrides: Partial<{ unrestricted: boolean; allowedClassIds: string[]; eligibleMembershipIds: string[] }> = {}) {
  return {
    hasEligibleMembership: true,
    unrestricted: false,
    allowedClassIds: [newClass.id],
    eligibleMembershipIds: ["membership-current"],
    ...overrides,
  };
}

describe("PATCH /api/bookings membership eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentAppUser.mockResolvedValue({ id: "user-1" });
    mocks.isBookingOperational.mockReturnValue(true);
    mocks.findBooking.mockResolvedValue(booking());
    mocks.findSchedule.mockResolvedValue(newSchedule);
    mocks.findMemberships.mockResolvedValue([membership("membership-current")]);
    mocks.updateBooking.mockResolvedValue({});
    mocks.updateSchedule.mockResolvedValue({});
    mocks.createNotification.mockResolvedValue({});
    mocks.transaction.mockResolvedValue([]);
    mocks.findAdmins.mockResolvedValue([]);
    mocks.findUser.mockResolvedValue({ name: "Member" });
    mocks.resolveEligibility.mockResolvedValue(eligible());
    mocks.canBookClass.mockImplementation((candidate) => candidate.id === "membership-current");
  });

  it("keeps the current membership when it permits the new class", async () => {
    const response = await PATCH(request());

    expect(response.status).toBe(200);
    expect(mocks.resolveEligibility).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      classes: [newClass],
      memberships: [expect.objectContaining({ id: "membership-current" })],
    }));
    expect(mocks.updateBooking).toHaveBeenCalledWith(expect.objectContaining({
      data: { scheduleId: newSchedule.id, userMembershipId: "membership-current" },
    }));
  });

  it("rejects a class not included in restricted memberships", async () => {
    mocks.resolveEligibility.mockResolvedValue(eligible({ allowedClassIds: ["class-other"] }));

    const response = await PATCH(request());

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("CLASS_NOT_INCLUDED_IN_MEMBERSHIP");
    expect(mocks.updateBooking).not.toHaveBeenCalled();
  });

  it("moves the booking to the second membership when only it permits the class", async () => {
    const current = membership("membership-current");
    const second = membership("membership-second");
    mocks.findMemberships.mockResolvedValue([current, second]);
    mocks.resolveEligibility.mockResolvedValue(eligible({ eligibleMembershipIds: [current.id, second.id] }));
    mocks.canBookClass.mockImplementation((candidate) => candidate.id === second.id);

    const response = await PATCH(request());

    expect(response.status).toBe(200);
    expect(mocks.updateBooking).toHaveBeenCalledWith(expect.objectContaining({
      data: { scheduleId: newSchedule.id, userMembershipId: second.id },
    }));
  });

  it("uses an unrestricted membership when it is the eligible membership", async () => {
    const restricted = membership("membership-current");
    const unrestricted = membership("membership-unrestricted");
    mocks.findMemberships.mockResolvedValue([restricted, unrestricted]);
    mocks.resolveEligibility.mockResolvedValue(eligible({
      unrestricted: true,
      allowedClassIds: [],
      eligibleMembershipIds: [restricted.id, unrestricted.id],
    }));
    mocks.canBookClass.mockImplementation((candidate) => candidate.id === unrestricted.id);

    const response = await PATCH(request());

    expect(response.status).toBe(200);
    expect(mocks.updateBooking).toHaveBeenCalledWith(expect.objectContaining({
      data: { scheduleId: newSchedule.id, userMembershipId: unrestricted.id },
    }));
  });

  it.each(["pending_payment", "expired", "cancelled"])("does not let a %s membership grant eligibility", async () => {
    mocks.findMemberships.mockResolvedValue([]);
    mocks.resolveEligibility.mockResolvedValue({
      hasEligibleMembership: false,
      unrestricted: false,
      allowedClassIds: [],
      eligibleMembershipIds: [],
    });

    const response = await PATCH(request());

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("NO_ELIGIBLE_MEMBERSHIP");
    expect(mocks.updateBooking).not.toHaveBeenCalled();
  });

  it("does not change membershipId when the schedule is unchanged", async () => {
    const response = await PATCH(request(oldSchedule.id));

    expect(response.status).toBe(400);
    expect(mocks.resolveEligibility).not.toHaveBeenCalled();
    expect(mocks.updateBooking).not.toHaveBeenCalled();
  });
});
