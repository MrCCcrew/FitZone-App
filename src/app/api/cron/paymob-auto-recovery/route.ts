import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import {
  runRealPaymobRecoveryCycle,
} from "@/lib/payments/paymob-auto-recovery-live-cycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization");

  if (!secret || !supplied?.startsWith("Bearer ")) return false;

  const actual = Buffer.from(supplied.slice(7));
  const expected = Buffer.from(secret);

  return actual.length === expected.length &&
    timingSafeEqual(actual, expected);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const result = await runRealPaymobRecoveryCycle();

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    console.error(
      "[PAYMOB_AUTO_RECOVERY_CRON_FAILED]",
      error instanceof Error ? error.name : "unknown",
    );

    return NextResponse.json(
      { ok: false, error: "Recovery cycle failed" },
      { status: 500 },
    );
  }
}
