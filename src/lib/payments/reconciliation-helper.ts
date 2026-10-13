/**
 * POST-ACTIVATION RECONCILIATION WITH ROW-LOCK EXACT-ONCE GUARANTEE
 *
 * This helper executes all financial/reward/inventory side effects for a successfully
 * activated membership payment using row-level locking to ensure exactly-once execution
 * even under concurrent retries.
 *
 * CRITICAL ARCHITECTURE:
 * - Acquires exclusive FOR UPDATE lock on PaymentTransaction row
 * - Checks metadata for completion marker before executing any side effects
 * - ALL DB operations (commissions, wallet, rewards, inventory) in ONE transaction
 * - Sets completion marker atomically with financial operations
 * - If transaction fails: ALL effects roll back including marker
 * - External notifications (email/push) happen AFTER successful DB commit
 */

import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  buildAttendancePayload,
  ensureMembershipAttendancePass,
} from "@/lib/attendance";
import {
  sendSubscriptionEmail,
  sendAdminSubscriptionNotification,
} from "@/lib/email";
import { generateMembershipQrCard } from "@/lib/membership-card";
import {
  generateMembershipInvoicePdf,
  type MembershipInvoiceDetails,
} from "@/lib/membership-invoice";
import { getRewardSettings, calcTier } from "@/lib/reward-settings";
import { unlockPendingReferralReward } from "@/lib/payments/service";
import {
  postPromotionalPointsGrantJournal,
  postPromotionalWalletCreditJournal,
  postSubscriptionJournal,
} from "@/lib/accounting-service";
import { asDbTransactionClient } from "@/lib/db";
import { ensureLegacyMembershipCommissionSnapshotTx } from "@/lib/commissions/membership-commission-legacy-snapshot";
import { accrueMembershipCommissionsTx } from "@/lib/commissions/membership-commission-accrual";
import { accrueMarketingCommissionTx } from "@/lib/marketing-conversion-service";
import { accrueCoachMembershipEarningTx } from "@/lib/employees/coach-membership-earning-service";

type ReconciliationInput = {
  transactionId: string;
  userId: string;
  userMembershipId: string;
  membershipData: {
    status: string;
    startDate: Date;
    offerId: string | null;
    membership: {
      name: string;
      nameEn: string | null;
      duration: number;
      walletBonus: number;
      productRewards: string | null;
    };
    offer: { title: string } | null;
  };
  paymentAmount: number;
  paymentMethod: string;
  paidAt: Date | null;
  transactionMetadata: string | null;

  /*
   * Deferred Offer Box redemption already converts
   * offerBoxReservedCount -> currentSubscribers atomically.
   * Prevent reconciliation from incrementing the Offer twice.
   */
  skipOfferSubscriberIncrement?: boolean;
};

type ReconciliationResult = {
  alreadyCompleted: boolean;
  completedAt?: string;
};

