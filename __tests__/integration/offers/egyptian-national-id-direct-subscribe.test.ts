import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

const raw = process.env.DATABASE_URL;
if (!raw) throw Error("REFUSING: isolated DATABASE_URL missing");
const url = new URL(raw);
if (
  process.env.APP_ENV !== "test" ||
  process.env.NODE_ENV !== "test" ||
  process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL ||
  url.protocol !== "mysql:" ||
  url.hostname !== "127.0.0.1" ||
  url.port !== "3306" ||
  decodeURIComponent(url.username) !== "fitzone_test_user" ||
  url.pathname !== "/fitzone_test"
) throw Error("REFUSING: fitzone_test isolation required");

const mocks = vi.hoisted(() => ({
  getCurrentAppUser: vi.fn(),
  cleanupExpiredPendingMembershipsForUser: vi.fn(),
  findScheduleReplaceablePendingMembershipCheckoutTx: vi.fn(),
  maybeRenewPendingMembershipCheckout: vi.fn(),
  createPaymentTransaction: vi.fn(),
}));
vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser: mocks.getCurrentAppUser,
}));
vi.mock("@/lib/payments/pending-membership-cleanup", () => ({
  cleanupExpiredPendingMembershipsForUser: mocks.cleanupExpiredPendingMembershipsForUser,
  findScheduleReplaceablePendingMembershipCheckoutTx: mocks.findScheduleReplaceablePendingMembershipCheckoutTx,
}));
vi.mock("@/lib/payments/membership-paymob-renewal-handoff", () => ({
  maybeRenewPendingMembershipCheckout: mocks.maybeRenewPendingMembershipCheckout,
}));
vi.mock("@/lib/membership-lifecycle-lock", () => ({
  lockMembershipLifecycleUserTx: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/reward-settings", () => ({
  getRewardSettings: vi.fn().mockResolvedValue({
    pointValueEGP: 1,
    pointsPerSubscription: 0,
  }),
  calcTier: vi.fn(),
}));
vi.mock("@/lib/analytics/checkout-events", () => ({
  recordCheckoutStarted: vi.fn(),
}));
vi.mock("@/lib/payments/service", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/payments/service")>(),
  createPaymentTransaction: mocks.createPaymentTransaction,
}));

const db = new PrismaClient();
const marker = `TEST-STUDENT-DIRECT-${Date.now()}-${Math.random().toString(36).slice(2)}`;
let userId = "";
let offerId = "";
let membershipId = "";
let subscribe: (req: Request) => Promise<Response>;

