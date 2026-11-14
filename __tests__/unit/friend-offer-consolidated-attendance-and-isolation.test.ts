import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const source = (p: string) => readFileSync(p, "utf8");
describe("V4 consolidated independent friend rights isolation", () => {
  it("never creates a synthetic membership for a new group", () => {
    const text = source("src/app/api/friend-offers/route.ts");
    expect(text).not.toContain("syntheticMembership = await tx.membership.create");
    expect(text).not.toContain("await tx.offer.update({");
    expect(text).toContain("individualInvitesEnabled: true");
  });
  it("freezes the booking policy rather than falling back to membership rules", () => {
    const text = source("src/app/api/friend-offers/route.ts");
    expect(text).toContain("bookingPatternSnapshot: JSON.stringify");
    expect(text).toContain("resolveBookingPolicy(");
  });
  it("keeps pending_settlement rights unavailable for bookings and QR", () => {
    expect(source("src/lib/payments/friend-offer-independent-booking.ts")).toContain('right.status !== "active"');
    expect(source("src/lib/attendance.ts")).toContain('right.status !== "active"');
  });
  it("checks the active right, payment identity and QR pass under locks", () => {
    const text = source("src/lib/attendance-service.ts");
    expect(text).toContain("markIndependentFriendClassAttendance");
    expect(text).toContain("FROM FriendOfferEntitlement WHERE id = ${entitlementId} FOR UPDATE");
    expect(text).toContain("FROM Booking WHERE id = ${input.bookingId} FOR UPDATE");
    expect(text).toContain('right.paymentTransaction.status !== "paid"');
    expect(text).toContain('status: "attended"');
  });
  it("uses a separate friend QR identity and scanner path", () => {
    expect(source("src/app/api/admin/attendance/route.ts")).toContain("pass.friendOfferEntitlementId");
    expect(source("src/app/api/me/attendance-pass/route.ts")).toContain('kind: "friend_offer"');
  });
  it("includes additive schema migration without backfilling historical rights", () => {
    const sql=source("prisma/migrations/20261111193000_friend_offer_independent_finance_booking_attendance/migration.sql");
    const duplicate=source("prisma/migrations/20261111193000_independent_friend_group_rights/migration.sql");
    expect(sql).toContain('DEFAULT false');
    expect(sql).toContain('CREATE TABLE `FriendOfferEntitlement`');
    expect(sql).not.toMatch(/UPDATE `UserMembership`/);
    expect(duplicate).toContain('intentionally performs NO DDL');
    expect(duplicate).not.toMatch(/\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\s+(?:TABLE|INDEX|INTO|`)/i);
  });
});
