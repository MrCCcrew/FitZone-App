import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getMissingR2Env, getR2Client, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";
import { applySensitiveRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const VALID_PRESET_IDS = new Set(Array.from({ length: 16 }, (_, i) => `avatar:preset:${i + 1}`));

export async function POST(req: Request) {
  const user = await getCurrentAppUser();
  if (!user?.id) return NextResponse.json({ error: "غير مصرح." }, { status: 401 });

  const contentType = req.headers.get("content-type") ?? "";

  // ── Preset selection ───────────────────────────────────────────────────────
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({})) as { preset?: string };
    const preset = body.preset ? String(body.preset).trim() : null;
    if (!preset || !VALID_PRESET_IDS.has(preset)) {
      return NextResponse.json({ error: "أفاتار غير صالح." }, { status: 400 });
    }
    await db.user.update({ where: { id: user.id }, data: { avatar: preset } });
    return NextResponse.json({ ok: true, avatar: preset });
  }

  // ── File upload ────────────────────────────────────────────────────────────
  if (contentType.includes("multipart/form-data")) {
    const missingEnv = getMissingR2Env();
    if (missingEnv.length > 0) {
      return NextResponse.json({ error: "خدمة رفع الصور غير متاحة حالياً." }, { status: 503 });
    }

    const clientIp = getClientIp(req);
    const limit = await applySensitiveRateLimit(`avatar-upload:${user.id}:${clientIp}`, 10, 60 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json({ error: "تم تجاوز الحد المسموح. حاول بعد ساعة." }, { status: 429 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "لم يتم اختيار ملف." }, { status: 400 });

    const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json({ error: "يُسمح بـ JPG أو PNG أو WebP فقط." }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "الحد الأقصى 5 ميجابايت." }, { status: 400 });
    }

    const ext = file.type === "image/jpeg" ? ".jpg" : file.type === "image/png" ? ".png" : ".webp";
    const key = `avatars/${user.id}-${Date.now()}-${randomUUID()}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await getR2Client().send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    }));

    const url = `${R2_PUBLIC_URL}/${key}`;
    await db.user.update({ where: { id: user.id }, data: { avatar: url } });
    return NextResponse.json({ ok: true, avatar: url });
  }

  return NextResponse.json({ error: "طلب غير صالح." }, { status: 400 });
}