function syntheticId(date: string): string {
  const [year, month, day] = date.split("-");
  return (Number(year) < 2000 ? "2" : "3") +
    year.slice(2) + month + day + "01" + "12345";
}
async function attempt(egyptianNationalId?: string) {
  const response = await subscribe(new Request("http://localhost/api/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      offerId,
      membershipId: null,
      scheduleIds: [],
      paymentMethod: "paymob",
      ...(egyptianNationalId === undefined ? {} : { egyptianNationalId }),
    }),
  }));
  return { status: response.status, body: await response.json() };
}
async function assertNoFinancialOrBookingEffects() {
  expect(await db.userMembership.count({ where: { userId } })).toBe(0);
  expect(await db.booking.count({ where: { userId } })).toBe(0);
  expect(await db.paymentTransaction.count({ where: { userId } })).toBe(0);
  expect((await db.offer.findUniqueOrThrow({
    where: { id: offerId },
    select: { currentSubscribers: true, offerBoxReservedCount: true },
  }))).toMatchObject({ currentSubscribers: 0, offerBoxReservedCount: 0 });
  expect(mocks.createPaymentTransaction).not.toHaveBeenCalled();
  // STUDENT_PRE_PAYMENT_BOUNDARY_REGRESSION
  expect(mocks.cleanupExpiredPendingMembershipsForUser).not.toHaveBeenCalled();
  expect(mocks.findScheduleReplaceablePendingMembershipCheckoutTx).not.toHaveBeenCalled();
  expect(mocks.maybeRenewPendingMembershipCheckout).not.toHaveBeenCalled();
}
beforeAll(async () => {
  const actual = await db.$queryRaw<Array<{ name: string }>>`SELECT DATABASE() AS name`;
  expect(actual[0]?.name).toBe("fitzone_test");
  const user = await db.user.create({
    data: {
      name: marker,
      email: `${marker.toLowerCase()}@test.local`,
      emailVerified: new Date(),
      birthDate: new Date("2008-01-01T00:00:00.000Z"), // account DOB is eligible (18 years); ID decides
      role: "member",
      isActive: true,
    },
  });
  userId = user.id;
  const membership = await db.membership.create({
    data: {
      name: `${marker}-MEMBERSHIP`,
      price: 100,
      priceAfter: 100,
      duration: 30,
      features: "[]",
      isActive: true,
      kind: "subscription",
    },
  });
  membershipId = membership.id;

  const offer = await db.offer.create({
    data: {
      title: marker,
      type: "special",
      discount: 0,
      specialPrice: 90,
      membershipId: membership.id,
      expiresAt: new Date("2027-12-31T23:59:59.000Z"),
      isActive: true,
      requiresBirthDate: true,
      requiresEgyptianNationalId: true,
      minAgeYears: 13,
      maxAgeYears: 25,
      currentSubscribers: 0,
      maxSubscribers: 10,
      offerBoxEnabled: false,
    },
  });
  offerId = offer.id;
  const route = await import("@/app/api/subscribe/route");
  subscribe = route.POST;
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentAppUser.mockResolvedValue({ id: userId });
  mocks.cleanupExpiredPendingMembershipsForUser.mockResolvedValue(undefined);
  mocks.findScheduleReplaceablePendingMembershipCheckoutTx.mockResolvedValue(null);
  mocks.maybeRenewPendingMembershipCheckout.mockResolvedValue({ kind: "none" });
  mocks.createPaymentTransaction.mockImplementation(() => {
    throw Error("FORBIDDEN_EXTERNAL_PAYMENT_FOR_REJECTED_NATIONAL_ID");
  });
});
afterAll(async () => {
  try {
    if (userId) {
      await db.paymentTransaction.deleteMany({ where: { userId } });
      await db.notification.deleteMany({ where: { userId } });
      await db.booking.deleteMany({ where: { userId } });
      await db.userMembership.deleteMany({ where: { userId } });
    }
    if (offerId) await db.offer.deleteMany({ where: { id: offerId } });
    if (membershipId) await db.membership.deleteMany({ where: { id: membershipId } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
  } finally {
    await db.$disconnect();
  }
});

describe("direct /api/subscribe student Egyptian-ID security integration", () => {
  for (const internalOnly of [false, true]) {
    it(`commercial economic ownership internalOnly=${internalOnly}`, async () => {
      vi.stubEnv("FITZONE_TEST_DIRECT_COMMERCIAL_CHECKOUT", "1");
      const { paymobPaymentProvider } = await import("@/lib/payments/providers/paymob");
      const { updatePaymentTransactionStatus } = await import("@/lib/payments/service");
      const { GET: getReceipt } = await import("@/app/api/offer-box/purchases/[purchaseId]/receipt/route");
      const originalPlan=await db.membership.findUniqueOrThrow({where:{id:membershipId}});
      const stamp=`${marker}-${internalOnly ? "INTERNAL" : "MIXED"}`;
      const trainer=await db.trainer.create({data:{name:stamp,specialty:"fitness",bio:"economic fixture",isActive:true}});
      const gymClass=await db.class.create({data:{name:stamp,trainerId:trainer.id,type:"fitness",duration:60,intensity:"medium",maxSpots:10,price:100,isActive:true}});
      const date=new Date(Date.now()+2*86400000);date.setUTCHours(0,0,0,0);
      const schedule=await db.schedule.create({data:{classId:gymClass.id,date,time:"12:00",availableSpots:10,isActive:true}});
      const discount=await db.discountCode.create({data:{code:`ECON-${schedule.id}`.toUpperCase(),type:"fixed",value:10,maxUses:1,scope:"subscriptions",isActive:true}});
      const staff=await db.user.create({data:{name:stamp,email:`${schedule.id}@econ.test.local`,role:"staff",isActive:true,commissionRate:10,commissionType:"percentage"}});
      const link=await db.staffReferralLink.create({data:{userId:staff.id,token:`ECON-${schedule.id}`.toUpperCase(),createdAt:new Date("2000-01-01T00:00:00Z")}});
      const checkoutSpy=vi.spyOn(paymobPaymentProvider,"createCheckout").mockImplementation(async input=>{
        expect(input.amount).toBe(60);
        return {provider:"paymob",status:"pending",providerReference:`pi_econ_${schedule.id}`,checkoutUrl:`https://accept.paymob.com/unifiedcheckout/?fixture=${schedule.id}`,expiresAt:new Date(input.membershipHoldExpiresAt!.getTime()-1000),payload:{providerMode:"paymob_unified_checkout",intentionId:`pi_econ_${schedule.id}`,intentionOrderId:"1234567"}};
      });
      const verifySpy=vi.spyOn(paymobPaymentProvider,"verifyTransaction").mockResolvedValue({status:"paid"});
      try {
        await db.membership.update({where:{id:membershipId},data:{kind:"package",duration:7,sessionsCount:1,price:100,priceAfter:100,walletBonus:0,classSessions:JSON.stringify([{classId:gymClass.id}])}});
        await db.user.update({where:{id:userId},data:{pendingStaffRef:link.token}});
        await db.wallet.upsert({where:{userId},create:{userId,balance:70,referralBalance:20},update:{balance:70,referralBalance:20}});
        await db.rewardPoints.upsert({where:{userId},create:{userId,points:100},update:{points:100}});
        const attemptId=`economic-${schedule.id}`;
        const request=()=>new Request("http://localhost/api/subscribe",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({membershipId,scheduleIds:[schedule.id],paymentMethod:"paymob",commercialAttemptId:attemptId,discountCode:discount.code,walletDeduct:internalOnly?50:20,pointsDeduct:internalOnly?40:10})});
        const first=await subscribe(request()); const body=await first.json();
        expect(first.status,JSON.stringify(body)).toBe(200);
        expect(body.commercialCheckout).toBe(true);
        const purchase=await db.offerBoxPurchase.findUniqueOrThrow({where:{id:body.purchaseId}});
        const payment=await db.paymentTransaction.findUniqueOrThrow({where:{id:body.transactionId}});
        expect(payment.amount).toBe(internalOnly?0:60);
        expect(payment.provider).toBe(internalOnly?"manual":"paymob");
        expect(purchase.redeemedUserMembershipId).toBeNull();
        const split=JSON.parse(purchase.offerSnapshot).directConsideration;
        expect(split).toMatchObject({totalMinor:9000,externalMinor:internalOnly?0:6000,walletMinor:internalOnly?5000:2000,pointsMinor:internalOnly?4000:1000});
        expect(await db.wallet.findUniqueOrThrow({where:{userId}})).toMatchObject({balance:internalOnly?20:50,referralBalance:20});
        expect(await db.rewardPoints.findUniqueOrThrow({where:{userId}})).toMatchObject({points:internalOnly?60:90});
        expect(await db.discountCodeUsage.findUniqueOrThrow({where:{id:purchase.id}})).toMatchObject({userId,membershipId:null,discountCodeId:discount.id,discountAmount:10});
        expect((await db.discountCode.findUniqueOrThrow({where:{id:discount.id}})).usedCount).toBe(1);
        if(!internalOnly){
          expect(purchase.status).toBe("pending_payment");
          expect(await db.staffCommission.count({where:{offerBoxPurchaseId:purchase.id}})).toBe(0);
          expect(await db.journal.count({where:{referenceType:"OfferBoxPurchase",referenceId:purchase.id}})).toBe(0);
        }
        const retry=await subscribe(request());const replay=await retry.json();
        expect(retry.status,JSON.stringify(replay)).toBe(200);
        expect(replay.purchaseId).toBe(purchase.id);expect(replay.transactionId).toBe(payment.id);
        expect(await db.wallet.findUniqueOrThrow({where:{userId}})).toMatchObject({balance:internalOnly?20:50,referralBalance:20});
        expect(await db.rewardPoints.findUniqueOrThrow({where:{userId}})).toMatchObject({points:internalOnly?60:90});
        expect(checkoutSpy).toHaveBeenCalledTimes(internalOnly?0:1);
        if(!internalOnly){
          await db.user.update({where:{id:staff.id},data:{commissionRate:99}});
          await updatePaymentTransactionStatus(payment.id,"paid");
          await updatePaymentTransactionStatus(payment.id,"paid");
          expect(verifySpy).toHaveBeenCalledTimes(2);
          expect(await db.staffCommission.findUniqueOrThrow({where:{offerBoxPurchaseId:purchase.id}})).toMatchObject({staffUserId:staff.id,userMembershipId:null,amount:6,status:"earned"});
        } else { expect(verifySpy).not.toHaveBeenCalled(); }
        expect(await db.offerBoxPurchase.findUniqueOrThrow({where:{id:purchase.id}})).toMatchObject({status:"redeemed",redeemedUserMembershipId:null});
        expect(await db.offerBoxEntitlement.count({where:{purchaseId:purchase.id,status:"active"}})).toBe(1);
        expect(await db.userMembership.count({where:{userId}})).toBe(0);
        expect(await db.booking.count({where:{userId,scheduleId:schedule.id,status:"confirmed",userMembershipId:null}})).toBe(1);
        expect((await db.schedule.findUniqueOrThrow({where:{id:schedule.id}})).availableSpots).toBe(9);
        const journal=await db.journal.findUniqueOrThrow({where:{referenceType_referenceId:{referenceType:"OfferBoxPurchase",referenceId:purchase.id}},include:{entries:{include:{account:true}}}});
        const amounts=Object.fromEntries(journal.entries.map(e=>[e.account.code,{debit:Number(e.debit),credit:Number(e.credit)}]));
        expect(amounts["4020"]).toEqual({debit:0,credit:90});
        expect(amounts["2020"]).toEqual({debit:internalOnly?50:20,credit:0});
        expect(amounts["2030"]).toEqual({debit:internalOnly?40:10,credit:0});
        if(internalOnly) expect(amounts["1030"]).toBeUndefined(); else expect(amounts["1030"]).toEqual({debit:60,credit:0});
        const receipt=await getReceipt(new Request("http://localhost/receipt"),{params:Promise.resolve({purchaseId:purchase.id})});
        expect(receipt.status).toBe(200);expect(await receipt.text()).toContain("90.00");
        expect(await db.user.findUniqueOrThrow({where:{id:userId}})).toMatchObject({pendingStaffRef:null});
        console.info(`ECONOMIC_OWNERSHIP=${internalOnly?"INTERNAL_ONLY":"MIXED"}_PASS`);
      } finally {
        checkoutSpy.mockRestore();verifySpy.mockRestore();vi.unstubAllEnvs();
        const purchases=await db.offerBoxPurchase.findMany({where:{userId},select:{id:true}});
        const ids=purchases.map(p=>p.id);
        await db.staffCommission.deleteMany({where:{offerBoxPurchaseId:{in:ids}}});
        await db.journal.deleteMany({where:{referenceType:"OfferBoxPurchase",referenceId:{in:ids}}});
        await db.booking.deleteMany({where:{userId,offerBoxEntitlementId:{not:null}}});
        await db.offerBoxEntitlement.deleteMany({where:{userId}});
        await db.offerBoxPurchase.deleteMany({where:{userId}});
        await db.paymentTransaction.deleteMany({where:{userId,purpose:"offer_box"}});
        await db.discountCodeUsage.deleteMany({where:{discountCodeId:discount.id,userId}});
        await db.discountCode.delete({where:{id:discount.id}});
        await db.walletTransaction.deleteMany({where:{wallet:{userId}}});await db.wallet.deleteMany({where:{userId}});
        await db.rewardHistory.deleteMany({where:{reward:{userId}}});await db.rewardPoints.deleteMany({where:{userId}});
        await db.notification.deleteMany({where:{userId}});
        await db.user.update({where:{id:userId},data:{pendingStaffRef:null}});
        await db.staffReferralLink.delete({where:{id:link.id}});await db.user.delete({where:{id:staff.id}});
        await db.schedule.delete({where:{id:schedule.id}});await db.class.delete({where:{id:gymClass.id}});await db.trainer.delete({where:{id:trainer.id}});
        await db.membership.update({where:{id:membershipId},data:{kind:originalPlan.kind,duration:originalPlan.duration,sessionsCount:originalPlan.sessionsCount,classSessions:originalPlan.classSessions,price:originalPlan.price,priceAfter:originalPlan.priceAfter,walletBonus:originalPlan.walletBonus}});
      }
    },60000);
  }

  for (const commercialKind of ["package", "direct_offer"] as const) {
    it(`independent public checkout ${commercialKind}: hold, replay and paid activation`, async () => {
      vi.stubEnv(
        "FITZONE_TEST_DIRECT_COMMERCIAL_CHECKOUT",
        "1",
      );

      const { paymobPaymentProvider } =
        await import("@/lib/payments/providers/paymob");

      const { updatePaymentTransactionStatus } =
        await import("@/lib/payments/service");

      const originalPlan =
        await db.membership.findUniqueOrThrow({
          where: { id: membershipId },
        });

      const originalOffer =
        await db.offer.findUniqueOrThrow({
          where: { id: offerId },
        });

      const trainer = await db.trainer.create({
        data: {
          name: `${marker}-TRAINER-${commercialKind}`,
          specialty: "fitness",
          bio: "Commercial route acceptance",
          isActive: true,
        },
      });

      const gymClass = await db.class.create({
        data: {
          name: `${marker}-CLASS-${commercialKind}`,
          trainerId: trainer.id,
          type: "fitness",
          duration: 60,
          intensity: "medium",
          maxSpots: 10,
          price: 100,
          isActive: true,
        },
      });

      const date = new Date(
        Date.now() + 2 * 86400000,
      );

      date.setUTCHours(0, 0, 0, 0);

      const schedule = await db.schedule.create({
        data: {
          classId: gymClass.id,
          date,
          time: "12:00",
          availableSpots: 0,
          isActive: true,
        },
      });

      const checkoutSpy = vi.spyOn(
        paymobPaymentProvider,
        "createCheckout",
      ).mockImplementation(async (input) => {
        if (!input.membershipHoldExpiresAt) {
          throw new Error("HOLD_REQUIRED");
        }

        return {
          provider: "paymob",
          status: "pending",
          providerReference: `pi_route_${schedule.id}`,
          checkoutUrl:
            `https://accept.paymob.com/unifiedcheckout/?fixture=${schedule.id}`,
          expiresAt: new Date(
            input.membershipHoldExpiresAt.getTime() - 1000,
          ),
          payload: {
            providerMode: "paymob_unified_checkout",
            intentionId: `pi_route_${schedule.id}`,
            intentionOrderId: "1234567",
          },
        };
      });

      const verifySpy = vi.spyOn(
        paymobPaymentProvider,
        "verifyTransaction",
      ).mockResolvedValue({
        status: "paid",
      });

      try {
        await db.membership.update({
          where: { id: membershipId },
          data: {
            kind: "package",
            duration: 7,
            sessionsCount: 1,
            classSessions: JSON.stringify([
              { classId: gymClass.id },
            ]),
          },
        });

        await db.offer.update({
          where: { id: offerId },
          data: {
            durationDays: 7,
            sessionsCount: 1,
          },
        });

        await db.offerAllowedClass.create({
          data: {
            offerId,
            classId: gymClass.id,
          },
        });

        const nationalId = syntheticId("2008-10-10");

        const request = () => new Request(
          "http://localhost/api/subscribe",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              membershipId:
                commercialKind === "package"
                  ? membershipId
                  : null,

              offerId:
                commercialKind === "direct_offer"
                  ? offerId
                  : null,

              ...(commercialKind === "direct_offer"
                ? { egyptianNationalId: nationalId }
                : {}),

              scheduleIds: [schedule.id],
              paymentMethod: "paymob",
            }),
          },
        );

        // A sold-out class cannot create a payable
        // independent commercial purchase.

        const full = await subscribe(request());

        expect(full.status).toBe(400);
        expect(checkoutSpy).not.toHaveBeenCalled();

        expect(
          await db.offerBoxPurchase.count({
            where: { userId },
          }),
        ).toBe(0);

        expect(
          await db.offerBoxEntitlement.count({
            where: { userId },
          }),
        ).toBe(0);

        await db.schedule.update({
          where: { id: schedule.id },
          data: { availableSpots: 10 },
        });

        const response = await subscribe(request());
        const body = await response.json();

        expect(
          response.status,
          JSON.stringify(body),
        ).toBe(200);

        expect(body).toMatchObject({
          success: true,
          commercialCheckout: true,
          subscriptionId: null,
          resumedPending: false,
        });

        const purchase =
          await db.offerBoxPurchase.findUniqueOrThrow({
            where: { id: body.purchaseId },
          });

        const heldRight =
          await db.offerBoxEntitlement.findUniqueOrThrow({
            where: { purchaseId: purchase.id },
          });

        expect(purchase).toMatchObject({
          userId,
          commercialKind,
          status: "pending_payment",
          paymentTransactionId: body.transactionId,
          redeemedUserMembershipId: null,
          priceSnapshot:
            commercialKind === "package" ? 100 : 90,
        });

        expect(heldRight.status)
          .toBe("pending_payment");

        expect(purchase.offerSnapshot)
          .not.toContain(nationalId);

        const frozen = JSON.parse(
          purchase.offerSnapshot,
        );

        expect(
          JSON.parse(
            frozen.economics.commissionSnapshot,
          ).version,
        ).toBe(1);

        const heldBookings =
          await db.booking.findMany({
            where: {
              offerBoxEntitlementId: heldRight.id,
            },
          });

        expect(heldBookings).toHaveLength(1);

        expect(heldBookings[0]).toMatchObject({
          scheduleId: schedule.id,
          userMembershipId: null,
          offerBoxEntitlementId: heldRight.id,
          status: "confirmed",
          paidAmount: 0,
        });

        expect(
          await db.schedule.findUniqueOrThrow({
            where: { id: schedule.id },
          }),
        ).toMatchObject({
          availableSpots: 9,
        });

        expect(
          await db.userMembership.count({
            where: { userId },
          }),
        ).toBe(0);

        if (commercialKind === "direct_offer") {
          expect(
            await db.offer.findUniqueOrThrow({
              where: { id: offerId },
            }),
          ).toMatchObject({
            currentSubscribers: 0,
            offerBoxReservedCount: 1,
          });
        }

        // Retry the exact same API request.

        const retryResponse =
          await subscribe(request());

        const retry = await retryResponse.json();

        expect(
          retryResponse.status,
          JSON.stringify(retry),
        ).toBe(200);

        expect(retry).toMatchObject({
          purchaseId: purchase.id,
          transactionId: body.transactionId,
          checkoutUrl: body.checkoutUrl,
          resumedPending: true,
        });

        expect(checkoutSpy).toHaveBeenCalledTimes(1);

        expect(
          await db.paymentTransaction.count({
            where: { userId },
          }),
        ).toBe(1);

        // Authoritative central verifier is mocked
        // at the provider boundary, not bypassed.

        await updatePaymentTransactionStatus(
          body.transactionId,
          "paid",
        );

        const activated =
          await db.offerBoxPurchase.findUniqueOrThrow({
            where: { id: purchase.id },
          });

        expect(activated).toMatchObject({
          status: "redeemed",
          redeemedUserMembershipId: null,
        });

        expect(
          await db.offerBoxEntitlement.findUniqueOrThrow({
            where: { id: heldRight.id },
          }),
        ).toMatchObject({
          status: "active",
          purchaseId: purchase.id,
          startDate: heldRight.startDate,
          endDate: heldRight.endDate,
          totalSessions: 1,
        });

        const activeBookings =
          await db.booking.findMany({
            where: {
              offerBoxEntitlementId: heldRight.id,
            },
          });

        expect(activeBookings).toHaveLength(1);
        expect(activeBookings[0].id)
          .toBe(heldBookings[0].id);

        expect(
          await db.schedule.findUniqueOrThrow({
            where: { id: schedule.id },
          }),
        ).toMatchObject({
          availableSpots: 9,
        });

        expect(
          await db.journal.findUniqueOrThrow({
            where: {
              referenceType_referenceId: {
                referenceType: "OfferBoxPurchase",
                referenceId: purchase.id,
              },
            },
          }),
        ).toMatchObject({
          status: "posted",
        });

        // Repeated paid webhook / verification.

        await updatePaymentTransactionStatus(
          body.transactionId,
          "paid",
        );

        expect(verifySpy).toHaveBeenCalledTimes(2);

        expect(
          await db.offerBoxEntitlement.count({
            where: { purchaseId: purchase.id },
          }),
        ).toBe(1);

        expect(
          await db.booking.findMany({
            where: {
              offerBoxEntitlementId: heldRight.id,
            },
          }),
        ).toEqual(activeBookings);

        expect(
          await db.journal.count({
            where: {
              referenceType: "OfferBoxPurchase",
              referenceId: purchase.id,
            },
          }),
        ).toBe(1);

        expect(
          await db.userMembership.count({
            where: { userId },
          }),
        ).toBe(0);

        if (commercialKind === "direct_offer") {
          expect(
            await db.offer.findUniqueOrThrow({
              where: { id: offerId },
            }),
          ).toMatchObject({
            currentSubscribers: 1,
            offerBoxReservedCount: 0,
          });
        }

        console.info(
          `DIRECT_ROUTE_KIND=${commercialKind}`,
        );
        console.info("FULL_SCHEDULE_PREPAYMENT=BLOCKED");
        console.info("BOOKING_HOLD_BEFORE_PAYMENT=PASS");
        console.info("SAME_CHECKOUT_REPLAY=PASS");
        console.info("SAME_RIGHT_ACTIVATED=PASS");
        console.info("SAME_BOOKING_PRESERVED=PASS");
        console.info("REVENUE_EXACT_ONCE=PASS");

      } finally {

        checkoutSpy.mockRestore();
        verifySpy.mockRestore();
        vi.unstubAllEnvs();

        // Every mutation below is scoped to this
        // integration test's dedicated customer.

        const purchases =
          await db.offerBoxPurchase.findMany({
            where: { userId },
            select: { id: true },
          });

        await db.journal.deleteMany({
          where: {
            referenceType: "OfferBoxPurchase",
            referenceId: {
              in: purchases.map((p) => p.id),
            },
          },
        });

        await db.booking.deleteMany({
          where: {
            userId,
            offerBoxEntitlementId: {
              not: null,
            },
          },
        });

        await db.offerBoxEntitlement.deleteMany({
          where: { userId },
        });

        await db.offerBoxPurchase.deleteMany({
          where: { userId },
        });

        await db.paymentTransaction.deleteMany({
          where: {
            userId,
            purpose: "offer_box",
          },
        });

        await db.notification.deleteMany({
          where: { userId },
        });

        await db.offerAllowedClass.deleteMany({
          where: {
            offerId,
            classId: gymClass.id,
          },
        });

        await db.schedule.delete({
          where: { id: schedule.id },
        });

        await db.class.delete({
          where: { id: gymClass.id },
        });

        await db.trainer.delete({
          where: { id: trainer.id },
        });

        await db.membership.update({
          where: { id: membershipId },
          data: {
            kind: originalPlan.kind,
            duration: originalPlan.duration,
            sessionsCount: originalPlan.sessionsCount,
            classSessions: originalPlan.classSessions,
          },
        });

        await db.offer.update({
          where: { id: offerId },
          data: {
            durationDays: originalOffer.durationDays,
            sessionsCount: originalOffer.sessionsCount,
            currentSubscribers:
              originalOffer.currentSubscribers,
            offerBoxReservedCount:
              originalOffer.offerBoxReservedCount,
          },
        });
      }
    }, 60000);
  }

  it("requires ID despite a valid account birth date and produces no side effects", async () => {
    const result = await attempt();
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("EGYPTIAN_NATIONAL_ID_REQUIRED");
    await assertNoFinancialOrBookingEffects();
  });
  it("rejects malformed national ID without payment or membership writes", async () => {
    const result = await attempt("12345678901234");
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("EGYPTIAN_NATIONAL_ID_INVALID");
    await assertNoFinancialOrBookingEffects();
  });
  it("rejects a structurally valid but underage national ID despite eligible account DOB", async () => {
    const result = await attempt(syntheticId("2020-10-10"));
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("AGE_NOT_ELIGIBLE");
    await assertNoFinancialOrBookingEffects();
  });
  it("rejects an overage national ID regardless of account DOB", async () => {
    const result = await attempt(syntheticId("1990-10-10"));
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("AGE_NOT_ELIGIBLE");
    await assertNoFinancialOrBookingEffects();
  });
  it("keeps ambiguous previous Paymob payment blocked without starting another payment", async () => {
    mocks.maybeRenewPendingMembershipCheckout.mockResolvedValueOnce({
      kind: "blocked",
    });

    const result = await attempt(syntheticId("2008-10-10"));

    expect(result.status).toBe(409);
    expect(result.body.error).toContain("محاولة الدفع السابقة");
    expect(mocks.cleanupExpiredPendingMembershipsForUser).toHaveBeenCalledOnce();
    expect(mocks.maybeRenewPendingMembershipCheckout).toHaveBeenCalledOnce();
    expect(mocks.createPaymentTransaction).not.toHaveBeenCalled();

    expect(await db.userMembership.count({ where: { userId } })).toBe(0);
    expect(await db.paymentTransaction.count({ where: { userId } })).toBe(0);
    expect(await db.booking.count({ where: { userId } })).toBe(0);
  });

  it("returns the existing mocked Paymob renewal without creating a duplicate", async () => {
    const existing = {
      kind: "resumed",
      membershipId: "existing-pending-membership",
      transactionId: "existing-payment-transaction",
      checkoutUrl: "https://checkout.example.test/existing",
      endDate: new Date("2026-11-01T00:00:00.000Z"),
    };

    mocks.maybeRenewPendingMembershipCheckout.mockResolvedValueOnce(existing);

    const result = await attempt(syntheticId("2008-10-10"));

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.resumedPending).toBe(true);
    expect(result.body.transactionId).toBe(existing.transactionId);
    expect(result.body.subscriptionId).toBe(existing.membershipId);
    expect(result.body.checkoutUrl).toBe(existing.checkoutUrl);
    expect(mocks.maybeRenewPendingMembershipCheckout).toHaveBeenCalledOnce();
    expect(mocks.createPaymentTransaction).not.toHaveBeenCalled();

    expect(await db.userMembership.count({ where: { userId } })).toBe(0);
    expect(await db.paymentTransaction.count({ where: { userId } })).toBe(0);
    expect(await db.booking.count({ where: { userId } })).toBe(0);
  });

  it("accepts an eligible ID, locks 90 EGP pending checkout, without persisting the ID", async () => {
    const nationalId = syntheticId("2008-10-10"); // synthetic data ONLY
    mocks.createPaymentTransaction.mockImplementationOnce(async (input: {
      userId: string;
      amount: number;
      membershipId?: string | null;
      provider?: string | null;
      purpose: string;
      businessUnit?: string;
      metadata?: unknown;
    }) => {
      expect(input.amount).toBe(90);
      expect(input.userId).toBe(userId);
      expect(input.provider).toBe("paymob");
      expect(input.purpose).toBe("membership");
      expect(input.businessUnit).toBe("club");
      expect(input.metadata ? JSON.stringify(input.metadata) : "").not.toContain(nationalId);
      const t = await db.paymentTransaction.create({
        data: {
          userId: input.userId,
          membershipId: input.membershipId ?? null,
          amount: input.amount,
          provider: "paymob",
          purpose: "membership",
          businessUnit: "club",
          paymentMethod: "offer",
          status: "pending",
          currency: "EGP",
          metadata: JSON.stringify(input.metadata ?? {}),
        },
      });
      return { id: t.id, checkoutUrl: "https://checkout.example.test/mock" };
    });

    const result = await attempt(nationalId);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.success).toBe(true);
    expect(typeof result.body.subscriptionId).toBe("string");
    expect(typeof result.body.transactionId).toBe("string");
    expect(result.body.checkoutUrl).toBe("https://checkout.example.test/mock");
    expect(mocks.createPaymentTransaction).toHaveBeenCalledTimes(1);

    const held = await db.userMembership.findUniqueOrThrow({
      where: { id: result.body.subscriptionId },
    });
    expect(held).toMatchObject({
      userId, membershipId, offerId,
      status: "pending_payment",
      paymentAmount: 90,
      snapshotFinalPrice: 90,
      activatedAt: null,
    });
    expect(held.pendingExpiresAt).not.toBeNull();
    const holdMinutes = ((held.pendingExpiresAt?.getTime() ?? 0) - Date.now()) / 60000;
    expect(holdMinutes).toBeGreaterThan(58);
    expect(holdMinutes).toBeLessThanOrEqual(60);

    const frozen = JSON.parse(held.offerSnapshot ?? "{}");
    expect(frozen.ageEligibility).toMatchObject({
      verificationMethod: "egyptian_national_id",
      ageYearsAtPurchase: 18,
    });
    expect(held.offerSnapshot).not.toContain(nationalId);
    const tx = await db.paymentTransaction.findUniqueOrThrow({
      where: { id: result.body.transactionId },
    });
    expect(tx.amount).toBe(90);
    expect(tx.status).toBe("pending");
    expect(tx.metadata).not.toContain(nationalId);
    expect(await db.booking.count({ where: { userId } })).toBe(0);
    expect(await db.userMembership.count({ where: { userId, status: "active" } })).toBe(0);
    expect((await db.offer.findUniqueOrThrow({ where: { id: offerId } })).currentSubscribers).toBe(0);
  }, 20000);

  // P0_REGULAR_PURCHASE_SNAPSHOT_R44
  it("P0 regular subscription freezes 90 days when catalog becomes 180", async () => {
    await db.membership.update({
      where: { id: membershipId },
      data: { duration: 90 },
    });

    try {
      mocks.createPaymentTransaction.mockImplementationOnce(async (input: {
        userId: string;
        amount: number;
        membershipId?: string | null;
        metadata?: unknown;
      }) => {
        expect(input.userId).toBe(userId);
        expect(input.amount).toBe(100);

        const payment = await db.paymentTransaction.create({
          data: {
            userId: input.userId,
            membershipId: input.membershipId ?? null,
            amount: input.amount,
            provider: "paymob",
            purpose: "membership",
            businessUnit: "club",
            paymentMethod: "membership",
            status: "pending",
            currency: "EGP",
            metadata: JSON.stringify(input.metadata ?? {}),
          },
        });

        return {
          id: payment.id,
          checkoutUrl: "https://checkout.example.test/mock",
        };
      });

      const response = await subscribe(new Request(
        "http://localhost/api/subscribe",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            membershipId,
            offerId: null,
            scheduleIds: [],
            paymentMethod: "paymob",
          }),
        },
      ));

      const body = await response.json();
      expect(response.status, JSON.stringify(body)).toBe(200);
      expect(body.success).toBe(true);
      expect(typeof body.subscriptionId).toBe("string");

      const purchased = await db.userMembership.findUniqueOrThrow({
        where: { id: body.subscriptionId },
      });

      expect(purchased).toMatchObject({
        userId,
        membershipId,
        offerId: null,
        status: "pending_payment",
        snapshotDurationDays: 90,
        snapshotOriginalPrice: 100,
        snapshotFinalPrice: 100,
      });

      await db.membership.update({
        where: { id: membershipId },
        data: { duration: 180 },
      });

      const afterPlanEdit = await db.userMembership.findUniqueOrThrow({
        where: { id: body.subscriptionId },
      });

      expect(afterPlanEdit.snapshotDurationDays).toBe(90);
      expect(afterPlanEdit.snapshotOriginalPrice).toBe(100);
      expect(afterPlanEdit.snapshotFinalPrice).toBe(100);
      expect(afterPlanEdit.status).toBe("pending_payment");
      expect(mocks.createPaymentTransaction).toHaveBeenCalledTimes(1);
    } finally {
      await db.membership.update({
        where: { id: membershipId },
        data: { duration: 30 },
      });
    }
  }, 20000);

});
