import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { postWalletTopupJournal } from "@/lib/accounting-service";

describe("wallet top-up GL journal", () => {
  const refs: string[] = [];

  beforeAll(async () => {
    const accounts = await db.gLAccount.findMany({
      where: { code: { in: ["1030", "2020"] } },
      select: { code: true },
    });

    expect(accounts.map((a) => a.code).sort()).toEqual(["1030", "2020"]);
  });

  afterAll(async () => {
    if (refs.length === 0) return;

    await db.journal.deleteMany({
      where: {
        referenceType: "WalletTopup",
        referenceId: { in: refs },
      },
    });
  });

  it("posts Paymob clearing debit and wallet liability credit", async () => {
    const ref = `test-wallet-topup-${Date.now()}`;
    refs.push(ref);

    await db.$transaction((tx) =>
      postWalletTopupJournal(tx, ref, 325.75),
    );

    const journal = await db.journal.findUnique({
      where: {
        referenceType_referenceId: {
          referenceType: "WalletTopup",
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
    expect(journal!.entries).toHaveLength(2);

    const paymob = journal!.entries.find(
      (entry) => entry.account.code === "1030",
    );
    const wallet = journal!.entries.find(
      (entry) => entry.account.code === "2020",
    );

    expect(Number(paymob!.debit)).toBe(325.75);
    expect(Number(paymob!.credit)).toBe(0);

    expect(Number(wallet!.debit)).toBe(0);
    expect(Number(wallet!.credit)).toBe(325.75);
  });

  it("is idempotent for the same payment transaction", async () => {
    const ref = `test-wallet-topup-idem-${Date.now()}`;
    refs.push(ref);

    const first = await db.$transaction((tx) =>
      postWalletTopupJournal(tx, ref, 100),
    );

    const second = await db.$transaction((tx) =>
      postWalletTopupJournal(tx, ref, 100),
    );

    expect(first).toBeTruthy();
    expect(second).toBeNull();

    const count = await db.journal.count({
      where: {
        referenceType: "WalletTopup",
        referenceId: ref,
      },
    });

    expect(count).toBe(1);
  });

  it("does not create a journal for zero amount", async () => {
    const ref = `test-wallet-topup-zero-${Date.now()}`;
    refs.push(ref);

    const result = await db.$transaction((tx) =>
      postWalletTopupJournal(tx, ref, 0),
    );

    expect(result).toBeNull();

    const count = await db.journal.count({
      where: {
        referenceType: "WalletTopup",
        referenceId: ref,
      },
    });

    expect(count).toBe(0);
  });
});
