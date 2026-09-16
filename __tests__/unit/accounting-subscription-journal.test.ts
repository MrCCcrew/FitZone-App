import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { postSubscriptionJournal } from "@/lib/accounting-service";

describe("subscription GL journal", () => {
  const refs: string[] = [];

  beforeAll(async () => {
    const requiredAccounts = ["1030", "2020", "2030", "4020"];

    const accounts = await db.gLAccount.findMany({
      where: { code: { in: requiredAccounts } },
      select: { code: true },
    });

    expect(accounts.map((a) => a.code).sort()).toEqual(
      requiredAccounts.slice().sort(),
    );
  });

  afterAll(async () => {
    if (refs.length === 0) return;

    const journals = await db.journal.findMany({
      where: {
        referenceType: "UserMembership",
        referenceId: { in: refs },
      },
      select: { id: true },
    });

    if (journals.length > 0) {
      await db.journal.deleteMany({
        where: { id: { in: journals.map((j) => j.id) } },
      });
    }
  });

  it("posts Paymob + wallet + points as one balanced subscription revenue journal", async () => {
    const membershipId = `test-sub-gl-mixed-${Date.now()}`;
    refs.push(membershipId);

    await db.$transaction(async (tx) => {
      await postSubscriptionJournal(tx, membershipId, {
        externalPaidAmount: 250,
        walletAmount: 200,
        pointsAmount: 50,
        externalPaymentAccount: "paymob",
      });
    });

    const journal = await db.journal.findUnique({
      where: {
        referenceType_referenceId: {
          referenceType: "UserMembership",
          referenceId: membershipId,
        },
      },
      include: {
        entries: {
          include: { account: true },
        },
      },
    });

    expect(journal).toBeTruthy();
    expect(journal!.status).toBe("posted");
    expect(journal!.entries).toHaveLength(4);

    const byCode = new Map(
      journal!.entries.map((entry) => [entry.account.code, entry]),
    );

    expect(Number(byCode.get("1030")?.debit)).toBe(250);
    expect(Number(byCode.get("2020")?.debit)).toBe(200);
    expect(Number(byCode.get("2030")?.debit)).toBe(50);
    expect(Number(byCode.get("4020")?.credit)).toBe(500);

    const debit = journal!.entries.reduce(
      (sum, entry) => sum + Number(entry.debit),
      0,
    );
    const credit = journal!.entries.reduce(
      (sum, entry) => sum + Number(entry.credit),
      0,
    );

    expect(Math.round(debit * 100)).toBe(Math.round(credit * 100));
  });

  it("is idempotent for the same membership", async () => {
    const membershipId = `test-sub-gl-idem-${Date.now()}`;
    refs.push(membershipId);

    const first = await db.$transaction((tx) =>
      postSubscriptionJournal(tx, membershipId, {
        externalPaidAmount: 300,
      }),
    );

    const second = await db.$transaction((tx) =>
      postSubscriptionJournal(tx, membershipId, {
        externalPaidAmount: 300,
      }),
    );

    expect(first).toBeTruthy();
    expect(second).toBeNull();

    const count = await db.journal.count({
      where: {
        referenceType: "UserMembership",
        referenceId: membershipId,
      },
    });

    expect(count).toBe(1);
  });

  it("posts a wallet-only membership without Paymob revenue", async () => {
    const membershipId = `test-sub-gl-wallet-${Date.now()}`;
    refs.push(membershipId);

    await db.$transaction((tx) =>
      postSubscriptionJournal(tx, membershipId, {
        walletAmount: 175.25,
      }),
    );

    const journal = await db.journal.findUnique({
      where: {
        referenceType_referenceId: {
          referenceType: "UserMembership",
          referenceId: membershipId,
        },
      },
      include: {
        entries: {
          include: { account: true },
        },
      },
    });

    expect(journal!.entries).toHaveLength(2);

    const wallet = journal!.entries.find(
      (entry) => entry.account.code === "2020",
    );
    const revenue = journal!.entries.find(
      (entry) => entry.account.code === "4020",
    );

    expect(Number(wallet!.debit)).toBe(175.25);
    expect(Number(revenue!.credit)).toBe(175.25);
  });

  it("does not create revenue for a genuinely zero-value membership", async () => {
    const membershipId = `test-sub-gl-free-${Date.now()}`;
    refs.push(membershipId);

    const result = await db.$transaction((tx) =>
      postSubscriptionJournal(tx, membershipId, {
        externalPaidAmount: 0,
        walletAmount: 0,
        pointsAmount: 0,
      }),
    );

    expect(result).toBeNull();

    expect(
      await db.journal.count({
        where: {
          referenceType: "UserMembership",
          referenceId: membershipId,
        },
      }),
    ).toBe(0);
  });
});
