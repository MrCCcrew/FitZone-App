import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "src/app/FitzoneApp.tsx"), "utf8",
);
const cart = source.slice(source.indexOf("const CartPage = ("));

describe("R19 guest checkout UI contract", () => {
  it("requires phone verification and restricts guests to COD", () => {
    expect(cart).toContain("R19_GUEST_STORE_CHECKOUT_UI_V1");
    expect(cart).toContain('fetch("/api/store/guest-otp/send"');
    expect(cart).toContain('fetch("/api/store/guest-otp/check"');
    expect(cart).toContain('guestVerifiedPhone !== address.phone.trim()');
    expect(cart).toContain('payMethod !== "cod"');
    expect(cart).toContain('guestCheckout ? methods.filter((method) => method.id === "cod") : methods');
  });

  it("does not send guest wallet or loyalty deductions", () => {
    expect(cart).toContain("!guestCheckout && walletDiscount > 0");
    expect(cart).toContain("!guestCheckout && pointsToDeduct > 0");
    expect(cart).toContain("if (res.status === 401 && !guestCheckout)");
  });
  it("R19_B18_REGISTERED_AND_GUEST_SUCCESS_GUARD", () => {
    expect(cart).toContain("!guestCheckout && (");
    expect(cart).toContain('window.location.href = "/account?tab=orders"');
    expect(cart).toContain(
      'return guestCheckout ? methods.filter((method) => method.id === "cod") : methods',
    );
    expect(cart).toContain('if (res.status === 401 && !guestCheckout)');
    expect(cart).toContain('!guestCheckout && walletDiscount > 0');
    expect(cart).toContain('!guestCheckout && pointsToDeduct > 0');
  });
});