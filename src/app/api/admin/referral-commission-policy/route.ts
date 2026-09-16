import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin-authorization-server";
import { db, asDbTransactionClient } from "@/lib/db";
import { saveReferralCommissionPolicyTx } from "@/lib/commissions/staff-referral-policy-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireViewAccess() {
  const view = await requireAdminPermission("employee_compensation_view");

  if (!("error" in view)) {
    return view;
  }

  return requireAdminPermission("employee_compensation_manage");
}

function userIdFromGuard(guard: {
  session: {
    id?: string;
    user?: {
      id?: string;
    };
  };
}) {
  return guard.session.user?.id ?? guard.session.id ?? null;
}

function intValue(value: unknown, code: string): number {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isSafeInteger(parsed)) {
    throw new Error(code);
  }

  return parsed;
}

function percentageToBps(value: unknown, code: string): number {
  if (
    value == null ||
    (typeof value === "string" && value.trim() === "")
  ) {
    throw new Error(code);
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(code);
  }

  const bps = Math.round(parsed * 100);

  if (Math.abs(parsed * 100 - bps) > 0.000001) {
    throw new Error(code);
  }

  return bps;
}

function mapError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "REFERRAL_POLICY_UNKNOWN_ERROR";

  if (message === "REFERRAL_POLICY_EFFECTIVE_FROM_EXISTS") {
    return NextResponse.json(
      {
        error: "يوجد إعداد إحالة بالفعل يبدأ في نفس التاريخ.",
      },
      { status: 409 },
    );
  }

  if (message.startsWith("REFERRAL_POLICY_")) {
    return NextResponse.json({ error: message }, { status: 400 });
  }

  console.error("[ADMIN_REFERRAL_COMMISSION_POLICY]", error);

  return NextResponse.json(
    { error: "تعذر حفظ إعدادات عمولات الإحالة." },
    { status: 500 },
  );
}

export async function GET() {
  const guard = await requireViewAccess();

  if ("error" in guard) {
    return guard.error;
  }

  const [positions, policies] = await Promise.all([
    db.position.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        nameEn: true,
        isActive: true,
      },
    }),

    db.referralCommissionPolicy.findMany({
      orderBy: {
        effectiveFrom: "desc",
      },
      include: {
        rates: {
          include: {
            position: {
              select: {
                id: true,
                code: true,
                name: true,
                nameEn: true,
                isActive: true,
              },
            },
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    positions,
    policies: policies.map((policy) => ({
      id: policy.id,
      effectiveFrom: policy.effectiveFrom.toISOString(),
      effectiveTo: policy.effectiveTo?.toISOString() ?? null,

      minimumShortTermGapDays: policy.minimumShortTermGapDays,

      shortTermMaxMonths: policy.shortTermMaxMonths,

      underMinimumGapPct: policy.underMinimumGapBps / 100,

      shortTermPct: policy.shortTermBps / 100,

      isActive: policy.isActive,
      notes: policy.notes,
      createdById: policy.createdById,

      rates: policy.rates.map((rate) => ({
        id: rate.id,
        positionId: rate.positionId,

        newCustomerPct: rate.newCustomerBps / 100,

        longTermPct: rate.longTermBps / 100,

        position: rate.position,
      })),
    })),
  });
}

export async function POST(req: Request) {
  const guard = await requireAdminPermission("employee_compensation_manage");

  if ("error" in guard) {
    return guard.error;
  }

  try {
    const body = await req.json();

    const effectiveFrom = new Date(
      `${String(body.effectiveFrom ?? "")}T00:00:00.000Z`,
    );

    if (Number.isNaN(effectiveFrom.getTime())) {
      throw new Error("REFERRAL_POLICY_INVALID_EFFECTIVE_FROM");
    }

    const rates = Array.isArray(body.rates)
      ? body.rates.map((rate: Record<string, unknown>) => ({
          positionId: String(rate.positionId ?? "").trim(),

          newCustomerBps: percentageToBps(
            rate.newCustomerPct,
            "REFERRAL_POLICY_INVALID_NEW_CUSTOMER_BPS",
          ),

          longTermBps: percentageToBps(
            rate.longTermPct,
            "REFERRAL_POLICY_INVALID_LONG_TERM_BPS",
          ),
        }))
      : [];

    const created = await db.$transaction((tx) =>
      saveReferralCommissionPolicyTx(asDbTransactionClient(tx), {
        effectiveFrom,

        minimumShortTermGapDays: intValue(
          body.minimumShortTermGapDays,
          "REFERRAL_POLICY_INVALID_MINIMUM_GAP",
        ),

        shortTermMaxMonths: intValue(
          body.shortTermMaxMonths,
          "REFERRAL_POLICY_INVALID_SHORT_TERM_MONTHS",
        ),

        underMinimumGapBps: percentageToBps(
          body.underMinimumGapPct,
          "REFERRAL_POLICY_INVALID_UNDER_MINIMUM_BPS",
        ),

        shortTermBps: percentageToBps(
          body.shortTermPct,
          "REFERRAL_POLICY_INVALID_SHORT_TERM_BPS",
        ),

        notes: typeof body.notes === "string" ? body.notes : null,

        createdById: userIdFromGuard(guard),

        rates,
      }),
    );

    return NextResponse.json(
      {
        success: true,
        policyId: created.id,
      },
      { status: 201 },
    );
  } catch (error) {
    return mapError(error);
  }
}
