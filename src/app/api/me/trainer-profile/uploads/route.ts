import { randomUUID } from "crypto";
import path from "path";
import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { getMissingR2Env, getR2Client, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function getExtension(fileName: string, mimeType: string) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext) return ext;
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  return "";
}

export async function POST(req: Request) {
  const session = await getCurrentAppUser();
  if (!session) {
    return NextResponse.json({ error: "يجب تسجيل الدخول أولاً." }, { status: 401 });
  }

  const linkedTrainer = await db.trainer.findFirst({
    where: { userId: session.id },
    select: { id: true },
  });
  if (!linkedTrainer) {
    return NextResponse.json({ error: "لا يوجد ملف مدربة مرتبط بهذا الحساب." }, { status: 403 });
  }

  const missingEnv = getMissingR2Env();
  if (missingEnv.length > 0) {
    return NextResponse.json({ error: `رفع الملفات غير متاح حاليًا. المتغيرات الناقصة: ${missingEnv.join(", ")}` }, { status: 503 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "لم يتم اختيار ملف للرفع." }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "نوع الملف غير مدعوم. ارفعي صورة بصيغة JPG أو PNG أو WEBP أو GIF." }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "حجم الملف كبير جدًا. الحد الأقصى 10 ميجابايت." }, { status: 400 });
  }

  const extension = getExtension(file.name, file.type);
  if (!extension) {
    return NextResponse.json({ error: "امتداد الملف غير صالح." }, { status: 400 });
  }

  const key = `trainers/${linkedTrainer.id}/${Date.now()}-${randomUUID()}${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    }),
  );

  return NextResponse.json({
    url: `${R2_PUBLIC_URL}/${key}`,
    fileName: file.name,
  });
}
