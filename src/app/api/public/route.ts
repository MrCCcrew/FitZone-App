import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const daysToLabel = (days: number) =>
  days <= 31 ? "monthly" : days <= 100 ? "quarterly" : "annual";

function parseJsonArray(value: string | null) {
  try {
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const memberships = await db.membership.findMany({
      where: { isActive: true },
      orderBy: { price: "asc" },
    });

    const offers = await db.offer.findMany({
      where: { isActive: true, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: "asc" },
    });

    const classes = await db.class.findMany({
      where: { isActive: true },
      include: {
        trainer: true,
        schedules: {
          where: { isActive: true, date: { gte: new Date() } },
          orderBy: [{ date: "asc" }, { time: "asc" }],
          take: 6,
        },
      },
      orderBy: { name: "asc" },
    });

    const products = await db.product.findMany({
      where: { isActive: true },
      orderBy: { price: "asc" },
    });

    return NextResponse.json({
      memberships: memberships.map((membership) => ({
        id: membership.id,
        name: membership.name,
        price: membership.price,
        duration: daysToLabel(membership.duration),
        features: parseJsonArray(membership.features),
        walletBonus: membership.walletBonus,
        gift: membership.gift,
      })),
      offers: offers.map((offer) => ({
        id: offer.id,
        title: offer.title,
        discount: `${offer.discount}%`,
        desc: offer.description ?? "",
        expiresAt: offer.expiresAt.toISOString(),
      })),
      classes: classes.map((gymClass) => ({
        id: gymClass.id,
        name: gymClass.name,
        description: gymClass.description ?? "",
        trainer: gymClass.trainer.name,
        trainerSpecialty: gymClass.trainer.specialty,
        duration: `${gymClass.duration} دقيقة`,
        intensity: gymClass.intensity,
        type: gymClass.type,
        price: gymClass.price,
        maxSpots: gymClass.maxSpots,
        schedules: gymClass.schedules.map((schedule) => ({
          id: schedule.id,
          date: schedule.date.toISOString(),
          time: schedule.time,
          availableSpots: schedule.availableSpots,
        })),
      })),
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        price: product.price,
        oldPrice: product.oldPrice,
        category: product.category,
        description: product.description ?? "",
        images: parseJsonArray(product.images),
        sizes: parseJsonArray(product.sizes),
      })),
    });
  } catch (error) {
    console.error("[PUBLIC_API]", error);
    return NextResponse.json({
      memberships: [],
      offers: [],
      classes: [],
      products: [],
    });
  }
}
