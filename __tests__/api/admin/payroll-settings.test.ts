import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import { db } from "@/lib/db";

const mocks = vi.hoisted(() => ({
  requireAdminPermission: vi.fn(),
}));

vi.mock(
  "@/lib/admin-authorization-server",
  () => ({
    requireAdminPermission:
      mocks.requireAdminPermission,
  }),
);

import {
  GET,
  POST,
} from "@/app/api/admin/payroll-settings/route";

async function callGet(): Promise<Response> {
  const response = await GET();

  if (!response) {
    throw new Error("PAYROLL_SETTINGS_GET_NO_RESPONSE");
  }

  return response;
}

async function callPost(
  request: NextRequest,
): Promise<Response> {
  const response = await POST(request);

  if (!response) {
    throw new Error("PAYROLL_SETTINGS_POST_NO_RESPONSE");
  }

  return response;
}

type GuardOk = {
  session: {
    id: string;
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
    };
  };
  role: string;
};

const ADMIN_OK: GuardOk = {
  session: {
    id: "c10-api-test-admin",
    user: {
      id: "c10-api-test-admin",
      name: "C10 API Test",
      email: "c10-api-test@example.com",
      role: "admin",
    },
  },
  role: "admin",
};

const TEST_NORMAL_CODE =
  "C10_API_NORMAL_TEST";

const HEAD_CODE =
  "HEAD_COACH_OWNER";

const TEST_START =
  new Date("2098-01-01T00:00:00.000Z");

const TEST_END =
  new Date("2098-12-31T00:00:00.000Z");

let normalPositionId = "";
let headPositionId = "";
let createdHeadPosition = false;

function allow() {
  mocks.requireAdminPermission.mockResolvedValue(
    ADMIN_OK as never,
  );
}

function deny() {
  mocks.requireAdminPermission.mockResolvedValue(
    {
      error: NextResponse.json(
        { error: "Forbidden" },
        { status: 403 },
      ),
    } as never,
  );
}

