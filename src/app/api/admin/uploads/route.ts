import { randomUUID } from "crypto";
import path from "path";
import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getAdminSession } from "@/lib/admin-session";
import { applySensitiveRateLimit, getClientIp } from "@/lib/rate-limit";
import { getMissingR2Env, getR2Client, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);
const DANGEROUS_EXTENSIONS = new Set([".exe", ".js", ".sh", ".php", ".html", ".svg"]);
const ALLOWED_EXTENSIONS_BY_TYPE: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
  "video/quicktime": [".mov", ".qt"],
};
const ALLOWED_FOLDERS = new Set([
  "products",
  "hero",
  "trainers",
  "offers",
  "memberships",
  "pages",
  "blog",
  "general",
]);

function getExtension(fileName: string, mimeType: string) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext) return ext;
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "video/mp4") return ".mp4";
  if (mimeType === "video/webm") return ".webm";
  if (mimeType === "video/quicktime") return ".mov";
  return "";
}

function normalizeFolder(raw: FormDataEntryValue | null) {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return ALLOWED_FOLDERS.has(value) ? value : "general";
}

function isMimeExtensionPairAllowed(fileName: string, mimeType: string) {
  const ext = path.extname(fileName).toLowerCase();
  if (!ext) return true;
  if (DANGEROUS_EXTENSIONS.has(ext)) return false;

  const allowedExtensions = ALLOWED_EXTENSIONS_BY_TYPE[mimeType] ?? [];
  return allowedExtensions.includes(ext);
}

export async function POST(req: Request) {
  try {
    const adminSession = await getAdminSession();
    if (!adminSession) {
      return NextResponse.json({ error: "يجب تسجيل دخول الأدمن أولًا." }, { status: 401 });
    }

    const clientIp = getClientIp(req);
    const limit = await applySensitiveRateLimit(`admin-upload:${adminSession.id}:${clientIp}`, 20, 10 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "عدد محاولات الرفع كبير جدًا. حاول مرة أخرى بعد قليل." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const missingEnv = getMissingR2Env();
    if (missingEnv.length > 0) {
      return NextResponse.json(
        {
          error: `رفع الملفات غير متاح حاليًا. المتغيرات الناقصة: ${missingEnv.join(", ")}`,
        },
        { status: 503 },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const folder = normalizeFolder(formData.get("folder"));

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "لم يتم اختيار ملف للرفع." }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "نوع الملف غير مدعوم. ارفعي JPG أو PNG أو WEBP أو GIF أو MP4 أو WEBM أو MOV." },
        { status: 400 },
      );
    }

    if (!isMimeExtensionPairAllowed(file.name, file.type)) {
      return NextResponse.json(
        { error: "امتداد الملف لا يطابق نوعه المسموح أو أن الامتداد غير آمن." },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "حجم الملف كبير جدًا. الحد الأقصى المسموح هو 100 ميجابايت." },
        { status: 400 },
      );
    }

    const extension = getExtension(file.name, file.type);
    if (!extension) {
      return NextResponse.json({ error: "امتداد الملف غير صالح." }, { status: 400 });
    }

    const fileName = `${Date.now()}-${randomUUID()}${extension}`;
    const key = `${folder}/${fileName}`;
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
      fileName,
      folder,
    });
  } catch (error) {
    console.error("[ADMIN_UPLOAD]", error instanceof Error ? error.message : "unknown");
    return NextResponse.json(
      {
        error: "تعذر رفع الملف الآن. تأكدي من إعدادات التخزين أو حجم الملف ثم حاولي مرة أخرى.",
      },
      { status: 500 },
    );
  }
}
