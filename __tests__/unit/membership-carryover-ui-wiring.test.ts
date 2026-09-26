import {
  describe,
  expect,
  it,
} from "vitest";
import fs from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return fs.readFileSync(
    path.join(
      process.cwd(),
      relativePath,
    ),
    "utf8",
  );
}

describe(
  "membership carryover customer UI wiring",
  () => {
    it(
      "runs the server carryover preflight before creating a new membership",
      () => {
        const source = read(
          "src/app/api/subscribe/route.ts",
        );

        const previewIndex =
          source.indexOf(
            "previewMembershipSessionCarryoverTx(",
          );

        const createIndex =
          source.indexOf(
            "const subscription = await tx.userMembership.create(",
          );

        const blockingIndex =
          source.indexOf(
            "isBlockingMembershipCarryoverReason(",
            previewIndex,
          );

        expect(
          previewIndex,
        ).toBeGreaterThanOrEqual(0);

        expect(
          blockingIndex,
        ).toBeGreaterThan(
          previewIndex,
        );

        expect(
          createIndex,
        ).toBeGreaterThan(
          blockingIndex,
        );

        const gate =
          source.slice(
            previewIndex,
            createIndex,
          );

        expect(gate).toContain(
          "لم يتم إنشاء اشتراك جديد أو بدء عملية دفع",
        );
      },
    );

    it(
      "shows authoritative preview values and blocks a known unsafe checkout",
      () => {
        const source = read(
          "src/app/FitzoneApp.tsx",
        );

        expect(source).toContain(
          "Your remaining sessions will carry over",
        );

        expect(source).toContain(
          "carryoverPreview.baseSessions",
        );

        expect(source).toContain(
          "carryoverPreview.carryoverSessions",
        );

        expect(source).toContain(
          "carryoverPreview.expectedTotalSessions",
        );

        expect(source).toContain(
          "disabled={carryoverPreview?.blocking === true}",
        );
      },
    );

    it(
      "rechecks Friend Offer frozen carryover before payment and wires both customer surfaces",
      () => {
        const route = read(
          "src/app/api/friend-offers/checkout/route.ts",
        );
        const publicUi = read(
          "src/app/FitzoneApp.tsx",
        );
        const accountUi = read(
          "src/app/account/AccountClient.tsx",
        );

        const previewIndex = route.indexOf(
          "carryover = await previewFriendOfferCarryoverForCustomer(",
        );
        const blockingIndex = route.indexOf(
          "if (carryover.blocking)",
          previewIndex,
        );
        const paymentIndex = route.indexOf(
          "const transaction = await createPaymentTransaction({",
        );

        expect(previewIndex).toBeGreaterThanOrEqual(0);
        expect(blockingIndex).toBeGreaterThan(previewIndex);
        expect(paymentIndex).toBeGreaterThan(blockingIndex);

        expect(publicUi).toContain(
          "/api/friend-offers/checkout?token=",
        );
        expect(publicUi).toContain(
          "friendCarryoverPreview?.blocking === true",
        );
        expect(publicUi).toContain(
          "شروط المجموعة المجمدة",
        );

        expect(accountUi).toContain(
          "/api/friend-offers/checkout?token=",
        );
        expect(accountUi).toContain(
          "carryoverPreview.blocking",
        );
        expect(accountUi).toContain(
          "شروط المجموعة المجمدة",
        );
      },
    );

    it(
      "ignores stale checkout-options responses when the selected plan changes",
      () => {
        const source = read(
          "src/app/FitzoneApp.tsx",
        );

        const refIndex = source.indexOf(
          "const checkoutOptionsRequestSequenceRef = useRef(0);",
        );

        const openIndex = source.indexOf(
          "const openCheckoutPreview = (plan: PlanItem, scheduleIds: string[] = []) => {",
        );

        const sequenceIndex = source.indexOf(
          "++checkoutOptionsRequestSequenceRef.current;",
          openIndex,
        );

        const fetchIndex = source.indexOf(
          "/api/me/checkout-options",
          sequenceIndex,
        );

        const guardIndex = source.indexOf(
          "checkoutOptionsRequestSequence ===",
          fetchIndex,
        );

        const currentRefIndex = source.indexOf(
          "checkoutOptionsRequestSequenceRef.current",
          guardIndex,
        );

        const setterIndex = source.indexOf(
          "setSubCheckoutOptions(d);",
          currentRefIndex,
        );

        expect(refIndex).toBeGreaterThanOrEqual(0);
        expect(openIndex).toBeGreaterThan(refIndex);
        expect(sequenceIndex).toBeGreaterThan(openIndex);
        expect(fetchIndex).toBeGreaterThan(sequenceIndex);
        expect(guardIndex).toBeGreaterThan(fetchIndex);
        expect(currentRefIndex).toBeGreaterThan(guardIndex);
        expect(setterIndex).toBeGreaterThan(currentRefIndex);

        expect(source).not.toContain(
          "if (d) setSubCheckoutOptions(d);",
        );
      },
    );
    it(
      "shows only the persisted post-payment carryover result on verify",
      () => {
        const source = read(
          "src/app/payment/verify/page.tsx",
        );

        expect(source).toContain(
          "membershipCarryover.carryoverSessions > 0",
        );

        expect(source).toContain(
          "هذه هي النتيجة الفعلية بعد تفعيل الاشتراك على السيرفر.",
        );
      },
    );
  },
);