function postRequest(
  body: Record<string, unknown>,
) {
  return new NextRequest(
    "http://localhost/api/admin/payroll-settings",
    {
      method: "POST",
      headers: {
        "content-type":
          "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

async function cleanupPolicies() {
  if (!normalPositionId && !headPositionId) {
    return;
  }

  await db.positionPayrollPolicy.deleteMany({
    where: {
      positionId: {
        in: [
          normalPositionId,
          headPositionId,
        ].filter(Boolean),
      },
      effectiveFrom: {
        gte: TEST_START,
        lte: TEST_END,
      },
    },
  });
}

beforeAll(async () => {
  await db.positionPayrollPolicy.deleteMany({
    where: {
      position: {
        code: TEST_NORMAL_CODE,
      },
    },
  });

  await db.position.deleteMany({
    where: {
      code: TEST_NORMAL_CODE,
    },
  });

  const normal =
    await db.position.create({
      data: {
        code: TEST_NORMAL_CODE,
        name: "C10 API Normal Test",
        nameEn: "C10 API Normal Test",
        sortOrder: 998,
        isActive: true,
      },
    });

  normalPositionId = normal.id;

  let head =
    await db.position.findUnique({
      where: {
        code: HEAD_CODE,
      },
    });

  if (!head) {
    head =
      await db.position.create({
        data: {
          code: HEAD_CODE,
          name: "هيد كوتش / المالك",
          nameEn:
            "Head Coach / Owner",
          sortOrder: 997,
          isActive: true,
        },
      });

    createdHeadPosition = true;
  }

  headPositionId = head.id;

  await cleanupPolicies();
});

beforeEach(async () => {
  mocks.requireAdminPermission.mockReset();
  await cleanupPolicies();
});

afterAll(async () => {
  await cleanupPolicies();

  await db.position.deleteMany({
    where: {
      id: normalPositionId,
    },
  });

  if (createdHeadPosition) {
    await db.position.deleteMany({
      where: {
        id: headPositionId,
      },
    });
  }
});

describe(
  "Admin payroll settings API",
  () => {
    it(
      "GET denies access without view permission",
      async () => {
        deny();

        const response = await callGet();

        expect(response.status).toBe(403);

        expect(
          mocks.requireAdminPermission,
        ).toHaveBeenCalledWith(
          "employee_compensation_view",
        );
      },
    );

    it(
      "POST denies access without manage permission",
      async () => {
        deny();

        const response = await callPost(
          postRequest({
            positionId:
              normalPositionId,
            effectiveFrom:
              "2098-01-01",
          }),
        );

        expect(response.status).toBe(403);

        expect(
          mocks.requireAdminPermission,
        ).toHaveBeenCalledWith(
          "employee_compensation_manage",
        );
      },
    );

    it(
      "GET returns positions and payroll policies",
      async () => {
        allow();

        await db.positionPayrollPolicy.create({
          data: {
            positionId:
              normalPositionId,
            effectiveFrom:
              TEST_START,
            effectiveTo:
              new Date(
                "2098-01-31T00:00:00.000Z",
              ),
            fixedSalaryMinor:
              123400,
            currency: "EGP",
            isActive: true,
          },
        });

        const response = await callGet();

        expect(response.status).toBe(200);

        const payload =
          await response.json();

        const position =
          payload.positions.find(
            (row: {
              id: string;
            }) =>
              row.id ===
              normalPositionId,
          );

        expect(position).toBeTruthy();
        expect(position.policies).toHaveLength(
          1,
        );

        expect(
          position.policies[0]
            .effectiveFrom,
        ).toBe("2098-01-01");

        expect(
          position.policies[0]
            .fixedSalaryMinor,
        ).toBe(123400);
      },
    );

    it(
      "POST creates effective-dated policy",
      async () => {
        allow();

        const response = await callPost(
          postRequest({
            positionId:
              normalPositionId,

            effectiveFrom:
              "2098-02-01",

            effectiveTo:
              "2098-02-28",

            fixedSalaryMinor:
              250000,

            defaultFixedClassMonthlyMinor:
              25000,

            traineeClassCommissionBps:
              2000,

            privateSessionCommissionBps:
              4000,

            coachMembershipCommissionBps:
              4000,

            currency:
              "EGP",

            notes:
              "C10 API integration test",
          }),
        );

        expect(response.status).toBe(201);

        const payload =
          await response.json();

        expect(
          payload.policy.positionId,
        ).toBe(normalPositionId);

        expect(
          payload.policy.effectiveFrom,
        ).toBe("2098-02-01");

        expect(
          payload.policy.fixedSalaryMinor,
        ).toBe(250000);

        expect(
          payload.policy
            .traineeClassCommissionBps,
        ).toBe(2000);

        const stored =
          await db.positionPayrollPolicy.findUnique(
            {
              where: {
                positionId_effectiveFrom:
                  {
                    positionId:
                      normalPositionId,
                    effectiveFrom:
                      new Date(
                        "2098-02-01T00:00:00.000Z",
                      ),
                  },
              },
            },
          );

        expect(stored).not.toBeNull();

        expect(
          stored?.fixedSalaryMinor,
        ).toBe(250000);
      },
    );

    it(
      "POST closes an earlier open policy and creates its successor",
      async () => {
        allow();

        const previous =
          await db.positionPayrollPolicy.create({
            data: {
              positionId:
                normalPositionId,

              effectiveFrom:
                new Date(
                  "2098-06-01T00:00:00.000Z",
                ),

              effectiveTo:
                null,

              fixedSalaryMinor:
                100000,

              traineeClassCommissionBps:
                2000,

              privateSessionCommissionBps:
                4000,

              coachMembershipCommissionBps:
                4000,

              currency:
                "EGP",

              isActive:
                true,
            },
          });

        const response = await callPost(
          postRequest({
            positionId:
              normalPositionId,

            effectiveFrom:
              "2098-07-01",

            fixedSalaryMinor:
              200000,

            traineeClassCommissionBps:
              2250,

            privateSessionCommissionBps:
              5000,

            coachMembershipCommissionBps:
              4500,

            currency:
              "EGP",
          }),
        );

        expect(response.status).toBe(201);

        const payload =
          await response.json();

        expect(
          payload.policy.positionId,
        ).toBe(normalPositionId);

        expect(
          payload.policy.effectiveFrom,
        ).toBe("2098-07-01");

        expect(
          payload.policy.effectiveTo,
        ).toBeNull();

        expect(
          payload.policy.fixedSalaryMinor,
        ).toBe(200000);

        expect(
          payload.policy.traineeClassCommissionBps,
        ).toBe(2250);

        const previousAfter =
          await db.positionPayrollPolicy.findUniqueOrThrow({
            where: {
              id:
                previous.id,
            },
          });

        expect(
          previousAfter.effectiveTo
            ?.toISOString()
            .slice(0, 10),
        ).toBe("2098-06-30");

        /*
         * Historical economics must remain untouched.
         */
        expect(
          previousAfter.fixedSalaryMinor,
        ).toBe(100000);

        expect(
          previousAfter.traineeClassCommissionBps,
        ).toBe(2000);

        expect(
          previousAfter.privateSessionCommissionBps,
        ).toBe(4000);

        expect(
          previousAfter.coachMembershipCommissionBps,
        ).toBe(4000);

        expect(
          previousAfter.isActive,
        ).toBe(true);
      },
    );

    it(
      "POST returns 409 for overlapping active policy",
      async () => {
        allow();

        await db.positionPayrollPolicy.create({
          data: {
            positionId:
              normalPositionId,

            effectiveFrom:
              new Date(
                "2098-03-01T00:00:00.000Z",
              ),

            effectiveTo:
              new Date(
                "2098-03-31T00:00:00.000Z",
              ),

            fixedSalaryMinor:
              100000,

            currency:
              "EGP",

            isActive: true,
          },
        });

        const response = await callPost(
          postRequest({
            positionId:
              normalPositionId,

            effectiveFrom:
              "2098-03-15",

            effectiveTo:
              "2098-04-15",

            fixedSalaryMinor:
              200000,
          }),
        );

        expect(response.status).toBe(409);

        const payload =
          await response.json();

        expect(payload.error).toBe(
          "POSITION_PAYROLL_POLICY_EFFECTIVE_RANGE_OVERLAP",
        );
      },
    );

    it(
      "POST rejects Head Coach hour rules on non-head position",
      async () => {
        allow();

        const response = await callPost(
          postRequest({
            positionId:
              normalPositionId,

            effectiveFrom:
              "2098-05-01",

            effectiveTo:
              "2098-05-31",

            fixedSalaryMinor:
              250000,

            headCoachMonthlyBaseMinutes:
              1920,

            headCoachWeeklyMinMinutes:
              300,

            headCoachWeeklyCapMinutes:
              480,
          }),
        );

        expect(response.status).toBe(400);

        const payload =
          await response.json();

        expect(payload.error).toBe(
          "POSITION_PAYROLL_POLICY_HEAD_RULE_POSITION_REQUIRED",
        );
      },
    );

    it(
      "POST accepts approved Head Coach settings on HEAD_COACH_OWNER",
      async () => {
        allow();

        const response = await callPost(
          postRequest({
            positionId:
              headPositionId,

            effectiveFrom:
              "2098-06-01",

            effectiveTo:
              "2098-06-30",

            fixedSalaryMinor:
              250000,

            traineeClassCommissionBps:
              2500,

            privateSessionCommissionBps:
              6000,

            coachMembershipCommissionBps:
              4000,

            headCoachMonthlyBaseMinutes:
              1920,

            headCoachWeeklyMinMinutes:
              300,

            headCoachWeeklyCapMinutes:
              480,

            currency:
              "EGP",
          }),
        );

        expect(response.status).toBe(201);

        const payload =
          await response.json();

        expect(
          payload.policy
            .headCoachMonthlyBaseMinutes,
        ).toBe(1920);

        expect(
          payload.policy
            .headCoachWeeklyMinMinutes,
        ).toBe(300);

        expect(
          payload.policy
            .headCoachWeeklyCapMinutes,
        ).toBe(480);

        expect(
          payload.policy
            .traineeClassCommissionBps,
        ).toBe(2500);
      },
    );
  },
);
