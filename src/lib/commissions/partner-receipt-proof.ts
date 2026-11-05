import { createHash } from "node:crypto";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getR2Client } from "@/lib/r2";
import {
  getPrivatePartnerReceiptBucket,
  parsePrivatePartnerReceiptUrl,
  privatePartnerReceiptKey,
} from "@/lib/commissions/private-partner-receipt-storage";

const MAX_RECEIPT_BYTES = 12 * 1024 * 1024;

type ReceiptProof =
  | { ok: true; sha256: string }
  | { ok: false; status: 400 | 503; message: string };

export async function verifyPartnerReceiptObject(
  receiptUrl: string,
): Promise<ReceiptProof> {
  // FITZONE_PRIVATE_RECEIPT_PROOF_V1
  // Never accept a public R2 URL for a new financial settlement.
  const fileName = parsePrivatePartnerReceiptUrl(receiptUrl);

  if (!fileName) {
    return {
      ok: false,
      status: 400,
      message: "يجب رفع إيصال الصرف من قسم الشركاء.",
    };
  }

  try {
    const object = await getR2Client().send(
      new GetObjectCommand({
        Bucket: getPrivatePartnerReceiptBucket(),
        Key: privatePartnerReceiptKey(fileName),
      }),
    );

    const contentType = String(object.ContentType ?? "")
      .trim()
      .toLowerCase();

    const size = object.ContentLength;

    if (
      !/^image\/(jpeg|png|webp|avif|gif)$/.test(contentType) ||
      typeof size !== "number" ||
      !Number.isSafeInteger(size) ||
      size <= 0 ||
      size > MAX_RECEIPT_BYTES ||
      !object.Body
    ) {
      return {
        ok: false,
        status: 400,
        message: "إيصال الصرف غير صالح أو يتجاوز الحجم المسموح.",
      };
    }

    const bytes = await object.Body.transformToByteArray();

    if (bytes.byteLength !== size) {
      return {
        ok: false,
        status: 503,
        message: "تعذر التحقق من اكتمال ملف الإيصال.",
      };
    }

    return {
      ok: true,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch (error) {
    const statusCode = (
      error as { $metadata?: { httpStatusCode?: number } }
    )?.$metadata?.httpStatusCode;

    console.warn("[PARTNER_RECEIPT_PROOF_FAILED]", {
      statusCode: statusCode ?? null,
    });

    return {
      ok: false,
      status: statusCode === 404 ? 400 : 503,
      message:
        statusCode === 404
          ? "إيصال الصرف غير موجود على Cloudflare R2."
          : "تعذر التحقق من إيصال الصرف. حاول مرة أخرى.",
    };
  }
}
