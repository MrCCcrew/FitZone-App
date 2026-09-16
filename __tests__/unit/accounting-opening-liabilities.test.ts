import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { postOpeningLiabilitiesJournal } from "@/lib/accounting-service";

describe("accounting opening liabilities journal", () => {
  const refs: string[] = [];

  afterAll(async () => {
    if (refs.length === 0) return;

    await db.journal.deleteMany({
      where: {
        referenceType: "AccountingCutover",
        referenceId: { in: refs },
      },
    });
  });

  it("posts wallet and reward point opening liabilities against opening equity", async () => {
    const ref = `test-opening-${Date.now()}`;
    refs.push(ref);

    await db.$transaction((tx) =>
      postOpeningLiabilitiesJournal(tx, ref, {
        walletLiability: 5,
        rewardPointsLiability: 183,
      }),
    );

    const journal = await db.journal.findUnique({
      where: {
        referenceType_referenceId: {
          referenceType: "AccountingCutover",
          referenceId: ref,
        },
      },
      include: {
        entries: {
          include: { account: true },
        },
      },
    });

    expect(journal).toBeTruthy();

    const byCode = Object.fromEntries(
      journal!.entries.map((e) => [
        e.account.code,
        {
          debit: Number(e.debit),
          credit: Number(e.credit),
        },
      ]),
    );

    expect(byCode["3010"]).toEqual({ debit: 188, credit: 0 });
    expect(byCode["2020"]).toEqual({ debit: 0, credit: 5 });
    expect(byCode["2030"]).toEqual({ debit: 0, credit: 183 });
  });

  it("is idempotent for the same cutover reference", async () => {
    const ref = `test-opening-idem-${Date.now()}`;
    refs.push(ref);

    const first = await db.$transaction((tx) =>
      postOpeningLiabilitiesJournal(tx, ref, {
        walletLiability: 5,
        rewardPointsLiability: 183,
      }),
    );

    const second = await db.$transaction((tx) =>
      postOpeningLiabilitiesJournal(tx, ref, {
        walletLiability: 5,
        rewardPointsLiability: 183,
      }),
    );

    expect(first).toBeTruthy();
    expect(second).toBeNull();

    expect(
      await db.journal.count({
        where: {
          referenceType: "AccountingCutover",
          referenceId: ref,
        },
      }),
    ).toBe(1);
  });

  it("does not create a zero opening journal", async () => {
    const ref = `test-opening-zero-${Date.now()}`;
    refs.push(ref);

    const result = await db.$transaction((tx) =>
      postOpeningLiabilitiesJournal(tx, ref, {
        walletLiability: 0,
        rewardPointsLiability: 0,
      }),
    );

    expect(result).toBeNull();
  });
});
