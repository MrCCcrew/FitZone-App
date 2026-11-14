// FITZONE_PRIVATE_RECEIPT_UPLOAD_V1
import { randomUUID } from "node:crypto";
import path from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { getR2Client } from "@/lib/r2";
import {
  getPrivatePartnerReceiptBucket,
  privatePartnerReceiptKey,
  PRIVATE_RECEIPT_EXTENSIONS,
  PRIVATE_RECEIPT_MAX_BYTES,
  PRIVATE_RECEIPT_ROUTE,
} from "@/lib/commissions/private-partner-receipt-storage";

function validImageSignature(
  mime: string,
  bytes: Buffer,
): boolean {
  if (mime === "image/jpeg") {
    return bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff;
  }

  if (mime === "image/png") {
    return bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
  }

  if (mime === "image/gif") {
    const header = bytes.toString("ascii", 0, 6);
    return header === "GIF87a" || header === "GIF89a";
  }

  if (mime === "image/webp") {
    return bytes.length >= 12 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP";
  }

  if (mime === "image/avif") {
    return bytes.length >= 12 &&
      bytes.toString("ascii", 4, 8) === "ftyp" &&
      ["avif", "avis"].includes(
        bytes.toString("ascii", 8, 12),
      );
  }

  return false;
}

export async function POST(req: Request) {
  const guard = await requireAdminFeature("partners");

  if ("error" in guard) return guard.error;

  if (guard.role !== "admin" && guard.role !== "staff") {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  let bucket: string;

  try {
    bucket = getPrivatePartnerReceiptBucket();
  } catch {
    return NextResponse.json(
      { error: "مخزن الإيصالات الخاصة غير جاهز." },
      { status: 503 },
    );
  }

  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "يجب اختيار صورة الإيصال." },
        { status: 400 },
      );
    }

    const mime = file.type.trim().toLowerCase();
    const ext = path.extname(file.name).toLowerCase();
    const allowed = PRIVATE_RECEIPT_EXTENSIONS[mime];

    if (
      !allowed ||
      !allowed.includes(ext) ||
      file.size <= 0 ||
      file.size > PRIVATE_RECEIPT_MAX_BYTES
    ) {
      return NextResponse.json(
        { error: "نوع الإيصال أو حجمه غير مسموح." },
        { status: 400 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());

    if (
      bytes.length !== file.size ||
      !validImageSignature(mime, bytes)
    ) {
      return NextResponse.json(
        { error: "ملف الصورة غير صالح." },
        { status: 400 },
      );
    }

    const filename = `${Date.now()}-${randomUUID()}${ext}`;
    const key = privatePartnerReceiptKey(filename);

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: mime,
        CacheControl: "private, no-store, max-age=0",
      }),
    );

    return NextResponse.json(
      {
        url: `${PRIVATE_RECEIPT_ROUTE}${filename}`,
        fileName: filename,
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error(
      "[PRIVATE_PARTNER_RECEIPT_UPLOAD]",
      error instanceof Error ? error.name : "unknown",
    );

    return NextResponse.json(
      { error: "تعذر رفع الإيصال إلى التخزين الخاص." },
      { status: 503 },
    );
  }
}
