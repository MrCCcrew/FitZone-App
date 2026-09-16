import {
  afterAll,
  describe,
  expect,
  it,
} from "vitest";

import { db } from "@/lib/db";

import {
  postPromotionalPointsGrantJournal,
  postPromotionalWalletCreditJournal,
} from "@/lib/accounting-service";

describe("reward grant GL journals", () => {
  const refs: Array<{
    type: string;
    id: string;
  }> = [];

  afterAll(async () => {
    for (const ref of refs) {
      await db.journal.deleteMany({
        where: {
          referenceType: ref.type,
          referenceId: ref.id,
        },
      });
    }
  });

  it("posts promotional wallet credit as expense against wallet liability", async () => {
    const ref =
      `wallet-promo-${Date.now()}`;

    refs.push({
      type: "WalletTransaction",
      id: ref,
    });

    await db.$transaction((tx) =>
      postPromotionalWalletCreditJournal(
        tx,
        ref,
        50,
      ),
    );

    const journal =
      await db.journal.findUnique({
        where: {
          referenceType_referenceId: {
            referenceType:
              "WalletTransaction",
            referenceId: ref,
          },
        },
        include: {
          entries: {
            include: {
              account: true,
            },
          },
        },
      });

    expect(journal).toBeTruthy();

    const expense =
      journal!.entries.find(
        (e) =>
          e.account.code === "5020",
      );

    const liability =
      journal!.entries.find(
        (e) =>
          e.account.code === "2020",
      );

    expect(
      Number(expense!.debit),
    ).toBe(50);

    expect(
      Number(expense!.credit),
    ).toBe(0);

    expect(
      Number(liability!.debit),
    ).toBe(0);

    expect(
      Number(liability!.credit),
    ).toBe(50);
  });

  it("posts points grant using its EGP liability value", async () => {
    const ref =
      `points-promo-${Date.now()}`;

    refs.push({
      type: "RewardHistory",
      id: ref,
    });

    // 100 points × 0.05 EGP = 5 EGP liability
    await db.$transaction((tx) =>
      postPromotionalPointsGrantJournal(
        tx,
        ref,
        5,
      ),
    );

    const journal =
      await db.journal.findUnique({
        where: {
          referenceType_referenceId: {
            referenceType:
              "RewardHistory",
            referenceId: ref,
          },
        },
        include: {
          entries: {
            include: {
              account: true,
            },
          },
        },
      });

    expect(journal).toBeTruthy();

    const expense =
      journal!.entries.find(
        (e) =>
          e.account.code === "5020",
      );

    const liability =
      journal!.entries.find(
        (e) =>
          e.account.code === "2030",
      );

    expect(
      Number(expense!.debit),
    ).toBe(5);

    expect(
      Number(liability!.credit),
    ).toBe(5);
  });

  it("is idempotent for the same wallet transaction", async () => {
    const ref =
      `wallet-promo-idem-${Date.now()}`;

    refs.push({
      type: "WalletTransaction",
      id: ref,
    });

    const first =
      await db.$transaction((tx) =>
        postPromotionalWalletCreditJournal(
          tx,
          ref,
          25,
        ),
      );

    const second =
      await db.$transaction((tx) =>
        postPromotionalWalletCreditJournal(
          tx,
          ref,
          25,
        ),
      );

    expect(first).toBeTruthy();
    expect(second).toBeNull();

    expect(
      await db.journal.count({
        where: {
          referenceType:
            "WalletTransaction",
          referenceId: ref,
        },
      }),
    ).toBe(1);
  });

  it("is idempotent for the same reward history", async () => {
    const ref =
      `points-promo-idem-${Date.now()}`;

    refs.push({
      type: "RewardHistory",
      id: ref,
    });

    const first =
      await db.$transaction((tx) =>
        postPromotionalPointsGrantJournal(
          tx,
          ref,
          2.5,
        ),
      );

    const second =
      await db.$transaction((tx) =>
        postPromotionalPointsGrantJournal(
          tx,
          ref,
          2.5,
        ),
      );

    expect(first).toBeTruthy();
    expect(second).toBeNull();
  });

  it("does not create zero-value promotion journals", async () => {
    const walletRef =
      `wallet-zero-${Date.now()}`;

    const pointsRef =
      `points-zero-${Date.now()}`;

    const walletResult =
      await db.$transaction((tx) =>
        postPromotionalWalletCreditJournal(
          tx,
          walletRef,
          0,
        ),
      );

    const pointsResult =
      await db.$transaction((tx) =>
        postPromotionalPointsGrantJournal(
          tx,
          pointsRef,
          0,
        ),
      );

    expect(walletResult).toBeNull();
    expect(pointsResult).toBeNull();
  });
});
