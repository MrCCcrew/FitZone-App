import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findContent: vi.fn(),
  findBookings: vi.fn(),
  findSubscriptions: vi.fn(),
  updateBooking: vi.fn(),
  deleteSubscription: vi.fn(),
  sendPush: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    siteContent: { findUnique: mocks.findContent },
    booking: {
      findMany: mocks.findBookings,
      update: mocks.updateBooking,
    },
    pushSubscription: {
      findMany: mocks.findSubscriptions,
      delete: mocks.deleteSubscription,
    },
  },
}));

vi.mock("@/lib/push", () => ({
  sendOnePush: mocks.sendPush,
}));

import { GET } from "../../src/app/api/cron/send-reminders/route";

const originalSecret = process.env.CRON_SECRET;
const originalAppEnv = process.env.APP_ENV;
const originalDisable = process.env.FITZONE_DISABLE_BACKGROUND_JOBS;

function booking(date: string, time: string) {
  return {
    id: "booking-test",
    status: "confirmed",
    reminderSentAt: null,
    userMembershipId: null,
    user: { id: "user-test", name: "Test User" },
    userMembership: null,
    schedule: {
      date: new Date(`${date}T00:00:00.000Z`),
      time,
      isActive: true,
      class: {
        name: "Test Class",
        trainer: { name: "Test Trainer" },
      },
    },
  };
}

async function executeAt(now: string, date: string, time: string) {
  vi.setSystemTime(new Date(now));
  mocks.findBookings.mockResolvedValue([booking(date, time)]);

  const res = await GET(
    new Request(
      "http://localhost/api/cron/send-reminders?secret=isolated-test-secret",
    ),
  );

  return {
    status: res.status,
    body: await res.json(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();

  process.env.CRON_SECRET = "isolated-test-secret";
  process.env.APP_ENV = "production";
  process.env.FITZONE_DISABLE_BACKGROUND_JOBS = "0";

  mocks.findContent.mockResolvedValue(null);
  mocks.findSubscriptions.mockResolvedValue([
    {
      endpoint: "https://push.invalid/test",
      p256dh: "fake",
      auth: "fake",
    },
  ]);
  mocks.updateBooking.mockResolvedValue({});
  mocks.sendPush.mockResolvedValue({
    ok: true,
    expired: false,
  });
});

afterEach(() => {
  vi.useRealTimers();

  if (originalSecret === undefined)
    delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;

  if (originalAppEnv === undefined)
    delete process.env.APP_ENV;
  else process.env.APP_ENV = originalAppEnv;

  if (originalDisable === undefined)
    delete process.env.FITZONE_DISABLE_BACKGROUND_JOBS;
  else process.env.FITZONE_DISABLE_BACKGROUND_JOBS = originalDisable;
});

describe("Reminder route Cairo timing", () => {
  it("sends five hours before a winter Cairo class", async () => {
    const result = await executeAt(
      "2026-01-15T11:00:00.000Z",
      "2026-01-15",
      "18:00",
    );

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ sent: 1 });
    expect(mocks.sendPush).toHaveBeenCalledTimes(1);
    expect(mocks.updateBooking).toHaveBeenCalledTimes(1);
  });

  it("sends five hours before a summer Cairo class", async () => {
    const result = await executeAt(
      "2026-07-15T10:00:00.000Z",
      "2026-07-15",
      "18:00",
    );

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ sent: 1 });
    expect(mocks.sendPush).toHaveBeenCalledTimes(1);
  });

  it("handles a Cairo class shortly after midnight", async () => {
    const result = await executeAt(
      "2026-11-14T17:30:00.000Z",
      "2026-11-15",
      "00:30",
    );

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ sent: 1 });
    expect(mocks.sendPush).toHaveBeenCalledTimes(1);
  });

  it("does not send outside the existing reminder window", async () => {
    const result = await executeAt(
      "2026-01-15T12:00:00.000Z",
      "2026-01-15",
      "18:00",
    );

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ sent: 0 });
    expect(mocks.sendPush).not.toHaveBeenCalled();
    expect(mocks.updateBooking).not.toHaveBeenCalled();
  });

  it("blocks unauthorized requests without sending", async () => {
    const result = await GET(
      new Request("http://localhost/api/cron/send-reminders"),
    );

    expect(result.status).toBe(401);
    expect(mocks.findBookings).not.toHaveBeenCalled();
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });
});