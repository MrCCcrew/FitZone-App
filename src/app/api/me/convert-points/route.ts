import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

async function getPointValueEGP(): Promise<number> {
  const row = await db.siteContent.findUnique({ where: { section: "reward_settings" } });
  if (!row) return 0.1;
  try {
    const parsed = JSON.parse(row.content) as { pointValueEGP?: number };
    return typeof parsed.pointValueEGP === "number" ? parsed.pointValueEGP : 0.1;
  } catch {
    return 0.1;
  }
}

const REFERRAL_POINT_REASONS = new Set([
  "referral_signup",
  "referral_bonus",
]);

function resolveConvertiblePoints(
  currentPoints: number,
  history: Array<{ points: number; reason: string }>,
) {
  let protectedReferralPoints = 0;
  let generalPoints = 0;
  let ledgerPoints = 0;
  let ledgerConsistent = true;

  for (const row of history) {
    const delta = Math.trunc(Number(row.points) || 0);
    ledgerPoints += delta;

    if (delta > 0) {
      if (REFERRAL_POINT_REASONS.has(row.reason)) {
        protectedReferralPoints += delta;
      } else {
        generalPoints += delta;
      }
      continue;
    }

    if (delta >= 0) {
      continue;
    }

    let debit = Math.abs(delta);

    const generalDebit = Math.min(
      generalPoints,
      debit,
    );

    generalPoints -= generalDebit;
    debit -= generalDebit;

    const referralDebit = Math.min(
      protectedReferralPoints,
      debit,
    );

    protectedReferralPoints -= referralDebit;
    debit -= referralDebit;

    if (debit > 0) {
      ledgerConsistent = false;
    }
  }

  const bucketTotal =
    generalPoints + protectedReferralPoints;

  if (
    ledgerPoints !== currentPoints ||
    bucketTotal !== currentPoints
  ) {
    ledgerConsistent = false;
  }

  return {
    convertiblePoints: ledgerConsistent
      ? generalPoints
      : 0,
    protectedReferralPoints,
    ledgerPoints,
    ledgerConsistent,
  };
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentAppUser();
    if (!user?.id) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولًا." }, { status: 401 });
    }

    const body = (await req.json()) as { points?: number };
    const pointsToConvert = Math.floor(Number(body.points ?? 0));

    if (!Number.isFinite(pointsToConvert) || pointsToConvert <= 0) {
      return NextResponse.json({ error: "عدد الفيتزونات غير صحيح." }, { status: 400 });
    }

    const pointValueEGP = await getPointValueEGP();

    const egpAmount =
      Math.round(
        pointsToConvert *
          pointValueEGP *
          100,
      ) / 100;

    if (egpAmount <= 0) {
      return NextResponse.json(
        {
          error:
            "قيمة الفيتزونات لا تكفي للتحويل.",
        },
        { status: 400 },
      );
    }

    const conversionResult =
      await db.$transaction(
        async (tx) => {
          const lockedRows =
            await tx.$queryRaw<
              Array<{ id: string }>
            >`
              SELECT \`id\`
              FROM \`RewardPoints\`
              WHERE \`userId\` = ${user.id}
              FOR UPDATE
            `;

          if (lockedRows.length !== 1) {
            return {
              ok: false as const,
              status: 400,
              error:
                "رصيد الفيتزونات غير كافٍ.",
            };
          }

          const pointsRow =
            await tx.rewardPoints.findUnique({
              where: {
                userId: user.id,
              },
            });

          if (!pointsRow) {
            return {
              ok: false as const,
              status: 400,
              error:
                "رصيد الفيتزونات غير كافٍ.",
            };
          }

          const history =
            await tx.rewardHistory.findMany({
              where: {
                rewardId: pointsRow.id,
              },
              select: {
                points: true,
                reason: true,
              },
              orderBy: [
                {
                  createdAt: "asc",
                },
                {
                  id: "asc",
                },
              ],
            });

          const currentPoints =
            pointsRow.points;

          const {
            convertiblePoints,
            ledgerConsistent,
          } = resolveConvertiblePoints(
            currentPoints,
            history,
          );

          if (!ledgerConsistent) {
            return {
              ok: false as const,
              status: 409,
              error:
                "تعذر التحقق من مصدر رصيد الفيتزونات بأمان. يرجى المحاولة لاحقًا أو التواصل مع الإدارة.",
            };
          }

          if (
            pointsToConvert >
            currentPoints
          ) {
            return {
              ok: false as const,
              status: 400,
              error:
                "رصيد الفيتزونات غير كافٍ.",
            };
          }

          if (
            pointsToConvert >
            convertiblePoints
          ) {
            return {
              ok: false as const,
              status: 400,
              error:
                "نقاط الإحالة غير قابلة للتحويل إلى رصيد محفظة. يمكنك تحويل الفيتزونات المؤهلة فقط.",
            };
          }

          await tx.rewardPoints.update({
            where: {
              id: pointsRow.id,
            },
            data: {
              points: {
                decrement:
                  pointsToConvert,
              },
            },
          });

          await tx.rewardHistory.create({
            data: {
              rewardId:
                pointsRow.id,
              points:
                -pointsToConvert,
              reason:
                `تحويل ${pointsToConvert} فيتزونة إلى رصيد المحفظة`,
            },
          });

          const wallet =
            await tx.wallet.upsert({
              where: {
                userId: user.id,
              },
              update: {
                balance: {
                  increment:
                    egpAmount,
                },
              },
              create: {
                userId: user.id,
                balance: egpAmount,
                referralBalance: 0,
              },
            });

          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              amount: egpAmount,
              type: "credit",
              source:
                "points_conversion",
              description:
                `تحويل ${pointsToConvert} فيتزونة (${egpAmount} ج.م)`,
            },
          });

          return {
            ok: true as const,
            convertiblePointsBefore:
              convertiblePoints,
          };
        },
      );

    if (!conversionResult.ok) {
      return NextResponse.json(
        {
          error:
            conversionResult.error,
        },
        {
          status:
            conversionResult.status,
        },
      );
    }

    return NextResponse.json({
      success: true,
      convertedPoints:
        pointsToConvert,
      egpAmount,
      convertiblePoints:
        conversionResult
          .convertiblePointsBefore -
        pointsToConvert,
    });
  } catch (error) {
    console.error("[CONVERT_POINTS]", error);
    return NextResponse.json({ error: "تعذر تحويل الفيتزونات الآن." }, { status: 500 });
  }
}
