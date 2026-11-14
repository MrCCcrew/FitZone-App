import { describe, expect, it, vi } from "vitest";

const proof = vi.hoisted(() => ({
  allowed: new Map<string, string>(),
  denied: new Set<string>(),
}));

vi.mock("@/lib/payments/registry", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/payments/registry")>();

  return {
    ...actual,
    getPaymentProvider: (key: string | null | undefined) => {
      const real = actual.getPaymentProvider(key);
      if (key !== "paymob" || !real) return real;

      return {
        ...real,
        verifyTransaction: async (
          tx: Parameters<typeof real.verifyTransaction>[0],
        ) => {
          let metadata: Record<string, unknown> = {};
          try {
            const parsed: unknown = JSON.parse(tx.metadata ?? "{}");
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
              metadata = parsed as Record<string, unknown>;
          } catch {
            // Fail closed.
          }

          const valid =
            !proof.denied.has(tx.id) &&
            proof.allowed.get(tx.id) === tx.externalReference &&
            tx.amount === 190 &&
            tx.currency === "EGP" &&
            metadata.source === "friend-offer" &&
            metadata.friendShareAmountMinor === 19000 &&
            typeof metadata.friendGroupId === "string" &&
            typeof metadata.friendParticipantId === "string";

          return valid
            ? {
                status: "paid" as const,
                message: "Isolated verified test proof",
                providerReference: tx.providerReference ?? null,
                externalReference: tx.externalReference,
                payload: { testOnly: true, verifiedPaymentId: tx.id },
              }
            : {
                status: "failed" as const,
                message: "TEST_ORDER_PROOF_REJECTED",
              };
        },
      };
    },
  };
});

vi.mock("@/lib/email", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...real,
    sendSubscriptionEmail: vi.fn().mockResolvedValue(true),
    sendAdminSubscriptionNotification: vi.fn().mockResolvedValue(true),
  };
});

import { db } from "@/lib/db";
import { updatePaymentTransactionStatus } from "@/lib/payments/service";
import { maybeFinalizeFriendOfferPayment } from "@/lib/payments/friend-offer-finalization";

