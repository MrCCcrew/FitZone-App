import { describe, expect, it, vi } from "vitest";
import { expireEndedActiveMembershipsTx } from "@/lib/membership-lifecycle";

describe("membership lifecycle expiration", () => {
  it("atomically expires ended active memberships and their active passes", async () => {
    const now = new Date("2026-08-16T00:00:00.000Z");

    const tx = {
      userMembership: {
        findMany: vi.fn().mockResolvedValue([
          { id: "membership-1" },
          { id: "membership-2" },
        ]),

        updateMany: vi.fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
      },

      attendancePass: {
        updateMany: vi.fn()
          .mockResolvedValueOnce({ count: 1 }),
      },
    };

    const result = await expireEndedActiveMembershipsTx(
      tx,
      now,
    );

    expect(result).toEqual({
      found: 2,
      expired: 1,
      skipped: 1,
      attendancePassesExpired: 1,
    });

    expect(
      tx.attendancePass.updateMany,
    ).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when there are no ended active memberships", async () => {
    const tx = {
      userMembership: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn(),
      },

      attendancePass: {
        updateMany: vi.fn(),
      },
    };

    const result = await expireEndedActiveMembershipsTx(
      tx,
      new Date(),
    );

    expect(result).toEqual({
      found: 0,
      expired: 0,
      skipped: 0,
      attendancePassesExpired: 0,
    });

    expect(
      tx.userMembership.updateMany,
    ).not.toHaveBeenCalled();

    expect(
      tx.attendancePass.updateMany,
    ).not.toHaveBeenCalled();
  });
});
