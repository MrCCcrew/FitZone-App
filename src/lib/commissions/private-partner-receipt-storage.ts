// FITZONE_PRIVATE_PARTNER_RECEIPT_STORAGE_V1
import { R2_BUCKET } from "@/lib/r2";

export const PRIVATE_RECEIPT_MAX_BYTES = 12 * 1024 * 1024;

export const PRIVATE_RECEIPT_ROUTE =
  "/api/admin/partner-receipts/";

export const PRIVATE_RECEIPT_KEY_PREFIX =
  "financial-partner-receipts/";

export const PRIVATE_RECEIPT_FILE_PATTERN =
  /^\d{13}-[0-9a-f-]{36}\.(jpg|jpeg|png|webp|avif|gif)$/i;

export const PRIVATE_RECEIPT_EXTENSIONS:
  Readonly<Record<string, readonly string[]>> = {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/webp": [".webp"],
    "image/avif": [".avif"],
    "image/gif": [".gif"],
  };

export function getPrivatePartnerReceiptBucket(): string {
  const bucket =
    process.env.R2_PRIVATE_RECEIPTS_BUCKET_NAME?.trim() ?? "";

  if (!bucket || bucket === R2_BUCKET) {
    throw new Error(
      "PRIVATE_RECEIPTS_BUCKET_MISSING_OR_PUBLIC",
    );
  }

  return bucket;
}

export function parsePrivatePartnerReceiptUrl(
  receiptUrl: string,
): string | null {
  if (!receiptUrl.startsWith(PRIVATE_RECEIPT_ROUTE)) {
    return null;
  }

  const filename =
    receiptUrl.slice(PRIVATE_RECEIPT_ROUTE.length);

  return PRIVATE_RECEIPT_FILE_PATTERN.test(filename)
    ? filename
    : null;
}

export function privatePartnerReceiptKey(
  filename: string,
): string {
  if (!PRIVATE_RECEIPT_FILE_PATTERN.test(filename)) {
    throw new Error("INVALID_PRIVATE_RECEIPT_FILENAME");
  }

  return `${PRIVATE_RECEIPT_KEY_PREFIX}${filename}`;
}