describe("Independent Friend Offer: real MySQL financial settlement", { timeout: 90000 }, () => {
  it("requires paid proof, posts GL and frozen commissions once, and never creates memberships", async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");

    if (
      process.env.APP_ENV !== "test" ||
      process.env.NODE_ENV !== "test" ||
      process.env.FITZONE_R13_ISOLATED_INTEGRATION !== "1" ||
      process.env.ALLOW_EXTERNAL_SIDE_EFFECTS !== "false" ||
      url.protocol !== "mysql:" ||
      url.hostname !== "127.0.0.1" ||
      url.port !== "3306" ||
      decodeURIComponent(url.username) !== "fitzone_r13_user" ||
      decodeURIComponent(url.pathname) !== "/fitzone_final_release_r13_test" ||
      process.env.TEST_DATABASE_URL !== process.env.DATABASE_URL
    ) throw Error("UNSAFE_REAL_MYSQL_TEST_REFUSED");

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw Error("EXTERNAL_HTTP_FORBIDDEN_IN_TEST");
    }));

    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const userIds: string[] = [];
    const participantIds: string[] = [];
    const paymentIds: string[] = [];
    let membershipPlanId = "";
    let offerId = "";
    let configId = "";
    let groupId = "";

    try {
      for (let i = 0; i < 3; i++) {
        const user = await db.user.create({
          data: {
            email: `independent-friend-${i}-${unique}@example.test`,
            emailVerified: new Date(),
            name: `Independent Friend ${i}`,
          },
        });
        userIds.push(user.id);
      }

      const plan = await db.membership.create({
        data: {
          name: `Independent Test Plan ${unique}`,
          duration: 30,
          price: 570,
          walletBonus: 0,
          features: "[]",
        },
      });
      membershipPlanId = plan.id;

      const offer = await db.offer.create({
        data: {
          title: `Independent Friend Offer ${unique}`,
          membershipId: membershipPlanId,
          type: "special",
          discount: 0,
          specialPrice: 570,
          sessionsCount: 12,
          durationDays: 30,
          currentSubscribers: 0,
          maxSubscribers: 100,
          isActive: true,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      offerId = offer.id;

      const config = await db.friendOfferConfig.create({
        data: {
          offerId,
          requiredMembers: 3,
          inviteExpiryHours: 24,
          isActive: true,
        },
      });
      configId = config.id;

      const group = await db.friendOfferGroup.create({
        data: {
          configId,
          creatorUserId: userIds[0],
          inviteToken: `IF-${unique}`.toUpperCase(),
          status: "waiting",
          priceSnapshotMinor: 57000,
          offerTermsSnapshot: JSON.stringify({
            offerId,
            membershipId: membershipPlanId,
            title: offer.title,
            specialPrice: 570,
            priceSnapshotMinor: 57000,
            sessionsCount: 12,
            durationDays: 30,
            requiredMembers: 3,
          }),
          eligibilitySnapshot: "{}",
          individualInvitesEnabled: true,
          matchingEnabled: false,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      groupId = group.id;

      for (let i = 0; i < 3; i++) {
        const participant = await db.friendOfferParticipant.create({
          data: {
            groupId,
            userId: userIds[i],
            role: i === 0 ? "creator" : "invited",
            status: "checkout_started",
            shareAmountMinor: 19000,
            attributionSnapshot: "{}",
            independentCommissionSnapshot: JSON.stringify({
              version: 1,
              capturedAt: new Date().toISOString(),
              staff: {
                staffUserId: userIds[0],
                referralLinkId: `fixture-${unique}`,
                referralToken: `fixture-${unique}`,
                terms: { type: "fixed", rate: 5, baseAmount: 190 },
              },
            }),
          },
        });
        participantIds.push(participant.id);

        const payment = await db.paymentTransaction.create({
          data: {
            userId: userIds[i],
            offerId,
            membershipId: null,
            purpose: "membership",
            businessUnit: "club",
            provider: "paymob",
            amount: 190,
            currency: "EGP",
            status: "pending",
            paymentMethod: "paymob",
            externalReference: `independent-${i}-${unique}`,
            metadata: JSON.stringify({
              source: "friend-offer",
              friendGroupId: groupId,
              friendParticipantId: participant.id,
              friendInviteToken: group.inviteToken,
              friendShareAmountMinor: 19000,
            }),
          },
        });
        paymentIds.push(payment.id);
        if (!payment.externalReference) throw Error("TEST_REFERENCE_MISSING");
        proof.allowed.set(payment.id, payment.externalReference);

        await db.friendOfferParticipant.update({
          where: { id: participant.id },
          data: { paymentTransactionId: payment.id },
        });
      }

      // No entitlement, membership, revenue or commission from pending payments.
      expect(await db.friendOfferEntitlement.count({
        where: { participantId: { in: participantIds } },
      })).toBe(0);

      // Two paid shares are not enough to settle a three-person group.
      for (let i = 0; i < 2; i++) {
        await updatePaymentTransactionStatus(paymentIds[i], "paid", null);
        const result = await maybeFinalizeFriendOfferPayment(paymentIds[i]);
        expect(result.status).toBe("waiting");
      }

      expect(await db.friendOfferEntitlement.count({
        where: { participantId: { in: participantIds } },
      })).toBe(0);
      expect(await db.userMembership.count({
        where: { userId: { in: userIds }, offerId },
      })).toBe(0);
      console.info("INDEPENDENT_PARTIAL_PAYMENT_NO_RIGHTS=PASS");

      // Provider rejection must prevent the third share becoming paid.
      proof.denied.add(paymentIds[2]);
      await expect(
        updatePaymentTransactionStatus(paymentIds[2], "paid", null),
      ).rejects.toThrow();
      expect((await db.paymentTransaction.findUniqueOrThrow({
        where: { id: paymentIds[2] },
      })).status).not.toBe("paid");

      expect(await db.journal.count({
        where: { referenceType: "FriendOfferPayment", referenceId: { in: paymentIds } },
      })).toBe(0);
      console.info("INDEPENDENT_PAYMOB_PROOF_FAIL_CLOSED=PASS");

      proof.denied.delete(paymentIds[2]);
      await updatePaymentTransactionStatus(paymentIds[2], "paid", null);

      const completed = await maybeFinalizeFriendOfferPayment(paymentIds[2]);
      expect(completed.kind).toBe("friend_offer");
      expect(completed.status).toBe("completed");

      const rights = await db.friendOfferEntitlement.findMany({
        where: { participantId: { in: participantIds } },
      });
      expect(rights).toHaveLength(3);
      expect(rights.every(x => x.status === "active")).toBe(true);
      expect(new Set(rights.map(x => x.userId)).size).toBe(3);

      const participants = await db.friendOfferParticipant.findMany({
        where: { groupId },
      });
      expect(participants).toHaveLength(3);
      expect(participants.every(x =>
        x.status === "activated" && x.userMembershipId === null,
      )).toBe(true);

      const payments = await db.paymentTransaction.findMany({
        where: { id: { in: paymentIds } },
      });
      expect(payments.every(x => x.status === "paid" && x.membershipId === null)).toBe(true);

      expect(await db.userMembership.count({
        where: { userId: { in: userIds }, offerId },
      })).toBe(0);

      const journals = await db.journal.findMany({
        where: {
          referenceType: "FriendOfferPayment",
          referenceId: { in: paymentIds },
        },
        include: {
          entries: { include: { account: { select: { code: true } } } },
        },
      });
      expect(journals).toHaveLength(3);

      for (const journal of journals) {
        expect(journal.status).toBe("posted");
        expect(journal.entries).toHaveLength(2);
        expect(journal.entries.some(e =>
          e.account.code === "1030" &&
          Number(e.debit) === 190 && Number(e.credit) === 0,
        )).toBe(true);
        expect(journal.entries.some(e =>
          e.account.code === "4020" &&
          Number(e.credit) === 190 && Number(e.debit) === 0,
        )).toBe(true);
      }

      const commissions = await db.friendOfferCommission.findMany({
        where: { participantId: { in: participantIds } },
      });
      expect(commissions).toHaveLength(3);
      expect(commissions.every(x =>
        x.beneficiaryType === "staff" &&
        x.beneficiaryId === userIds[0] &&
        Number(x.amount) === 5 &&
        x.status === "earned",
      )).toBe(true);

      expect(commissions.reduce((sum, x) => sum + Number(x.amount), 0)).toBe(15);

      console.info("INDEPENDENT_THREE_RIGHTS_NO_MEMBERSHIP=PASS");
      console.info("INDEPENDENT_GL_570_EGP_EXACT_ONCE=PASS");
      console.info("INDEPENDENT_FROZEN_COMMISSION_15_EGP=PASS");

      for (const id of paymentIds) {
        const repeat = await maybeFinalizeFriendOfferPayment(id);
        expect(repeat.status).toBe("completed");
      }

      expect(await db.friendOfferEntitlement.count({
        where: { participantId: { in: participantIds } },
      })).toBe(3);
      expect(await db.journal.count({
        where: { referenceType: "FriendOfferPayment", referenceId: { in: paymentIds } },
      })).toBe(3);
      expect(await db.friendOfferCommission.count({
        where: { participantId: { in: participantIds } },
      })).toBe(3);
      console.info("INDEPENDENT_REPLAY_NO_DUPLICATE=PASS");
    } finally {
      // Only this test's generated identities; no global table cleanup.
      const journals = paymentIds.length
        ? await db.journal.findMany({
            where: {
              referenceType: "FriendOfferPayment",
              referenceId: { in: paymentIds },
            },
            select: { id: true },
          })
        : [];
      const journalIds = journals.map(x => x.id);

      if (journalIds.length) {
        await db.journalEntry.deleteMany({
          where: { journalId: { in: journalIds } },
        });
        await db.journal.deleteMany({
          where: { id: { in: journalIds } },
        });
      }

      if (participantIds.length) {
        await db.friendOfferCommission.deleteMany({
          where: { participantId: { in: participantIds } },
        });
        await db.friendOfferEntitlement.deleteMany({
          where: { participantId: { in: participantIds } },
        });
      }

      if (groupId) {
        await db.friendOfferParticipant.deleteMany({ where: { groupId } });
        await db.friendOfferGroup.deleteMany({ where: { id: groupId } });
      }
      if (paymentIds.length) {
        await db.paymentTransaction.deleteMany({ where: { id: { in: paymentIds } } });
      }
      if (configId) await db.friendOfferConfig.delete({ where: { id: configId } });
      if (offerId) await db.offer.delete({ where: { id: offerId } });
      if (membershipPlanId)
        await db.membership.delete({ where: { id: membershipPlanId } });
      if (userIds.length) {
        await db.notification.deleteMany({ where: { userId: { in: userIds } } });
        await db.user.deleteMany({ where: { id: { in: userIds } } });
      }

      proof.allowed.clear();
      proof.denied.clear();
      vi.unstubAllGlobals();
    }
  });
});
