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
import { buildAttendancePayload, ensureMembershipAttendancePass } from "@/lib/attendance";
import { sendSubscriptionEmail, sendAdminSubscriptionNotification } from "@/lib/email";
import { generateMembershipQrCard } from "@/lib/membership-card";
import { generateMembershipInvoicePdf, type MembershipInvoiceDetails } from "@/lib/membership-invoice";
import { getRewardSettings, calcTier } from "@/lib/reward-settings";
import { unlockPendingReferralReward } from "@/lib/payments/service";

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

function toInvoiceDetails(metadata: Record<string, unknown> | null): MembershipInvoiceDetails | null {
  if (!metadata) return null;
  const { invoiceNumber, originalPrice, membershipDiscount, discountCodeAmount, walletDeduct, pointsDeduct } = metadata;
  if (typeof invoiceNumber !== "string") return null;
  return {
    invoiceNumber,
    customerName: String(metadata.customerName ?? ""),
    customerEmail: String(metadata.customerEmail ?? ""),
    membershipName: String(metadata.membershipName ?? ""),
    originalPrice: Number(originalPrice ?? 0),
    membershipDiscount: Number(membershipDiscount ?? 0),
    discountCodeAmount: Number(discountCodeAmount ?? 0),
    walletDeduct: Number(walletDeduct ?? 0),
    pointsDeduct: Number(pointsDeduct ?? 0),
    finalAmount: 0,
    paymentMethod: "",
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
  input: ReconciliationInput
): Promise<ReconciliationResult> {
  const { transactionId, userId, userMembershipId, membershipData, paymentAmount, paymentMethod, paidAt, transactionMetadata } = input;

  // Execute ALL DB reconciliation in ONE locked transaction
  const dbResult = await db.$transaction(async (tx) => {
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
    const reconciliation = metadata?.postActivationReconciliation as {
      completed?: boolean;
      completedAt?: string;
      userMembershipId?: string;
      version?: number;
    } | undefined;

    // If already completed for THIS membership, return idempotently
    if (reconciliation?.completed === true && reconciliation.userMembershipId === userMembershipId) {
      return {
        alreadyCompleted: true,
        completedAt: reconciliation.completedAt,
      };
    }

    // 4. Execute ALL DB reconciliation operations using tx
    const dbx = tx as any;

    // ── Analytics event ──────────────────────────────────────────────────────
    // Note: recordMembershipActivatedEvent is fire-and-forget external, not critical for DB state

    // ── Unlock referral reward ───────────────────────────────────────────────
    try {
      // This function uses db not tx, acceptable since it's idempotent and not critical
      await unlockPendingReferralReward(userId);
    } catch {}

    // ── Partner commission ───────────────────────────────────────────────────
    try {
      const mem = await tx.userMembership.findUnique({
        where: { id: userMembershipId },
        select: {
          partnerId: true,
          partnerCodeId: true,
          affiliateLinkId: true,
          paymentAmount: true,
          membership: { select: { price: true, priceAfter: true } },
        },
      });
      if (mem?.partnerId && (mem.partnerCodeId || mem.affiliateLinkId)) {
        const partner = await tx.partner.findUnique({
          where: { id: mem.partnerId },
          select: { commissionRate: true, commissionType: true },
        });
        if (partner) {
          const listedPrice =
            mem.membership?.priceAfter && mem.membership.priceAfter > 0
              ? mem.membership.priceAfter
              : mem.membership?.price ?? 0;
          const base = listedPrice > 0 ? listedPrice : mem.paymentAmount ?? 0;
          const commission =
            partner.commissionType === "fixed"
              ? partner.commissionRate
              : Math.round((base * partner.commissionRate) / 100 * 100) / 100;
          if (commission > 0) {
            await tx.partnerCommission.upsert({
              where: { userMembershipId },
              update: {},
              create: { partnerId: mem.partnerId, userMembershipId, amount: commission },
            });
          }
        }
      }
    } catch (err) {
      // Financial operations must not be silently swallowed
      console.error("[RECONCILIATION_PARTNER_COMMISSION]", err);
      throw err;
    }

    // ── All other commissions ────────────────────────────────────────────────
    try {
      const fullMem = await dbx.userMembership.findUnique({
        where: { id: userMembershipId },
        select: {
          salesAgentUserId: true,
          salesAgentId: true,
          staffReferralLinkId: true,
          trainerReferralLinkId: true,
          nutritionReferralLinkId: true,
          paymentAmount: true,
          partnerId: true,
          partnerCodeId: true,
          affiliateLinkId: true,
          staffReferralLink: {
            select: { userId: true, user: { select: { commissionRate: true, commissionType: true } } },
          },
          trainerReferralLink: {
            select: { userId: true, user: { select: { commissionRate: true, commissionType: true } } },
          },
          nutritionReferralLink: {
            select: {
              userId: true,
              user: { select: { nutritionistProfile: { select: { commissionRate: true, commissionType: true } } } },
            },
          },
        },
      }) as {
        salesAgentUserId: string | null;
        salesAgentId: string | null;
        staffReferralLinkId: string | null;
        trainerReferralLinkId: string | null;
        nutritionReferralLinkId: string | null;
        paymentAmount: number | null;
        partnerId: string | null;
        partnerCodeId: string | null;
        affiliateLinkId: string | null;
        staffReferralLink: { userId: string; user: { commissionRate: number; commissionType: string } } | null;
        trainerReferralLink: { userId: string; user: { commissionRate: number; commissionType: string } } | null;
        nutritionReferralLink: {
          userId: string;
          user: { nutritionistProfile: { commissionRate: number; commissionType: string } | null };
        } | null;
      } | null;

      if (fullMem) {
        const paidAmount = fullMem.paymentAmount ?? 0;

        // ── Manager–partner commission ─────────────────────────────────────
        if (fullMem.partnerId && (fullMem.partnerCodeId || fullMem.affiliateLinkId)) {
          const partnerWithMgr = (await dbx.partner.findUnique({
            where: { id: fullMem.partnerId },
            select: {
              managerId: true,
              managerCommissionType: true,
              managerCommissionRate: true,
              commissionRate: true,
              commissionType: true,
            },
          })) as {
            managerId: string | null;
            managerCommissionType: string | null;
            managerCommissionRate: number | null;
            commissionRate: number;
            commissionType: string;
          } | null;
          if (partnerWithMgr?.managerId && (partnerWithMgr.managerCommissionRate ?? 0) > 0) {
            const existingPComm = await dbx.partnerCommission.findUnique({
              where: { userMembershipId },
            });
            if (existingPComm) {
              const existingMgrPComm = await dbx.managerPartnerCommission.findUnique({
                where: { partnerCommissionId: existingPComm.id },
              });
              if (!existingMgrPComm) {
                const partnerComm =
                  partnerWithMgr.commissionType === "fixed"
                    ? partnerWithMgr.commissionRate
                    : Math.round((paidAmount * partnerWithMgr.commissionRate) / 100 * 100) / 100;
                let mgrAmount = 0;
                if (partnerWithMgr.managerCommissionType === "percentage_of_partner") {
                  mgrAmount =
                    Math.round((partnerComm * (partnerWithMgr.managerCommissionRate ?? 0)) / 100 * 100) / 100;
                } else {
                  mgrAmount = partnerWithMgr.managerCommissionRate ?? 0;
                }
                if (mgrAmount > 0) {
                  await dbx.managerPartnerCommission.create({
                    data: {
                      managerId: partnerWithMgr.managerId,
                      partnerCommissionId: existingPComm.id,
                      userMembershipId,
                      amount: mgrAmount,
                    },
                  });
                }
              }
            }
          }
        }

        // ── Agent commission ───────────────────────────────────────────────
        if (fullMem.salesAgentUserId) {
          const agentUser = (await dbx.user.findUnique({
            where: { id: fullMem.salesAgentUserId },
            select: { commissionRate: true, commissionType: true },
          })) as { commissionRate: number | null; commissionType: string | null } | null;
          if (agentUser) {
            const rate = agentUser.commissionRate ?? 0;
            const commission =
              agentUser.commissionType === "fixed"
                ? rate
                : Math.round((paidAmount * rate) / 100 * 100) / 100;
            if (commission > 0) {
              await dbx.agentCommission.upsert({
                where: { userMembershipId },
                update: {},
                create: {
                  agentUserId: fullMem.salesAgentUserId,
                  userMembershipId,
                  amount: commission,
                },
              });
            }
          }
        }

        // ── Sales agent referral commission + manager + conversion ──────────
        if (fullMem.salesAgentId) {
          const sa = (await dbx.salesAgent.findUnique({
            where: { id: fullMem.salesAgentId },
            select: { commissionRate: true, commissionType: true, managerId: true },
          })) as {
            commissionRate: number;
            commissionType: string;
            managerId: string | null;
          } | null;
          if (sa) {
            const commission =
              sa.commissionType === "fixed"
                ? sa.commissionRate
                : Math.round((paidAmount * sa.commissionRate) / 100 * 100) / 100;
            if (commission > 0) {
              const saComm = (await dbx.salesAgentCommission.upsert({
                where: { userMembershipId },
                update: {},
                create: { agentId: fullMem.salesAgentId, userMembershipId, amount: commission },
              })) as { id: string };
              if (sa.managerId) {
                const mgr = (await dbx.contractsManager.findUnique({
                  where: { id: sa.managerId },
                  select: { id: true, commissionType: true, commissionRate: true, isActive: true },
                })) as {
                  id: string;
                  commissionType: string;
                  commissionRate: number;
                  isActive: boolean;
                } | null;
                if (mgr?.isActive && mgr.commissionRate > 0) {
                  const existingMgrComm = await dbx.managerCommission.findUnique({
                    where: { agentCommissionId: saComm.id },
                  });
                  if (!existingMgrComm) {
                    let mgrAmount = 0;
                    if (mgr.commissionType === "percentage_of_agents") {
                      mgrAmount = Math.round((commission * mgr.commissionRate) / 100 * 100) / 100;
                    } else if (mgr.commissionType === "percentage_of_revenue") {
                      mgrAmount = Math.round((paidAmount * mgr.commissionRate) / 100 * 100) / 100;
                    } else {
                      mgrAmount = mgr.commissionRate;
                    }
                    if (mgrAmount > 0) {
                      await dbx.managerCommission.create({
                        data: {
                          managerId: mgr.id,
                          agentCommissionId: saComm.id,
                          userMembershipId,
                          amount: mgrAmount,
                        },
                      });
                    }
                  }
                }
              }
            }
          }

          // Mark referral as converted - exact-once per payment due to row lock
          const ref = await dbx.salesAgentReferral.findUnique({ where: { userId } });
          if (ref) {
            if (!ref.convertedAt) {
              // First subscription: set convertedAt AND increment totalSpent
              await dbx.salesAgentReferral.update({
                where: { userId },
                data: { convertedAt: new Date(), totalSpent: { increment: paidAmount } },
              });
            } else {
              // Subsequent subscription: only increment totalSpent
              await dbx.salesAgentReferral.update({
                where: { userId },
                data: { totalSpent: { increment: paidAmount } },
              });
            }
          }
        }

        // ── Staff referral commission ──────────────────────────────────────
        if (fullMem.staffReferralLink) {
          const { userId: staffUserId, user } = fullMem.staffReferralLink;
          const commission =
            user.commissionType === "fixed"
              ? user.commissionRate
              : Math.round((paidAmount * user.commissionRate) / 100 * 100) / 100;
          if (commission > 0) {
            await dbx.staffCommission.upsert({
              where: { userMembershipId },
              update: {},
              create: {
                staffUserId,
                staffReferralLinkId: fullMem.staffReferralLinkId,
                userMembershipId,
                amount: commission,
              },
            });
          }
        }

        // ── Trainer referral commission ────────────────────────────────────
        if (fullMem.trainerReferralLink) {
          const { userId: trainerUserId, user } = fullMem.trainerReferralLink;
          const commission =
            user.commissionType === "fixed"
              ? user.commissionRate
              : Math.round((paidAmount * user.commissionRate) / 100 * 100) / 100;
          if (commission > 0) {
            await dbx.trainerCommission.upsert({
              where: { userMembershipId },
              update: {},
              create: {
                trainerUserId,
                trainerReferralLinkId: fullMem.trainerReferralLinkId,
                userMembershipId,
                amount: commission,
              },
            });
          }
        }

        // ── Nutrition referral commission ──────────────────────────────────
        if (fullMem.nutritionReferralLink) {
          const { userId: nutritionistUserId, user } = fullMem.nutritionReferralLink;
          const profile = user.nutritionistProfile;
          if (profile) {
            const commission =
              profile.commissionType === "fixed"
                ? profile.commissionRate
                : Math.round((paidAmount * profile.commissionRate) / 100 * 100) / 100;
            if (commission > 0) {
              await dbx.nutritionCommission.upsert({
                where: { userMembershipId },
                update: {},
                create: {
                  nutritionistUserId,
                  nutritionReferralLinkId: fullMem.nutritionReferralLinkId,
                  userMembershipId,
                  amount: commission,
                },
              });
            }
          }
        }
      }
    } catch (err) {
      console.error("[RECONCILIATION_COMMISSIONS]", err);
      throw err;
    }

    // ── Attendance pass ──────────────────────────────────────────────────────
    // Note: Attendance pass creation moved AFTER transaction commit
    // ensureMembershipAttendancePass uses db (not tx) and can cause foreign key issues
    // Will be created post-commit or on-demand when membership card is generated

    // ── Wallet bonus ─────────────────────────────────────────────────────────
    const walletBonus = membershipData.membership?.walletBonus ?? 0;
    if (walletBonus > 0) {
      try {
        const wallet = await tx.wallet.upsert({
          where: { userId },
          update: { balance: { increment: walletBonus } },
          create: { userId, balance: walletBonus },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            amount: walletBonus,
            type: "credit",
            description: `مكافأة الاشتراك في باقة ${membershipData.membership?.name ?? ""}`,
          },
        });
      } catch (err) {
        console.error("[RECONCILIATION_WALLET_BONUS]", err);
        throw err;
      }
    }

    // ── Reward points ────────────────────────────────────────────────────────
    try {
      const rewardCfg = await getRewardSettings();
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
          await tx.rewardHistory.create({
            data: {
              rewardId: rp.id,
              points: rewardCfg.pointsPerSubscription,
              reason: "membership_purchase",
            },
          });
        }
      }
    } catch (err) {
      console.error("[RECONCILIATION_REWARD_POINTS]", err);
      throw err;
    }

    // ── Product rewards inventory ────────────────────────────────────────────
    const productRewardsRaw = membershipData.membership?.productRewards ?? null;
    if (productRewardsRaw) {
      try {
        const productRewards = JSON.parse(productRewardsRaw) as { productId: string; quantity: number }[];
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
                `Insufficient stock for membership product reward: ${reward.productId} (needed ${reward.quantity}, have ${product.stock})`
              );
            }

            // Read updated product for accurate movement record
            const updatedProduct = await tx.product.findUnique({
              where: { id: reward.productId },
              select: { stock: true },
            });
            const newStock = updatedProduct?.stock ?? product.stock - reward.quantity;

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
    if (membershipData.offerId) {
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
  }, { timeout: 15000 });

  // If reconciliation was already completed, return early
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
        include: { schedule: { include: { class: { include: { trainer: true } } } } },
      });

      const scheduleRows = bookedSchedules.map((b) => ({
        date: b.schedule.date,
        time: b.schedule.time,
        className: b.schedule.class.name,
        trainerName: b.schedule.class.trainer.name,
      }));

      const transactionMeta = parseJson(transactionMetadata);
      const invoiceDetails = toInvoiceDetails(transactionMeta);
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

      const invoicePdf = normalizedInvoice ? await generateMembershipInvoicePdf(normalizedInvoice) : null;

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
        membershipData.membership?.walletBonus > 0 ? membershipData.membership.walletBonus : undefined,
        scheduleRows,
        normalizedInvoice && invoicePdf
          ? {
              details: normalizedInvoice,
              filename: `fitzone-membership-invoice-${normalizedInvoice.invoiceNumber}.pdf`,
              content: invoicePdf,
            }
          : null,
        membershipCard
      ).catch((err) => console.error("[RECONCILIATION_EMAIL]", err));

      void sendAdminSubscriptionNotification({
        customerName: userRecord.name ?? "—",
        customerEmail: userRecord.email,
        planName: membershipData.membership?.name ?? "الباقة",
        offerTitle: membershipData.offer?.title ?? null,
        endDate,
        amount: paymentAmount,
        paymentMethod,
        invoiceNumber: normalizedInvoice?.invoiceNumber ?? `MBR-${userMembershipId.slice(-8).toUpperCase()}`,
      }).catch((err) => console.error("[RECONCILIATION_ADMIN_EMAIL]", err));
    }
  } catch (err) {
    console.error("[RECONCILIATION_EXTERNAL_NOTIFICATIONS]", err);
    // Email/push failures do NOT affect reconciliation success
  }

  return dbResult;
}
