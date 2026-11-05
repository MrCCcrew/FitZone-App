import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  sendMail: vi.fn(),
  createTransport: vi.fn(),
  safety: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: m.createTransport,
  },
}));

vi.mock("@/lib/staging-safety", () => ({
  assertExternalSideEffectsAllowed: m.safety,
}));

import { sendVerificationEmail } from "@/lib/email";

describe("verification email SMTP observability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.createTransport.mockReturnValue({ sendMail: m.sendMail });
  });

  it("returns true and logs only safe SMTP acceptance metadata", async () => {
    m.sendMail.mockResolvedValue({
      accepted: ["customer@gmail.com"],
      rejected: [],
      messageId: "<safe-id@fitzoneland.com>",
      response: "250 2.0.0 Ok: queued as queue-id",
    });

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await sendVerificationEmail(
      "customer@gmail.com",
      "Customer Name",
      "123456",
    );

    expect(result).toBe(true);
    expect(infoSpy).toHaveBeenCalledWith(
      "[EMAIL_VERIFY_DELIVERY]",
      {
        domain: "gmail.com",
        accepted: 1,
        rejected: 0,
        messageIdPresent: true,
        smtpResponseCode: "250",
        acceptedBySmtp: true,
      },
    );

    const logged = JSON.stringify(infoSpy.mock.calls);
    expect(logged).not.toContain("customer@gmail.com");
    expect(logged).not.toContain("123456");
    infoSpy.mockRestore();
  });

  it("returns false when SMTP resolves but rejects the recipient", async () => {
    m.sendMail.mockResolvedValue({
      accepted: [],
      rejected: ["customer@gmail.com"],
      messageId: "<safe-id@fitzoneland.com>",
      response: "550 5.1.1 recipient rejected",
    });

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await sendVerificationEmail(
      "customer@gmail.com",
      "Customer Name",
      "123456",
    );

    expect(result).toBe(false);
    expect(infoSpy).toHaveBeenCalledWith(
      "[EMAIL_VERIFY_DELIVERY]",
      expect.objectContaining({
        domain: "gmail.com",
        accepted: 0,
        rejected: 1,
        smtpResponseCode: "550",
        acceptedBySmtp: false,
      }),
    );
    infoSpy.mockRestore();
  });

  it("sanitizes SMTP exceptions and never logs recipient or verification code", async () => {
    const error = Object.assign(
      new Error("550 customer@gmail.com rejected code 123456"),
      {
        code: "EENVELOPE",
        command: "RCPT TO",
        responseCode: 550,
      },
    );

    m.sendMail.mockRejectedValue(error);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendVerificationEmail(
      "customer@gmail.com",
      "Customer Name",
      "123456",
    );

    expect(result).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      "[EMAIL_VERIFY_ERROR]",
      {
        domain: "gmail.com",
        name: "Error",
        code: "EENVELOPE",
        command: "RCPT TO",
        responseCode: "550",
      },
    );

    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).not.toContain("customer@gmail.com");
    expect(logged).not.toContain("123456");
    expect(logged).not.toContain("rejected code");
    errorSpy.mockRestore();
  });
});
