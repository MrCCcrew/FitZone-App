import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentAppUser: vi.fn(),
  isBookingOperational: vi.fn(),
  findBooking: vi.fn(),
  findSchedule: vi.fn(),
  findMemberships: vi.fn(),
  updateBooking: vi.fn(),
  updateBookingMany: vi.fn(),
  updateSchedule: vi.fn(),
  updateRescheduleRequestMany: vi.fn(),
  createNotification: vi.fn(),
  findPendingRescheduleRequest: vi.fn(),
  createRescheduleRequest: vi.fn(),
  transaction: vi.fn(),
  findAdmins: vi.fn(),
  findUser: vi.fn(),
  resolveEligibility: vi.fn(),
  canBookClass: vi.fn(),
  findHealthResponses: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({ getCurrentAppUser: mocks.getCurrentAppUser }));
vi.mock("@/lib/booking-operational", () => ({ isBookingOperational: mocks.isBookingOperational }));
vi.mock("@/lib/db", () => ({
  db: {
    booking: {
      findFirst: mocks.findBooking,
      update: mocks.updateBooking,
      updateMany: mocks.updateBookingMany,
    },
    schedule: { findUnique: mocks.findSchedule, update: mocks.updateSchedule },
    userMembership: { findMany: mocks.findMemberships },
    notification: { create: mocks.createNotification },
    user: { findMany: mocks.findAdmins, findUnique: mocks.findUser },
    healthResponse: { findMany: mocks.findHealthResponses },
    bookingRescheduleRequest: {
      findUnique: mocks.findPendingRescheduleRequest,
      create: mocks.createRescheduleRequest,
      updateMany: mocks.updateRescheduleRequestMany,
    },
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
    mocks.updateBookingMany.mockResolvedValue({ count: 1 });
    mocks.updateSchedule.mockResolvedValue({});
    mocks.updateRescheduleRequestMany.mockResolvedValue({ count: 0 });
    mocks.createNotification.mockResolvedValue({});
    mocks.transaction.mockResolvedValue([]);
    mocks.findAdmins.mockResolvedValue([]);
    mocks.findUser.mockResolvedValue({ name: "Member" });
    mocks.findPendingRescheduleRequest.mockResolvedValue(null);
    mocks.createRescheduleRequest.mockResolvedValue({ id: "request-1" });
    mocks.resolveEligibility.mockResolvedValue(eligible());
    mocks.canBookClass.mockImplementation((candidate) => candidate.id === "membership-current");
    mocks.findHealthResponses.mockResolvedValue([]);
  });

  it("keeps the current membership when it permits the new class", async () => {
    const response = await PATCH(request());

    expect(response.status).toBe(200);
    expect(mocks.resolveEligibility).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      classes: [newClass],
      memberships: [expect.objectContaining({ id: "membership-current" })],
    }));
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({
      success: true,
      pendingApproval: true,
      requestId: "request-1",
    }));
    expect(mocks.createRescheduleRequest).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        bookingId: "booking-1",
        targetScheduleId: newSchedule.id,
        status: "pending",
        pendingKey: "booking-1",
      }),
    }));
    expect(mocks.updateBooking).not.toHaveBeenCalled();
    expect(mocks.updateSchedule).not.toHaveBeenCalled();
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
    const body = await response.json();
    expect(body.pendingApproval).toBe(true);
    expect(mocks.createRescheduleRequest).toHaveBeenCalled();
    expect(mocks.updateBooking).not.toHaveBeenCalled();
    expect(mocks.updateSchedule).not.toHaveBeenCalled();
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
    const body = await response.json();
    expect(body.pendingApproval).toBe(true);
    expect(mocks.createRescheduleRequest).toHaveBeenCalled();
    expect(mocks.updateBooking).not.toHaveBeenCalled();
    expect(mocks.updateSchedule).not.toHaveBeenCalled();
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


  it("rejects creating a second pending reschedule request", async () => {
    mocks.findPendingRescheduleRequest.mockResolvedValue({
      id: "existing-request",
      targetSchedule: newSchedule,
    });

    const response = await PATCH(request());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("RESCHEDULE_ALREADY_PENDING");
    expect(mocks.createRescheduleRequest).not.toHaveBeenCalled();
    expect(mocks.updateBooking).not.toHaveBeenCalled();
    expect(mocks.updateSchedule).not.toHaveBeenCalled();
  });

  it("restores the seat only once when the same booking is cancelled concurrently", async () => {
    const cancelRequest = () =>
      new Request("http://localhost/api/bookings", {
        method: "PATCH",
        body: JSON.stringify({ bookingId: "booking-1" }),
      });

    mocks.updateBookingMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        booking: { updateMany: mocks.updateBookingMany },
        schedule: { update: mocks.updateSchedule },
        bookingRescheduleRequest: {
          updateMany: mocks.updateRescheduleRequestMany,
        },
        notification: { create: mocks.createNotification },
      }),
    );

    const responses = await Promise.all([
      PATCH(cancelRequest()),
      PATCH(cancelRequest()),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(mocks.updateBookingMany).toHaveBeenCalledTimes(2);
    expect(mocks.updateSchedule).toHaveBeenCalledTimes(1);
    expect(mocks.updateRescheduleRequestMany).toHaveBeenCalledTimes(1);
    expect(mocks.createNotification).toHaveBeenCalledTimes(1);
  });

  it("does not change membershipId when the schedule is unchanged", async () => {
    const response = await PATCH(request(oldSchedule.id));

    expect(response.status).toBe(400);
    expect(mocks.resolveEligibility).not.toHaveBeenCalled();
    expect(mocks.updateBooking).not.toHaveBeenCalled();
  });
});
