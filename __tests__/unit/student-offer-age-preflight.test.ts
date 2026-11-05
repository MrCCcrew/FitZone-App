import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  findOffer: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser: mocks.currentUser,
}));

vi.mock("@/lib/db", () => ({
  db: {
    offer: {
      findUnique: mocks.findOffer,
    },
  },
}));

let post: (request: Request) => Promise<Response>;

const eligibleOffer = {
  isActive: true,
  expiresAt: new Date("2027-12-31T23:59:59Z"),
  requiresEgyptianNationalId: true,
  minAgeYears: 13,
  maxAgeYears: 25,
};

function nationalId(year: number): string {
  const century = year < 2000 ? "2" : "3";
  return (
    century +
    String(year).slice(-2) +
    "0101" +
    "01" +
    "12345"
  );
}

async function request(
  egyptianNationalId?: string,
  offerId = "student-offer",
) {
  const response = await post(
    new Request(
      "http://localhost/api/offers/student-age-check",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          offerId,
          egyptianNationalId,
        }),
      },
    ),
  );

  return {
    status: response.status,
    body: await response.json(),
  };
}

beforeAll(async () => {
  post = (
    await import(
      "@/app/api/offers/student-age-check/route"
    )
  ).POST;
});

beforeEach(() => {
  vi.resetAllMocks();

  mocks.currentUser.mockResolvedValue({
    id: "test-student",
  });

  mocks.findOffer.mockResolvedValue({
    ...eligibleOffer,
  });
});

describe("Student offer age preflight", () => {
  it("accepts eligible age without creating payment", async () => {
    const result = await request(nationalId(2008));

    expect(result.status).toBe(200);
    expect(result.body.eligible).toBe(true);
    expect(result.body).not.toHaveProperty(
      "egyptianNationalId",
    );
    expect(mocks.findOffer).toHaveBeenCalledOnce();
  });

  it("rejects younger students politely", async () => {
    const result = await request(nationalId(2020));

    expect(result.status).toBe(400);
    expect(result.body.eligible).toBe(false);
    expect(result.body.code).toBe("AGE_NOT_ELIGIBLE");
    expect(result.body.error).toContain("13");
  });

  it("rejects students above maximum age", async () => {
    const result = await request(nationalId(1980));

    expect(result.status).toBe(400);
    expect(result.body.code).toBe("AGE_NOT_ELIGIBLE");
  });

  it("rejects invalid national IDs", async () => {
    const result = await request("12345678901234");

    expect(result.status).toBe(400);
    expect(result.body.code).toBe(
      "EGYPTIAN_NATIONAL_ID_INVALID",
    );
  });

  it("rejects missing national IDs", async () => {
    const result = await request();

    expect(result.status).toBe(400);
    expect(result.body.code).toBe(
      "EGYPTIAN_NATIONAL_ID_REQUIRED",
    );
  });

  it("does not impose the ID rule on ordinary offers", async () => {
    mocks.findOffer.mockResolvedValue({
      ...eligibleOffer,
      requiresEgyptianNationalId: false,
    });

    const result = await request(nationalId(2008));

    expect(result.status).toBe(400);
    expect(result.body.eligible).toBe(false);
  });

  it("rejects expired student offers", async () => {
    mocks.findOffer.mockResolvedValue({
      ...eligibleOffer,
      expiresAt: new Date("2020-01-01"),
    });

    const result = await request(nationalId(2008));

    expect(result.status).toBe(400);
  });

  it("requires authentication", async () => {
    mocks.currentUser.mockResolvedValue(null);

    const result = await request(nationalId(2008));

    expect(result.status).toBe(401);
    expect(mocks.findOffer).not.toHaveBeenCalled();
  });

  it("opens ID modal before payment request", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/FitzoneApp.tsx"),
      "utf8",
    );

    const start = source.indexOf(
      "  const handleSubscribe = async (",
    );
    const end = source.indexOf(
      "  const saveDobAndRetrySubscription = async () => {",
      start,
    );

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const section = source.slice(start, end);

    const ageGate = section.indexOf(
      "plan.requiresEgyptianNationalId === true",
    );
    const paymentStart = section.indexOf(
      "    setSubscribing(",
    );

    expect(ageGate).toBeGreaterThan(-1);
    expect(paymentStart).toBeGreaterThan(ageGate);
    expect(section).toContain("!egyptianNationalId");
    expect(section).toContain("setDobModal({");
  });
});
