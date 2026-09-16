import { describe, expect, it } from "vitest";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function calculateManagerPartnerCommission(input: {
  partnerCommissionAmount: number;
  managerCommissionType: string;
  managerCommissionRate: number;
}) {
  if (input.managerCommissionType === "percentage_of_partner") {
    return round2(
      (input.partnerCommissionAmount * input.managerCommissionRate) / 100,
    );
  }

  return input.managerCommissionRate;
}

describe("manager-partner commission", () => {
  it("uses actual PartnerCommission amount, not customer's discounted paid amount", () => {
    // Membership/listed commission base = 333
    // Partner = 10% => actual PartnerCommission = 33.30
    // Customer may have paid only 300 after another discount.
    const actualPartnerCommission = 33.3;

    const managerCommission = calculateManagerPartnerCommission({
      partnerCommissionAmount: actualPartnerCommission,
      managerCommissionType: "percentage_of_partner",
      managerCommissionRate: 10,
    });

    expect(managerCommission).toBe(3.33);

    // This is the historical bug result and must NOT be used.
    const wrongAmountFromCustomerPaid = round2((300 * 10 / 100) * 10 / 100);
    expect(wrongAmountFromCustomerPaid).toBe(3);
    expect(managerCommission).not.toBe(wrongAmountFromCustomerPaid);
  });

  it("supports percentage manager on fixed partner commission", () => {
    const managerCommission = calculateManagerPartnerCommission({
      partnerCommissionAmount: 50,
      managerCommissionType: "percentage_of_partner",
      managerCommissionRate: 10,
    });

    expect(managerCommission).toBe(5);
  });

  it("keeps fixed manager commission unchanged", () => {
    const managerCommission = calculateManagerPartnerCommission({
      partnerCommissionAmount: 33.3,
      managerCommissionType: "fixed",
      managerCommissionRate: 7.5,
    });

    expect(managerCommission).toBe(7.5);
  });

  it("rounds percentage_of_partner to two decimals", () => {
    const managerCommission = calculateManagerPartnerCommission({
      partnerCommissionAmount: 16.65,
      managerCommissionType: "percentage_of_partner",
      managerCommissionRate: 10,
    });

    expect(managerCommission).toBe(1.67);
  });
});
