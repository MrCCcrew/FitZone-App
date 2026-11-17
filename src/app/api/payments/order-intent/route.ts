import { NextResponse } from "next/server";

/**
 * B76: Retired legacy store payment-intent entry point.
 * This route used to create orders without inventory reservations. The
 * canonical /api/orders POST owns inventory + payment initialization.
 * Do not redirect automatically: the legacy response and pricing contracts
 * differ, so callers must explicitly migrate to the canonical API.
 */
export async function POST() {
  return NextResponse.json(
    { error: "LEGACY_ORDER_INTENT_RETIRED", replacement: "/api/orders" },
    { status: 410 },
  );
}
