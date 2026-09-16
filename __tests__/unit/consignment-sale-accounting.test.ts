import { describe, expect, it, vi } from "vitest";
import { postAllocatedSaleJournal } from "@/lib/accounting-service";

describe("postAllocatedSaleJournal", () => {
  it("credits owned inventory and consignment AP separately", async () => {
    const entries: any[] = [];

    const tx = {
      journal: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "journal-1",
        }),
      },

      gLAccount: {
        findUnique: vi.fn().mockImplementation(
          async ({ where }) => ({
            id: `account-${where.code}`,
          })
        ),
      },

      journalEntry: {
        create: vi.fn().mockImplementation(
          async ({ data }) => {
            entries.push(data);
            return {};
          }
        ),
      },
    };

    await postAllocatedSaleJournal(
      tx as any,
      "order-1",
      200,
      [
        {
          ownedCost: 50,
          consignmentCost: 40,
        },
      ],
      "cod"
    );

    const byAccount = new Map(
      entries.map((e) => [
        e.accountId,
        {
          debit: Number(e.debit),
          credit: Number(e.credit),
        },
      ])
    );

    expect(byAccount.get("account-1020"))
      .toEqual({ debit: 200, credit: 0 });

    expect(byAccount.get("account-4010"))
      .toEqual({ debit: 0, credit: 200 });

    expect(byAccount.get("account-5010"))
      .toEqual({ debit: 90, credit: 0 });

    expect(byAccount.get("account-1010"))
      .toEqual({ debit: 0, credit: 50 });

    expect(byAccount.get("account-2010"))
      .toEqual({ debit: 0, credit: 40 });
  });
});
