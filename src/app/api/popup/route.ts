import { NextResponse } from "next/server";
import { resolveIndependentDirectOfferTerms } from "@/lib/offer-box/direct-offer-terms";
import { db } from "@/lib/db";
import { calculateOfferBoxFinalPrice } from "@/lib/payments/offer-box-pricing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function respond(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

function closed(reason: string) {
  return respond({
    enabled: false,
    reason,
    settings: null,
    offers: [],
  });
}

export async function GET() {
  try {
    const settings = await db.popupSettings.findUnique({
      where: { id: "main" },
    });

    if (!settings || !settings.enabled) {
      return closed("disabled");
    }

    const now = new Date();

    if (!settings.endDate || settings.endDate <= now) {
      return closed("expired");
    }

    const rows = await db.popupOffer.findMany({
      where: {
        isActive: true,
        offer: {
          isActive: true,
          expiresAt: { gt: now },
        },
      },
      orderBy: [
        { sortOrder: "asc" },
        { id: "asc" },
      ],
      take: 3,
      include: {
        offer: {
          select: {
            id: true,
            title: true,
            titleEn: true,
            type: true,
            discount: true,
            specialPrice: true,
            priceBefore: true,
            durationDays: true,
            sessionsCount: true,
            features: true,
            featuresEn: true,
            expiresAt: true,
            maxSubscribers: true,
            currentSubscribers: true,
            membershipId: true,
            image: true,
            offerBoxEnabled: true,
            offerBoxApplyDiscount: true,
            friendOfferConfig: {
              select: { id: true, isActive: true },
            },
            membership: {
              select: {
                id: true,
                name: true,
                kind: true,
                isActive: true,
                price: true,
                priceBefore: true,
                priceAfter: true,
                duration: true,
                features: true,
              },
            },
          },
        },
      },
    });

    const offers = rows.flatMap((row) => {
      const offer = row.offer;

      // Classification uses ACTIVE commercial capabilities.
      // A historical, disabled friend config must not turn an
      // individual offer into a friends-only purchase.
      const friendsActive = offer.friendOfferConfig?.isActive === true;
      const boxActive = offer.offerBoxEnabled === true;

      // Conflicting active purchase modes must not be advertised.
      if (friendsActive && boxActive) return [];

      if (
        offer.maxSubscribers !== null &&
        offer.currentSubscribers >= offer.maxSubscribers
      ) {
        return [];
      }

      const kind = friendsActive
        ? "friend_offer"
        : boxActive
          ? "offer_box"
          : offer.type === "special"
            ? "direct_offer"
            : "membership_offer";

      // Use the same independent commercial terms contract.
      // Display remains non-authoritative; checkout must revalidate.
      if (kind === "direct_offer") {
        try {
          resolveIndependentDirectOfferTerms({
            id: offer.id,
            isActive: true,
            type: offer.type,
            offerBoxEnabled: offer.offerBoxEnabled,
            friendOfferConfig: offer.friendOfferConfig,
            expiresAt: offer.expiresAt,
            specialPrice: offer.specialPrice,
            priceBefore: offer.priceBefore,
            durationDays: offer.durationDays,
            sessionsCount: offer.sessionsCount,
            currentSubscribers: offer.currentSubscribers,
            maxSubscribers: offer.maxSubscribers,
          }, now);
        } catch {
          return [];
        }
      }

      // Only actual membership offers depend on active Membership.
      if (
        kind === "membership_offer" &&
        (!offer.membershipId || !offer.membership?.isActive)
      ) {
        return [];
      }

      // Display-only snapshot. Checkout remains the payment authority.
      // Offer Box must use exactly the same pricing helper and inputs.
      let offerBoxFinalPrice: number | null = null;

      if (kind === "offer_box") {
        try {
          const basePrice = offer.membership
            ? Number(offer.membership.price)
            : Number(offer.specialPrice ?? 0);

          const calculated = calculateOfferBoxFinalPrice({
            offerType: offer.type,
            discount: Number(offer.discount),
            specialPrice: offer.specialPrice != null
              ? Number(offer.specialPrice)
              : null,
            membershipPriceAfter:
              offer.membership?.priceAfter ?? null,
            basePrice,
            applyOfferDiscount:
              offer.offerBoxApplyDiscount === true,
          });

          // Checkout rejects zero, negative and invalid prices.
          if (!Number.isFinite(calculated) || calculated <= 0) {
            return [];
          }

          offerBoxFinalPrice = calculated;
        } catch {
          // Never advertise an invalid commercial price.
          return [];
        }
      }

      return [{
        id: row.id,
        offerId: offer.id,
        membershipId: offer.membershipId,
        title: offer.title,
        titleEn: offer.titleEn,
        imageUrl: row.imageUrl ?? offer.image,
        badge: row.badge,
        sortOrder: row.sortOrder,
        kind,
        pricingSource: {
          offerType: offer.type,
          discount: offer.discount,
          specialPrice: offer.specialPrice,
          finalPrice: offerBoxFinalPrice,
          priceBefore: offer.priceBefore,
          membershipPrice: offer.membership?.price ?? null,
          membershipPriceAfter: offer.membership?.priceAfter ?? null,
          membershipPriceBefore: offer.membership?.priceBefore ?? null,
        },
        durationDays: offer.durationDays ?? offer.membership?.duration ?? null,
        sessionsCount: offer.sessionsCount,
        features: offer.features,
        featuresEn: offer.featuresEn,
        expiresAt: offer.expiresAt.toISOString(),
        checkout: {
          offerId: offer.id,
          kind,
        },
      }];
    });

    if (offers.length === 0) {
      return closed("no_active_offers");
    }

    return respond({
      enabled: true,
      settings: {
        ribbonText: settings.ribbonText,
        endDate: settings.endDate.toISOString(),
        showDelaySeconds: settings.showDelaySeconds,
        hideHours: settings.hideHours,
        updatedAt: settings.updatedAt.toISOString(),
      },
      offers,
    });
  } catch {
    // Never expose a partially valid campaign on database failure.
    return respond({
      enabled: false,
      reason: "unavailable",
      settings: null,
      offers: [],
    }, 503);
  }
}