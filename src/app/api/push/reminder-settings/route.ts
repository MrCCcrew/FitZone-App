import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

export const DEFAULT_REMINDER_SETTINGS = {
  title: "تذكير بموعدك في FitZone 💪",
  body: "{className} مع {trainerName} — {day} الساعة {time}",
};

export async function GET() {
  const guard = await requireAdminFeature("push");
  if ("error" in guard) return guard.error;

  const record = await db.siteContent.findUnique({
    where: { section: "pushReminderSettings" },
  });

  if (!record) return NextResponse.json(DEFAULT_REMINDER_SETTINGS);

  try {
    return NextResponse.json({ ...DEFAULT_REMINDER_SETTINGS, ...JSON.parse(record.content) });
  } catch {
    return NextResponse.json(DEFAULT_REMINDER_SETTINGS);
  }
}

export async function PUT(req: Request) {
  const guard = await requireAdminFeature("push");
  if ("error" in guard) return guard.error;

  const body = await req.json() as { title?: string; body?: string };
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const bodyText = typeof body.body === "string" ? body.body.trim() : "";

  if (!title || !bodyText) {
    return NextResponse.json({ error: "العنوان والنص مطلوبان" }, { status: 400 });
  }

  await db.siteContent.upsert({
    where: { section: "pushReminderSettings" },
    create: { section: "pushReminderSettings", content: JSON.stringify({ title, body: bodyText }) },
    update: { content: JSON.stringify({ title, body: bodyText }) },
  });

  return NextResponse.json({ ok: true, title, body: bodyText });
}
