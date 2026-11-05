import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ─── Mock requireAdminFeature ─────────────────────────────────────────────────

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: vi.fn(),
}));

vi.mock("@/lib/admin-authorization-server", () => ({
  requireAdminPermission: vi.fn(),
}));

vi.mock("@/lib/admin-session", () => ({
  getAdminSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    attendancePass: { findUnique: vi.fn() },
    booking: { findFirst: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    schedule: { update: vi.fn() },
    notification: { create: vi.fn().mockResolvedValue({ id: "notif1" }) },
    $transaction: vi.fn().mockImplementation(async (cb) =>
      cb({
        booking: { update: vi.fn().mockResolvedValue({ id: "b1" }) },
        attendanceCheckIn: { create: vi.fn().mockResolvedValue({ id: "check1" }), count: vi.fn().mockResolvedValue(1) },
        attendancePass: { update: vi.fn().mockResolvedValue({ id: "pass1" }) },
        userMembership: { update: vi.fn().mockResolvedValue({ id: "m1" }) },
        notification: { create: vi.fn().mockResolvedValue({ id: "notif1" }) },
      })
    ),
  },
}));

vi.mock("@/lib/attendance", () => ({
  ensureMembershipAttendancePass: vi.fn(),
  ensurePrivateAttendancePass: vi.fn(),
  extractAttendanceCode: vi.fn((val: string | undefined) => val ?? null),
  getPrivateSessionsRemaining: vi.fn(() => 5),
  isMembershipEligibleForAttendance: vi.fn(() => true),
  isPrivateApplicationEligibleForAttendance: vi.fn(() => true),
}));

vi.mock("@/lib/booking-operational", () => ({
  isBookingOperational: vi.fn(() => true),
}));

import { POST as attendancePOST } from "@/app/api/admin/attendance/route";
import { POST as bookingsPOST, PATCH as bookingsPATCH, DELETE as bookingsDELETE } from "@/app/api/admin/bookings/route";
import { db } from "@/lib/db";
import { extractAttendanceCode } from "@/lib/attendance";
import { requireAdminFeature } from "@/lib/admin-guard";
import { requireAdminPermission } from "@/lib/admin-authorization-server";
import { getAdminSession } from "@/lib/admin-session";

