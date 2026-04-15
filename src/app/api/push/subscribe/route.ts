import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { getVapidPublicKey } from "@/lib/push";

// GET — return VAPID public key for the client
export async function GET() {
  return NextResponse.json({ vapidPublicKey: getVapidPublicKey() });
}

// POST — save a push subscription (link to user if logged in)
export async function POST(req: Request) {
  const user = await getCurrentAppUser();

  const body = (await req.json()) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription data" }, { status: 400 });
  }

  await db.pushSubscription.upsert({
    where: { endpoint: body.endpoint },
    update: {
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userId: user?.id ?? null,
    },
    create: {
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userId: user?.id ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}

// DELETE — remove a subscription
export async function DELETE(req: Request) {
  const body = (await req.json()) as { endpoint?: string };

  if (!body.endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  await db.pushSubscription.deleteMany({ where: { endpoint: body.endpoint } }).catch(() => null);

  return NextResponse.json({ ok: true });
}
