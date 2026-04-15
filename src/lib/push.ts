import webpush from "web-push";

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT     ?? "mailto:admin@fitzoneland.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

export type PushSubData = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

export async function sendOnePush(
  sub: PushSubData,
  payload: PushPayload,
): Promise<{ ok: boolean; expired: boolean }> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(payload),
      { TTL: 86400 },
    );
    return { ok: true, expired: false };
  } catch (err: unknown) {
    const code = (err as { statusCode?: number })?.statusCode;
    // 404 / 410 = subscription no longer valid
    return { ok: false, expired: code === 404 || code === 410 };
  }
}