function parseJson(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stringifyJson(value: Record<string, unknown> | null | undefined) {
  if (!value || Object.keys(value).length === 0) return null;
  return JSON.stringify(value);
}

function asRecord(
  value: unknown,
): Record<string, unknown> | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toInvoiceDetails(
  metadata: Record<string, unknown> | null,
): MembershipInvoiceDetails | null {
  if (!metadata) return null;

  /*
   * Canonical subscription checkout metadata stores invoice data
   * under membershipInvoice.
   *
   * Keep the historical flat shape as a compatibility fallback.
   */
  const invoice =
    asRecord(metadata.membershipInvoice) ??
    metadata;

  const invoiceNumber =
    typeof invoice.invoiceNumber === "string"
      ? invoice.invoiceNumber.trim()
      : "";

  if (!invoiceNumber) {
    return null;
  }

  return {
    invoiceNumber,
    customerName:
      String(invoice.customerName ?? ""),
    customerEmail:
      String(invoice.customerEmail ?? ""),
    membershipName:
      String(invoice.membershipName ?? ""),
    membershipNameEn:
      invoice.membershipNameEn
        ? String(invoice.membershipNameEn)
        : null,
    offerTitle:
      invoice.offerTitle
        ? String(invoice.offerTitle)
        : null,
    offerTitleEn:
      invoice.offerTitleEn
        ? String(invoice.offerTitleEn)
        : null,
    originalPrice:
      Number(invoice.originalPrice ?? 0),
    membershipDiscount:
      Number(invoice.membershipDiscount ?? 0),
    discountCodeAmount:
      Number(invoice.discountCodeAmount ?? 0),
    discountCode:
      invoice.discountCode
        ? String(invoice.discountCode)
        : null,
    walletDeduct:
      Number(invoice.walletDeduct ?? 0),
    pointsDeduct:
      Number(invoice.pointsDeduct ?? 0),

    /*
     * These are authoritatively replaced below by the actual
     * activated membership/payment values.
     */
    finalAmount:
      Number(invoice.finalAmount ?? 0),
    paymentMethod:
      String(invoice.paymentMethod ?? ""),
    startDate: null,
    endDate: new Date(),
    issuedAt: new Date(),
  };
}

function toOfferBoxInvoiceDetails(
  metadata: Record<string, unknown> | null,
  invoiceNumber: string,
): MembershipInvoiceDetails | null {
  if (!metadata) return null;

  const invoice =
    asRecord(
      metadata.offerBoxInvoiceSnapshot,
    );

  if (
    !invoice ||
    Number(invoice.version) !== 1
  ) {
    return null;
  }

  return {
    /*
     * The PaymentTransaction reference is durable and unique,
     * and exists in the same DB transaction that persisted
     * the checkout metadata.
     */
    invoiceNumber,

    customerName:
      String(invoice.customerName ?? ""),
    customerEmail:
      String(invoice.customerEmail ?? ""),
    membershipName:
      String(invoice.membershipName ?? ""),
    membershipNameEn:
      invoice.membershipNameEn
        ? String(invoice.membershipNameEn)
        : null,
    offerTitle:
      invoice.offerTitle
        ? String(invoice.offerTitle)
        : null,
    offerTitleEn:
      invoice.offerTitleEn
        ? String(invoice.offerTitleEn)
        : null,

    originalPrice:
      Number(invoice.originalPrice ?? 0),
    membershipDiscount:
      Number(invoice.membershipDiscount ?? 0),
    discountCodeAmount:
      Number(invoice.discountCodeAmount ?? 0),
    discountCode:
      invoice.discountCode
        ? String(invoice.discountCode)
        : null,
    walletDeduct:
      Number(invoice.walletDeduct ?? 0),
    pointsDeduct:
      Number(invoice.pointsDeduct ?? 0),

    finalAmount:
      Number(invoice.finalAmount ?? 0),
    paymentMethod:
      String(
        invoice.paymentMethod ?? "paymob",
      ),

    /*
     * Offer Box does not start membership duration at purchase.
     * Actual dates are injected after redemption below.
     */
    startDate: null,
    endDate: new Date(),
    issuedAt: new Date(),
  };
}
/**
 * Execute post-activation reconciliation with row-lock guarantee.
 *
 * CONCURRENCY SAFETY:
 * - First request: acquires lock, executes all DB operations, sets completed=true, commits
 * - Concurrent retry: waits for lock, acquires it, sees completed=true, returns idempotently
 * - NO duplicate financial/reward/inventory operations possible
 */
export async function runPaidMembershipPostActivationReconciliation(
  input: ReconciliationInput,
): Promise<ReconciliationResult> {
  const {
    transactionId,
    userId,
    userMembershipId,
    membershipData,
    paymentAmount,
    paymentMethod,
    paidAt,
    transactionMetadata,
    skipOfferSubscriberIncrement = false,
  } = input;

  // Execute ALL DB reconciliation in ONE locked transaction
  const dbResult = await db.$transaction(
    async (tx) => {
      // 1. Acquire exclusive row lock on PaymentTransaction
      // This serializes ALL reconciliation attempts for this payment
      await tx.$queryRaw`
      SELECT \`id\`
      FROM \`PaymentTransaction\`
      WHERE \`id\` = ${transactionId}
      FOR UPDATE
    `;

      // 2. Re-read PaymentTransaction after acquiring lock
      const payment = await tx.paymentTransaction.findUnique({
        where: { id: transactionId },
        select: { id: true, metadata: true, status: true },
      });

      if (!payment) {
        throw new Error(`Payment transaction ${transactionId} not found`);
      }

      // 3. Parse metadata and check completion marker
      const metadata = parseJson(payment.metadata);
      const reconciliation = metadata?.postActivationReconciliation as
        | {
            completed?: boolean;
            completedAt?: string;
            userMembershipId?: string;
            version?: number;
          }
        | undefined;

      // If already completed for THIS membership, return idempotently
      if (
        reconciliation?.completed === true &&
        reconciliation.userMembershipId === userMembershipId
      ) {
        return {
          alreadyCompleted: true,
          completedAt: reconciliation.completedAt,
        };
      }

      // 4. Execute ALL DB reconciliation operations using tx

      /*
       * Membership commission reconciliation is authoritative and exact-once.
       *
       * New memberships already carry an immutable checkout-time snapshot.
       * Pre-cutover memberships do not; for those only, freeze the historical
       * Paymob reconciliation economics exactly once before accrual.
       *
       * Both operations run inside THIS already-locked reconciliation transaction.
       */
      await ensureLegacyMembershipCommissionSnapshotTx(
        asDbTransactionClient(tx),
        userMembershipId,
      );

      await accrueMembershipCommissionsTx(
        asDbTransactionClient(tx),
        userMembershipId,
      );

      // Marketing closer commission is independent from referral commissions
      // but shares the same payment-level exact-once reconciliation transaction.
      await accrueMarketingCommissionTx(
        asDbTransactionClient(tx),
        userMembershipId,
      );

      // ── Attendance pass ──────────────────────────────────────────────────────
      // Note: Attendance pass creation moved AFTER transaction commit
      // ensureMembershipAttendancePass uses db (not tx) and can cause foreign key issues
      // Will be created post-commit or on-demand when membership card is generated

      // ── Subscription revenue GL ───────────────────────────────────────────────
      //
      // Economic consideration =
      // external paid amount + wallet redeemed + reward-points redeemed.
      //
      // Commercial discounts are already excluded before these values were
      // captured at checkout.
      const paymentAdjustments =
        metadata?.paymentAdjustments &&
        typeof metadata.paymentAdjustments === "object"
          ? (metadata.paymentAdjustments as Record<string, unknown>)
          : {};

      const redeemedWalletAmount = Math.max(
        0,
        Number(
          paymentAdjustments.walletAmount ??
            metadata?.walletDeductedAmount ??
            0,
        ),
      );

      const redeemedPointsAmount = Math.max(
        0,
        Number(paymentAdjustments.pointsAmount ?? 0),
      );

      /*
       * Coach Membership accrual shares THIS authoritative
       * row-locked payment reconciliation transaction.
       *
       * Commercial discounts were already removed at checkout.
       * Wallet/points are payment consideration, not further discounts.
       */
      await accrueCoachMembershipEarningTx(asDbTransactionClient(tx), {
        userMembershipId,
        finalizedAt: paidAt ?? new Date(),
        consideration: {
          externalPaidAmount: Math.max(0, Number(paymentAmount ?? 0)),
          walletAmount: redeemedWalletAmount,
          pointsAmount: redeemedPointsAmount,
        },
      });

      await postSubscriptionJournal(tx, userMembershipId, {
        externalPaidAmount: Math.max(0, Number(paymentAmount ?? 0)),
        walletAmount: redeemedWalletAmount,
        pointsAmount: redeemedPointsAmount,
        externalPaymentAccount: paymentMethod === "cod" ? "cash" : "paymob",
      });

      // ── Wallet bonus ─────────────────────────────────────────────────────────
      const walletBonus = membershipData.membership?.walletBonus ?? 0;
      if (walletBonus > 0) {
        try {
          const wallet = await tx.wallet.upsert({
            where: { userId },
            update: { balance: { increment: walletBonus } },
            create: { userId, balance: walletBonus },
          });
          const walletTransaction = await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              amount: walletBonus,
              type: "credit",
              source: "membership_bonus",
              description: `مكافأة الاشتراك في باقة ${membershipData.membership?.name ?? ""}`,
            },
          });

          await postPromotionalWalletCreditJournal(
            tx,
            walletTransaction.id,
            walletBonus,
          );
        } catch (err) {
          console.error("[RECONCILIATION_WALLET_BONUS]", err);
          throw err;
        }
      }

      // ── Reward points ────────────────────────────────────────────────────────
      try {
        const rewardCfg = await getRewardSettings(
          asDbTransactionClient(tx),
        );
        if (rewardCfg.pointsPerSubscription > 0) {
          const rp = await tx.rewardPoints.findUnique({ where: { userId } });
          if (rp) {
            const newPts = rp.points + rewardCfg.pointsPerSubscription;
            await tx.rewardPoints.update({
              where: { id: rp.id },
              data: {
                points: { increment: rewardCfg.pointsPerSubscription },
                tier: calcTier(newPts, rewardCfg.tierThresholds),
              },
            });
            const rewardHistory = await tx.rewardHistory.create({
              data: {
                rewardId: rp.id,
                points: rewardCfg.pointsPerSubscription,
                reason: "membership_purchase",
              },
            });

            const pointsPromotionAmount =
              Math.round(
                rewardCfg.pointsPerSubscription *
                  Number(rewardCfg.pointValueEGP ?? 0) *
                  100,
              ) / 100;

            await postPromotionalPointsGrantJournal(
              tx,
              rewardHistory.id,
              pointsPromotionAmount,
            );
          }
        }
      } catch (err) {
        console.error("[RECONCILIATION_REWARD_POINTS]", err);
        throw err;
      }

      // ── Product rewards inventory ────────────────────────────────────────────
      const productRewardsRaw =
        membershipData.membership?.productRewards ?? null;
      if (productRewardsRaw) {
        try {
          const productRewards = JSON.parse(productRewardsRaw) as {
            productId: string;
            quantity: number;
          }[];
          for (const reward of productRewards) {
            if (!reward?.productId || !reward?.quantity) continue;

            const product = await tx.product.findUnique({
              where: { id: reward.productId },
              select: {
                id: true,
                stock: true,
                trackInventory: true,
                averageCost: true,
              },
            });
            if (!product) continue;

            if (product.trackInventory) {
              // Atomic conditional stock decrement - prevents negative inventory
              const updated = await tx.product.updateMany({
                where: {
                  id: reward.productId,
                  stock: { gte: reward.quantity },
                },
                data: {
                  stock: { decrement: reward.quantity },
                },
              });

              if (updated.count !== 1) {
                throw new Error(
                  `Insufficient stock for membership product reward: ${reward.productId} (needed ${reward.quantity}, have ${product.stock})`,
                );
              }

              // Read updated product for accurate movement record
              const updatedProduct = await tx.product.findUnique({
                where: { id: reward.productId },
                select: { stock: true },
              });
              const newStock =
                updatedProduct?.stock ?? product.stock - reward.quantity;

              await tx.inventoryMovement.create({
                data: {
                  productId: product.id,
                  type: "package_consumption",
                  quantityChange: -Math.abs(reward.quantity),
                  quantityBefore: product.stock,
                  quantityAfter: newStock,
                  unitCost: product.averageCost,
                  averageCostBefore: product.averageCost,
                  averageCostAfter: product.averageCost,
                  referenceType: "membership",
                  referenceId: userMembershipId,
                  notes: `Package activation: ${membershipData.membership?.name ?? ""}`,
                },
              });
            } else {
              // Non-tracked inventory: just create movement record
              await tx.inventoryMovement.create({
                data: {
                  productId: product.id,
                  type: "package_consumption",
                  quantityChange: -Math.abs(reward.quantity),
                  quantityBefore: product.stock,
                  quantityAfter: product.stock,
                  unitCost: product.averageCost,
                  averageCostBefore: product.averageCost,
                  averageCostAfter: product.averageCost,
                  referenceType: "membership",
                  referenceId: userMembershipId,
                  notes: `Package activation: ${membershipData.membership?.name ?? ""} (untracked)`,
                },
              });
            }
          }
        } catch (err) {
          console.error("[RECONCILIATION_PRODUCT_REWARDS]", err);
          throw err;
        }
      }

      // ── Offer subscribers ────────────────────────────────────────────────────
      if (membershipData.offerId && !skipOfferSubscriberIncrement) {
        try {
          await tx.offer.update({
            where: { id: membershipData.offerId },
            data: { currentSubscribers: { increment: 1 } },
          });
        } catch (err) {
          console.error("[RECONCILIATION_OFFER_SUBSCRIBERS]", err);
          throw err;
        }
      }

      // ── Success notification (DB-only) ───────────────────────────────────────
      try {
        await tx.notification.create({
          data: {
            userId,
            title: `تم تفعيل اشتراكك في ${membershipData.membership?.name ?? "الباقة"}!`,
            body: "تم استلام دفعتك وتفعيل اشتراكك بنجاح.",
            type: "success",
          },
        });
      } catch (err) {
        console.error("[RECONCILIATION_NOTIFICATION]", err);
        // Non-critical, don't block reconciliation
      }

      // 5. Mark reconciliation completed - MUST be last operation
      const now = new Date().toISOString();
      const existingMetadata = parseJson(payment.metadata) ?? {};
      const updatedMetadata = {
        ...existingMetadata,
        postActivationReconciliation: {
          completed: true,
          completedAt: now,
          userMembershipId,
          version: 1,
        },
      };

      await tx.paymentTransaction.update({
        where: { id: transactionId },
        data: { metadata: stringifyJson(updatedMetadata) },
      });

      return {
        alreadyCompleted: false,
        completedAt: now,
      };
    },
    { timeout: 15000 },
  );

  // Referral reward has its own atomic/idempotent transaction.
  //
  // IMPORTANT:
  // Run it only AFTER the reconciliation transaction has committed.
  // Also run it on an already-completed retry so a transient referral-reward
  // failure after a successful payment reconciliation can recover safely.
  try {
    await unlockPendingReferralReward(userId);
  } catch (err) {
    console.error("[RECONCILIATION_REFERRAL_REWARD]", err);
  }

  // If reconciliation was already completed, return after the idempotent
  // referral-reward recovery attempt above.
  if (dbResult.alreadyCompleted) {
    return dbResult;
  }

  // 6. External notifications (AFTER successful DB commit)
  // Fire-and-forget: failures do NOT reverse successful reconciliation
  try {
    const userRecord = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (userRecord?.email) {
      const bookedSchedules = await db.booking.findMany({
        where: { userMembershipId, status: "confirmed" },
        include: {
          schedule: { include: { class: { include: { trainer: true } } } },
        },
      });

      const scheduleRows = bookedSchedules.map((b) => ({
        date: b.schedule.date,
        time: b.schedule.time,
        className: b.schedule.class.name,
        trainerName: b.schedule.class.trainer.name,
      }));

      /*
       * Re-read the payment after the reconciliation transaction committed.
       *
       * This preserves the canonical nested membershipInvoice and also
       * guarantees Offer Box has its durable payment reference even when
       * checkout creation previously went through crash recovery.
       */
      const invoicePayment =
        await db.paymentTransaction.findUnique({
          where: {
            id: transactionId,
          },
          select: {
            referenceCode: true,
            metadata: true,
          },
        });

      const transactionMeta =
        parseJson(
          invoicePayment?.metadata ??
            transactionMetadata,
        );

      const invoiceDetails =
        toInvoiceDetails(transactionMeta) ??
        toOfferBoxInvoiceDetails(
          transactionMeta,
          invoicePayment?.referenceCode ??
            transactionId,
        );
      const now = membershipData.startDate;
      const duration = membershipData.membership?.duration ?? 30;
      const endDate = new Date(now.getTime() + duration * 24 * 60 * 60 * 1000);

      const normalizedInvoice = invoiceDetails
        ? {
            ...invoiceDetails,
            paymentMethod,
            startDate: now,
            endDate,
            issuedAt: paidAt ?? new Date(),
            finalAmount: paymentAmount,
          }
        : null;

      const invoicePdf = normalizedInvoice
        ? await generateMembershipInvoicePdf(normalizedInvoice)
        : null;

      let membershipCard = null;
      try {
        const pass = await ensureMembershipAttendancePass(userMembershipId);
        if (pass) {
          membershipCard = await generateMembershipQrCard({
            memberName: userRecord.name ?? "FitZone Member",
            membershipName: membershipData.membership?.name ?? "Membership",
            membershipNameEn: membershipData.membership?.nameEn ?? null,
            offerTitle: membershipData.offer?.title ?? null,
            endDate,
            qrPayload: buildAttendancePayload(pass.code),
            cardCode: pass.code,
          });
        }
      } catch (err) {
        console.error("[RECONCILIATION_MEMBERSHIP_CARD]", err);
      }

      void sendSubscriptionEmail(
        userRecord.email,
        userRecord.name ?? "العضوة",
        membershipData.membership?.name ?? "الباقة",
        endDate,
        membershipData.membership?.walletBonus > 0
          ? membershipData.membership.walletBonus
          : undefined,
        scheduleRows,
        normalizedInvoice && invoicePdf
          ? {
              details: normalizedInvoice,
              filename: `fitzone-membership-invoice-${normalizedInvoice.invoiceNumber}.pdf`,
              content: invoicePdf,
            }
          : null,
        membershipCard,
      ).catch((err) => console.error("[RECONCILIATION_EMAIL]", err));

      void sendAdminSubscriptionNotification({
        customerName: userRecord.name ?? "—",
        customerEmail: userRecord.email,
        planName: membershipData.membership?.name ?? "الباقة",
        offerTitle: membershipData.offer?.title ?? null,
        endDate,
        amount: paymentAmount,
        paymentMethod,
        invoiceNumber:
          normalizedInvoice?.invoiceNumber ??
          `MBR-${userMembershipId.slice(-8).toUpperCase()}`,
      }).catch((err) => console.error("[RECONCILIATION_ADMIN_EMAIL]", err));
    }
  } catch (err) {
    console.error("[RECONCILIATION_EXTERNAL_NOTIFICATIONS]", err);
    // Email/push failures do NOT affect reconciliation success
  }

  return dbResult;
}
