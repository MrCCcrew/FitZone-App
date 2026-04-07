import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentAppUser } from "@/lib/app-session";

export const dynamic = "force-dynamic";

function clampRating(value: unknown) {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return null;
  const rounded = Math.round(rating);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const [product, reviews] = await Promise.all([
      db.product.findUnique({
        where: { id },
        select: { id: true, name: true },
      }),
      db.productReview.findMany({
        where: { productId: id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    if (!product) {
      return NextResponse.json({ error: "المنتج غير موجود." }, { status: 404 });
    }

    const count = reviews.length;
    const averageRating = count > 0 ? reviews.reduce((sum, review) => sum + review.rating, 0) / count : 0;

    return NextResponse.json({
      productId: product.id,
      productName: product.name,
      averageRating,
      count,
      reviews: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        content: review.content,
        createdAt: review.createdAt.toISOString(),
        user: {
          id: review.user.id,
          name: review.user.name || review.user.email || "عميل فيت زون",
        },
      })),
    });
  } catch (error) {
    console.error("[PRODUCT_REVIEWS_GET]", error);
    return NextResponse.json({ error: "تعذر تحميل مراجعات المنتج." }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await getCurrentAppUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "يجب تسجيل الدخول لإضافة تقييم." }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await req.json();
    const rating = clampRating(body.rating);
    const content = String(body.content ?? "").trim();

    if (!rating) {
      return NextResponse.json({ error: "اختَر تقييمًا من 1 إلى 5 نجوم." }, { status: 400 });
    }

    if (content.length < 10) {
      return NextResponse.json({ error: "اكتب مراجعة مفيدة لا تقل عن 10 أحرف." }, { status: 400 });
    }

    const product = await db.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!product) {
      return NextResponse.json({ error: "المنتج غير موجود." }, { status: 404 });
    }

    const review = await db.productReview.upsert({
      where: {
        productId_userId: {
          productId: id,
          userId: currentUser.id,
        },
      },
      update: {
        rating,
        content,
      },
      create: {
        productId: id,
        userId: currentUser.id,
        rating,
        content,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      review: {
        id: review.id,
        rating: review.rating,
        content: review.content,
        createdAt: review.createdAt.toISOString(),
        user: {
          id: review.user.id,
          name: review.user.name || review.user.email || "عميل فيت زون",
        },
      },
    });
  } catch (error) {
    console.error("[PRODUCT_REVIEWS_POST]", error);
    return NextResponse.json({ error: "تعذر حفظ مراجعة المنتج." }, { status: 500 });
  }
}
