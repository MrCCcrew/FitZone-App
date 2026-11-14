import { readDirectCommercialConsideration } from "@/lib/offer-box/direct-commercial-consideration";
import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

const PAGE_SIZE = 20;
const responseHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
};

function parseSnapshot(raw: string) {
  try {
    const value = JSON.parse(raw) as {
      offer?: {
        title?: unknown;
        titleEn?: unknown;
        sessionsCount?: unknown;
        durationDays?: unknown;
      };
      membershipTemplate?: {
        name?: unknown;
      };
      eligibilitySnapshot?: {
        classIds?: unknown;
      };
    };

    const offer = value?.offer;
    const fallback = value?.membershipTemplate;

    const title =
      typeof offer?.title === "string" && offer.title.trim()
        ? offer.title
        : typeof fallback?.name === "string" && fallback.name.trim()
          ? fallback.name
          : "عرض مشتَرى";

    const titleEn =
      typeof offer?.titleEn === "string" ? offer.titleEn : null;

    const sessionsCount =
      typeof offer?.sessionsCount === "number" &&
      Number.isInteger(offer.sessionsCount) &&
      offer.sessionsCount >= 0
        ? offer.sessionsCount
        : null;

    const durationDays =
      typeof offer?.durationDays === "number" &&
      Number.isInteger(offer.durationDays) &&
      offer.durationDays > 0
        ? offer.durationDays
        : null;

    // Frozen canonical class rights, never the current offer configuration.
    // Missing or malformed rights fail closed.
    const rawClassIds = value?.eligibilitySnapshot?.classIds;

    const allowedClassIds = Array.isArray(rawClassIds)
      ? [
          ...new Set(
            rawClassIds
              .filter(
                (id): id is string =>
                  typeof id === "string" && id.trim().length > 0,
              )
              .map((id) => id.trim()),
          ),
        ]
      : [];

    return {
      title,
      titleEn,
      sessionsCount,
      durationDays,
      allowedClassIds,
    };
  } catch {
    return {
      title: "عرض مشتَرى",
      titleEn: null,
      sessionsCount: null,
      durationDays: null,
      allowedClassIds: [],
    };
  }
}

function errorResponse(status: number, message: string) {
  return NextResponse.json(
    { error: message },
    { status, headers: responseHeaders },
  );
}

