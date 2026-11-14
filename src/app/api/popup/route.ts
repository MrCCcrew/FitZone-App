import { NextResponse } from "next/server";
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

      // Inactive memberships must not be advertised as
      // directly purchasable subscriptions.
      // Do not advertise sold-out or disabled friends offers.
      if (
        (offer.maxSubscribers !== null &&
          offer.currentSubscribers >= offer.maxSubscribers) ||
        (offer.friendOfferConfig && !offer.friendOfferConfig.isActive)
      ) {
        return [];
      }
      const isIndependentCommercialOffer =
        offer.offerBoxEnabled || Boolean(offer.friendOfferConfig);

      if (
        !isIndependentCommercialOffer &&
        (!offer.membershipId || !offer.membership?.isActive)
      ) {
        return [];
      }

      const kind = offer.friendOfferConfig
        ? "friend_offer"
        : offer.offerBoxEnabled
          ? "offer_box"
          : "membership_offer";

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