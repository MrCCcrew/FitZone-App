import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/app/api/bookings/route.ts", "utf8");
const booking = readFileSync("src/lib/payments/friend-offer-independent-booking.ts", "utf8");

describe("independent friend offer booking source invariants", () => {
  it("disallows mixed entitlement types", () => expect(route).toContain("MULTIPLE_ENTITLEMENTS"));
  it("routes friend entitlement booking independently", () => expect(route).toContain("bookIndependentFriendOfferClass(userId"));
  it("never books a pending settlement entitlement", () => expect(booking).toContain('right.status !== "active"'));
  it("locks user, entitlement and schedule before consuming a seat", () => {
    expect(booking).toContain("lockMembershipLifecycleUserTx");
    expect(booking).toContain("FriendOfferEntitlement WHERE id");
    expect(booking).toContain("Schedule WHERE id");
  });
  it("guards ownership, payment, and no membership substitution", () => {
    expect(booking).toContain("participant.userMembershipId !== null");
    expect(booking).toContain("payment.membershipId !== null");
    expect(booking).toContain('payment.provider !== "paymob"');
  });
  it("preserves physical capacity atomicity and avoids membership writes", () => {
    expect(booking).toContain("availableSpots: { decrement: 1 }");
    expect(booking).toContain("friendOfferEntitlementId: right.id");
    expect(booking).not.toContain("userMembership.update");
  });
  it("fails closed without frozen booking pattern", () => expect(booking).toContain("FRIEND_RIGHT_BOOKING_POLICY_MISSING"));
  it("checks class, health, time collision and limits", () => {
    for(const word of ["isClassAllowedByEligibilitySnapshot","assertUserCanBookClassByHealth","BOOKING_TIME_CONFLICT","getFrozenMaxSessionsPerDay","getFrozenRequireDistinctClassesPerDay"]){
      expect(booking).toContain(word);
    }
  });
});
