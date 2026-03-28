import { randomUUID } from "crypto";
import path from "path";
import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { requireAdminFeature } from "@/lib/admin-guard";
import { getMissingR2Env, getR2Client, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
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
  try {
    const guard = await requireAdminFeature("products");
    if ("error" in guard) return guard.error;

    const missingEnv = getMissingR2Env();
    if (missingEnv.length > 0) {
      return NextResponse.json(
        {
          error: `رفع الصور غير مُعدّ حاليًا. المتغيرات الناقصة: ${missingEnv.join(", ")}`,
        },
        { status: 503 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "لم يتم اختيار ملف للرفع." }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "نوع الملف غير مدعوم. ارفع JPG أو PNG أو WEBP أو GIF." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "حجم الصورة كبير جدًا. الحد الأقصى 5 ميجابايت." }, { status: 400 });
    }

    const extension = getExtension(file.name, file.type);
    if (!extension) {
      return NextResponse.json({ error: "امتداد الملف غير صالح." }, { status: 400 });
    }

    const fileName = `${Date.now()}-${randomUUID()}${extension}`;
    const key = `products/${fileName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      })
    );

    return NextResponse.json({
      url: `${R2_PUBLIC_URL}/${key}`,
      fileName,
    });
  } catch (error) {
    console.error("[ADMIN_UPLOAD]", error);
    return NextResponse.json(
      {
        error: "تعذر رفع الصورة حاليًا. تأكد من إعدادات R2 أو حجم الصورة ثم حاول مرة أخرى.",
      },
      { status: 500 }
    );
  }
}
