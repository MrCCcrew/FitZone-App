import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const customer = readFileSync("src/app/api/me/bookings/route.ts", "utf8");
const admin = readFileSync("src/app/api/admin/bookings/route.ts", "utf8");

describe("V5-R3 independent friend booking visibility and safe administration", () => {
  it("includes independently owned friend bookings without membership dependency", () => {
    expect(customer).toContain("friendOfferEntitlement: {");
    expect(customer).toContain("b.friendOfferEntitlement?.userId === currentUser.id");
    expect(customer).toContain('"friend_offer"');
    expect(customer).toContain("friendOfferEntitlementId: b.friendOfferEntitlementId ?? null");
  });

  it("shows independent friend rights in admin booking listings", () => {
    expect(admin).toContain("friendOfferEntitlement: {");
    expect(admin).toContain("friendOfferEntitlementId: booking.friendOfferEntitlementId");
  });

  it("fails closed before legacy admin mutations until compensation flow exists", () => {
    const guard = admin.indexOf("if (booking.friendOfferEntitlementId) {");
    const legacy = admin.indexOf("if (\n      booking.offerBoxEntitlementId &&", guard);
    expect(guard).toBeGreaterThan(0);
    expect(legacy).toBeGreaterThan(guard);
    expect(admin).toContain("INDEPENDENT_FRIEND_ADMIN_MUTATION_PENDING");
    expect(admin.slice(guard, legacy)).toContain("status: 409");
  });
});