describe("Admin Permissions - Attendance & Bookings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRequireAdminFeature = vi.mocked(requireAdminPermission);
  const mockAdminFeatureAccess = (role: string, userId: string) => {
    if (role !== "admin") {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as Awaited<ReturnType<typeof requireAdminPermission>>;
    }
    return ({
      session: {
        id: userId,
        email: `${userId}@test.com`,
        name: userId,
        role,
        jobTitle: null,
        permissions: [],
        exp: 0,
      },
      role,
      permissions: [],
    }) as Awaited<ReturnType<typeof requireAdminPermission>>;
  };

  beforeEach(() => {
    vi.mocked(getAdminSession).mockResolvedValue({
      id: "admin1", email: "admin1@test.com", name: "admin1", role: "admin", jobTitle: null, permissions: [], exp: 0,
    });
  });

  // ─── Attendance Endpoint ────────────────────────────────────────────────────

  describe("/api/admin/attendance POST", () => {
    it("allows admin role to mark attendance", async () => {
      mockRequireAdminFeature.mockResolvedValue(mockAdminFeatureAccess("admin", "admin1"));

      vi.mocked(extractAttendanceCode).mockReturnValue("PASS123");
      vi.mocked(db.attendancePass.findUnique).mockResolvedValue({
        id: "pass1",
        userId: "user1",
        code: "PASS123",
        status: "active",
        user: { id: "user1", name: "Client", email: "client@test.com", phone: "123", isActive: true },
        userMembership: {
          id: "m1",
          status: "active",
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          membership: { name: "Basic", sessionsCount: 10 },
        },
        privateSessionApplication: null,
      } as any);

      vi.mocked(db.booking.findFirst).mockResolvedValue({
        id: "b1",
        userId: "user1",
        userMembershipId: "m1",
        scheduleId: "s1",
        status: "confirmed",
        userMembership: { status: "active" },
        schedule: {
          class: { name: "Zumba", trainer: { name: "Trainer 1" } },
          time: "18:00",
        },
      } as any);

      const req = new Request("http://localhost/api/admin/attendance", {
        method: "POST",
        body: JSON.stringify({ scanValue: "PASS123", scheduleId: "s1", mode: "class" }),
      });

      const response = (await attendancePOST(req))!;
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it("rejects non-admin with feature=bookings (403)", async () => {
      mockRequireAdminFeature.mockResolvedValue(mockAdminFeatureAccess("staff", "staff1")); // Has feature but not admin

      const req = new Request("http://localhost/api/admin/attendance", {
        method: "POST",
        body: JSON.stringify({ scanValue: "PASS123", scheduleId: "s1" }),
      });

      const response = (await attendancePOST(req))!;
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error).toBe("Forbidden");
      expect(db.attendancePass.findUnique).not.toHaveBeenCalled();
    });

    it("rejects trainer role even with feature access (403)", async () => {
      mockRequireAdminFeature.mockResolvedValue(mockAdminFeatureAccess("trainer", "trainer1"));

      const req = new Request("http://localhost/api/admin/attendance", {
        method: "POST",
        body: JSON.stringify({ scanValue: "PASS123" }),
      });

      const response = (await attendancePOST(req))!;
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error).toBe("Forbidden");
    });
  });

  // ─── Bookings Endpoint ──────────────────────────────────────────────────────

  describe("/api/admin/bookings POST", () => {
    it("allows admin to create booking", async () => {
      mockRequireAdminFeature.mockResolvedValue(mockAdminFeatureAccess("admin", "admin1"));

      const req = new Request("http://localhost/api/admin/bookings", {
        method: "POST",
        body: JSON.stringify({ userId: "u1", scheduleId: "s1" }),
      });

      // Will fail validation, but we're testing role check happens first
      const response = (await bookingsPOST(req))!;

      // If we got past role check, error will be about missing data (not 403)
      expect(response.status).not.toBe(403);
    });

    it("rejects non-admin (403)", async () => {
      mockRequireAdminFeature.mockResolvedValue(mockAdminFeatureAccess("staff", "staff1"));

      const req = new Request("http://localhost/api/admin/bookings", {
        method: "POST",
        body: JSON.stringify({ userId: "u1", scheduleId: "s1" }),
      });

      const response = (await bookingsPOST(req))!;
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error).toBe("Forbidden");
    });
  });

  describe("/api/admin/bookings PATCH", () => {
    it("allows admin to modify booking", async () => {
      mockRequireAdminFeature.mockResolvedValue(mockAdminFeatureAccess("admin", "admin1"));

      const req = new Request("http://localhost/api/admin/bookings", {
        method: "PATCH",
        body: JSON.stringify({ bookingId: "b1", action: "cancel" }),
      });

      // Will fail validation, but role check happens first
      const response = (await bookingsPATCH(req))!;
      expect(response.status).not.toBe(403);
    });

    it("rejects non-admin (403)", async () => {
      mockRequireAdminFeature.mockResolvedValue(mockAdminFeatureAccess("contracts_manager", "contracts1"));

      const req = new Request("http://localhost/api/admin/bookings", {
        method: "PATCH",
        body: JSON.stringify({ bookingId: "b1", action: "cancel" }),
      });

      const response = (await bookingsPATCH(req))!;
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error).toBe("Forbidden");
    });
  });

  describe("/api/admin/bookings DELETE", () => {
    it("allows admin to delete booking", async () => {
      mockRequireAdminFeature.mockResolvedValue(mockAdminFeatureAccess("admin", "admin1"));

      const req = new Request("http://localhost/api/admin/bookings", {
        method: "DELETE",
        body: JSON.stringify({ bookingId: "b1" }),
      });

      const response = (await bookingsDELETE(req))!;
      expect(response.status).not.toBe(403);
    });

    it("rejects non-admin (403)", async () => {
      mockRequireAdminFeature.mockResolvedValue(mockAdminFeatureAccess("staff", "staff1"));

      const req = new Request("http://localhost/api/admin/bookings", {
        method: "DELETE",
        body: JSON.stringify({ bookingId: "b1" }),
      });

      const response = (await bookingsDELETE(req))!;
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error).toBe("Forbidden");
    });
  });

  // ─── Operational Validation ────────────────────────────────────────────────

  describe("pending_payment membership booking attendance", () => {
    it("rejects attendance for pending_payment booking even by admin", async () => {
      mockRequireAdminFeature.mockResolvedValue(mockAdminFeatureAccess("admin", "admin1"));

      vi.mocked(extractAttendanceCode).mockReturnValue("PASS456");
      vi.mocked(db.attendancePass.findUnique).mockResolvedValue({
        id: "pass2",
        userId: "user2",
        code: "PASS456",
        status: "active",
        user: { id: "user2", name: "Client 2", email: "c2@test.com", phone: "456", isActive: true },
        userMembership: {
          id: "m2",
          status: "pending_payment", // NOT active
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          membership: { name: "Premium", sessionsCount: 20 },
        },
        privateSessionApplication: null,
      } as any);

      vi.mocked(db.booking.findFirst).mockResolvedValue({
        id: "b2",
        userId: "user2",
        userMembershipId: "m2",
        scheduleId: "s2",
        status: "confirmed",
        userMembership: { status: "pending_payment" }, // Booking operational check will fail
        schedule: {
          class: { name: "Yoga", trainer: { name: "Trainer 2" } },
          time: "10:00",
        },
      } as any);

      // Mock isBookingOperational to return false for pending_payment
      const { isBookingOperational } = await import("@/lib/booking-operational");
      vi.mocked(isBookingOperational).mockReturnValue(false);

      const req = new Request("http://localhost/api/admin/attendance", {
        method: "POST",
        body: JSON.stringify({ scanValue: "PASS456", scheduleId: "s2", mode: "class" }),
      });

      const response = (await attendancePOST(req))!;
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain("الاشتراك المرتبط بهذا الحجز غير نشط");
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it("allows attendance for active membership confirmed booking", async () => {
      mockRequireAdminFeature.mockResolvedValue(mockAdminFeatureAccess("admin", "admin1"));

      vi.mocked(extractAttendanceCode).mockReturnValue("PASS789");
      vi.mocked(db.attendancePass.findUnique).mockResolvedValue({
        id: "pass3",
        userId: "user3",
        code: "PASS789",
        status: "active",
        user: { id: "user3", name: "Client 3", email: "c3@test.com", phone: "789", isActive: true },
        userMembership: {
          id: "m3",
          status: "active", // ACTIVE membership
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          membership: { name: "Gold", sessionsCount: 15 },
        },
        privateSessionApplication: null,
      } as any);

      vi.mocked(db.booking.findFirst).mockResolvedValue({
        id: "b3",
        userId: "user3",
        userMembershipId: "m3",
        scheduleId: "s3",
        status: "confirmed",
        userMembership: { status: "active" }, // Active
        schedule: {
          class: { name: "Boxing", trainer: { name: "Trainer 3" } },
          time: "17:00",
        },
      } as any);

      const { isBookingOperational } = await import("@/lib/booking-operational");
      vi.mocked(isBookingOperational).mockReturnValue(true);

      const req = new Request("http://localhost/api/admin/attendance", {
        method: "POST",
        body: JSON.stringify({ scanValue: "PASS789", scheduleId: "s3", mode: "class" }),
      });

      const response = (await attendancePOST(req))!;
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(db.$transaction).toHaveBeenCalled();
    });
  });
});