export async function GET(req: Request) {
  const user = await getCurrentAppUser();

  if (!user?.id) {
    return errorResponse(401, "يجب تسجيل الدخول أولًا.");
  }

  const pageRaw = new URL(req.url).searchParams.get("page") ?? "0";

  if (!/^\d+$/.test(pageRaw)) {
    return errorResponse(400, "رقم الصفحة غير صالح.");
  }

  const page = Number(pageRaw);

  if (!Number.isSafeInteger(page) || page > 1000) {
    return errorResponse(400, "رقم الصفحة غير صالح.");
  }

  try {
    const rows = await db.offerBoxPurchase.findMany({
      where: {
        userId: user.id,
        OR: [
          { status: { in: ["available", "redeemed"] } },
          {
            commercialKind: {
              in: ["package", "direct_offer"],
            },
            status: {
              in: [
                "pending_payment",
                "paid_activation_pending",
                "paid_review",
              ],
            },
          },
        ],
      },
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE + 1,
      select: {
        id: true,
        userId: true,
        commercialKind: true,
        holdExpiresAt: true,
        status: true,
        offerSnapshot: true,
        priceSnapshot: true,
        currency: true,
        paidAt: true,
        redeemedAt: true,
        redeemedUserMembershipId: true,
        createdAt: true,
      },
    });

    const hasMore = rows.length > PAGE_SIZE;

    const visiblePurchaseIds = rows
      .slice(0, PAGE_SIZE)
      .filter((item) => item.userId === user.id)
      .map((item) => item.id);

    const entitlements =
      await db.offerBoxEntitlement.findMany({
        where: {
          userId: user.id,
          purchaseId: { in: visiblePurchaseIds },
        },
        select: {
          id: true,
          purchaseId: true,
          status: true,
          startDate: true,
          endDate: true,
          totalSessions: true,
        },
      });

    const entitlementIds = entitlements.map(
      (item) => item.id,
    );

    /*
     * Read actual independent bookings only.
     * Never count bookings belonging to a UserMembership.
     *
     * These are descriptive booking totals, not a booking
     * authorization decision.
     */
    const offerBookings = entitlementIds.length
      ? await db.booking.findMany({
          where: {
            userId: user.id,
            userMembershipId: null,
            offerBoxEntitlementId: {
              in: entitlementIds,
            },
          },
          select: {
            id: true,
            offerBoxEntitlementId: true,
            status: true,
            entitlementUnits: true,
            isMakeup: true,
            rescheduleRequests: {
              where: {
                requestType: "past_absence_makeup",
                status: "approved",
              },
              select: { id: true },
              take: 1,
            },
            schedule: {
              select: {
                id: true,
                date: true,
                time: true,
                class: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: [
            { schedule: { date: "asc" } },
            { schedule: { time: "asc" } },
          ],
        })
      : [];

    const entitlementByPurchase = new Map(
      entitlements.map((item) => [
        item.purchaseId,
        item,
      ]),
    );

    const bookingsByEntitlement = new Map<
      string,
      typeof offerBookings
    >();

    for (const booking of offerBookings) {
      if (!booking.offerBoxEntitlementId) {
        continue;
      }

      const existing =
        bookingsByEntitlement.get(
          booking.offerBoxEntitlementId,
        ) ?? [];

      existing.push(booking);

      bookingsByEntitlement.set(
        booking.offerBoxEntitlementId,
        existing,
      );
    }

    const items = rows
      .slice(0, PAGE_SIZE)
      .filter((item) => item.userId === user.id)
      .map((item) => {
        const entitlement =
          entitlementByPurchase.get(item.id);

        const isLegacy =
          item.redeemedUserMembershipId !== null;

        const identityConflict =
          (isLegacy && entitlement != null) ||
          (item.status === "available" && entitlement != null) ||
          (item.status === "redeemed" &&
            !isLegacy &&
            entitlement == null);

        const bookings = entitlement
          ? bookingsByEntitlement.get(entitlement.id) ?? []
          : [];

        const sumUnits = (
          statuses: readonly string[],
        ) =>
          bookings.reduce((total, booking) => {
            if (!statuses.includes(booking.status)) {
              return total;
            }

            const units =
              Number(booking.entitlementUnits);

            if (
              !Number.isSafeInteger(units) ||
              units < 0
            ) {
              throw new Error(
                "OFFER_BOX_BOOKING_UNITS_INVALID",
              );
            }

            return total + units;
          }, 0);

        const reservedUnits =
          sumUnits(["confirmed"]);

        const attendedUnits =
          sumUnits(["attended"]);

        const missedUnits =
          sumUnits(["noshow"]);

        const compensatedMissedUnits = bookings.reduce(
          (total, booking) =>
            booking.status === "noshow" &&
            booking.rescheduleRequests.length > 0
              ? total + booking.entitlementUnits
              : total,
          0,
        );

        const allocatedUnits =
          reservedUnits +
          attendedUnits +
          missedUnits -
          compensatedMissedUnits;

        return {
          purchaseId: item.id,
          commercialKind: item.commercialKind,
          holdExpiresAt:
            item.holdExpiresAt?.toISOString() ?? null,
          status: item.status,
          canRedeem:
            item.status === "available" &&
            !identityConflict,
          ...parseSnapshot(item.offerSnapshot),
          price: (() => { try { const c=readDirectCommercialConsideration(item.offerSnapshot,item.priceSnapshot); return c?c.totalMinor/100:item.priceSnapshot; } catch { return item.priceSnapshot; } })(),
          externalQuotedAmount: item.priceSnapshot,
          currency: item.currency,
          paidAt: item.paidAt?.toISOString() ?? null,
          redeemedAt: item.redeemedAt?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString(),

          redemptionType: identityConflict
            ? "review_required"
            : isLegacy
              ? "legacy_membership"
              : entitlement
                ? "independent"
                : null,

          entitlement:
            entitlement && !identityConflict
              ? {
                  id: entitlement.id,
                  status: entitlement.status,
                  startDate:
                    entitlement.startDate.toISOString(),
                  endDate:
                    entitlement.endDate.toISOString(),
                  totalSessions:
                    entitlement.totalSessions,
                  reservedUnits,
                  attendedUnits,
                  missedUnits,
                  compensatedMissedUnits,
                  allocatedUnits,
                  unallocatedUnits:
                    entitlement.totalSessions === null
                      ? null
                      : Math.max(
                          0,
                          entitlement.totalSessions -
                            allocatedUnits,
                        ),

                  bookings: bookings.map((booking) => ({
                    id: booking.id,
                    status:
                      booking.status === "confirmed" &&
                      entitlement.status === "pending_payment"
                        ? "pending_payment"
                        : booking.status,
                    isMakeup: booking.isMakeup,
                    compensated:
                      booking.status === "noshow" &&
                      booking.rescheduleRequests.length > 0,
                    entitlementUnits:
                      booking.entitlementUnits,
                    scheduleId: booking.schedule.id,
                    date:
                      booking.schedule.date.toISOString(),
                    time: booking.schedule.time,
                    className:
                      booking.schedule.class.name,
                  })),
                }
              : null,
        };
      });

    return NextResponse.json(
      {
        items,
        page,
        hasMore,
        nextPage: hasMore ? page + 1 : null,
      },
      { headers: responseHeaders },
    );
  } catch (error) {
    console.error("[OFFER_BOX_PURCHASES_GET]", error);
    return errorResponse(
      500,
      "تعذر تحميل العروض المشتراة حاليًا.",
    );
  }
}