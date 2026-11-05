// FITZONE_PRIVATE_RECEIPT_PROTECTED_VIEW_V1

import path from "node:path";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";

import { requireAdminFeature } from "@/lib/admin-guard";
import { getR2Client } from "@/lib/r2";

import {
  getPrivatePartnerReceiptBucket,
  privatePartnerReceiptKey,
  PRIVATE_RECEIPT_EXTENSIONS,
  PRIVATE_RECEIPT_FILE_PATTERN,
  PRIVATE_RECEIPT_MAX_BYTES,
} from "@/lib/commissions/private-partner-receipt-storage";

type RouteContext = {
  params: Promise<{ filename: string }>;
};

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
};

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  const guard = await requireAdminFeature("partners");

  if ("error" in guard) {
    return guard.error;
  }

  if (
    guard.role !== "admin" &&
    guard.role !== "staff"
  ) {
    return NextResponse.json(
      { error: "Forbidden" },
      {
        status: 403,
        headers: PRIVATE_HEADERS,
      },
    );
  }

  const { filename } = await context.params;

  if (!PRIVATE_RECEIPT_FILE_PATTERN.test(filename)) {
    return NextResponse.json(
      { error: "Invalid receipt" },
      {
        status: 400,
        headers: PRIVATE_HEADERS,
      },
    );
  }

  let bucket: string;

  try {
    bucket = getPrivatePartnerReceiptBucket();
  } catch {
    return NextResponse.json(
      { error: "Private receipt storage unavailable" },
      {
        status: 503,
        headers: PRIVATE_HEADERS,
      },
    );
  }

  try {
    const object = await getR2Client().send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: privatePartnerReceiptKey(filename),
      }),
    );

    const mime = String(object.ContentType ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    const extension = path.extname(filename).toLowerCase();
    const allowedExtensions =
      PRIVATE_RECEIPT_EXTENSIONS[mime];

    const length = object.ContentLength;

    if (
      !allowedExtensions ||
      !allowedExtensions.includes(extension) ||
      typeof length !== "number" ||
      !Number.isSafeInteger(length) ||
      length <= 0 ||
      length > PRIVATE_RECEIPT_MAX_BYTES ||
      !object.Body
    ) {
      return NextResponse.json(
        { error: "Invalid receipt object" },
        {
          status: 400,
          headers: PRIVATE_HEADERS,
        },
      );
    }

    const bytes = await object.Body.transformToByteArray();

    if (
      bytes.byteLength !== length ||
      bytes.byteLength > PRIVATE_RECEIPT_MAX_BYTES
    ) {
      return NextResponse.json(
        { error: "Incomplete receipt object" },
        {
          status: 503,
          headers: PRIVATE_HEADERS,
        },
      );
    }

    return new NextResponse(
      new Uint8Array(bytes),
      {
        status: 200,
        headers: {
          ...PRIVATE_HEADERS,
          "Content-Type": mime,
          "Content-Disposition":
            `inline; filename="${filename}"`,
          "Content-Length": String(bytes.byteLength),
        },
      },
    );
  } catch (error) {
    const statusCode = (
      error as {
        $metadata?: { httpStatusCode?: number };
      }
    )?.$metadata?.httpStatusCode;

    console.warn(
      "[PRIVATE_PARTNER_RECEIPT_READ_FAILED]",
      { statusCode: statusCode ?? null },
    );

    return NextResponse.json(
      { error: "Receipt unavailable" },
      {
        status: statusCode === 404 ? 404 : 503,
        headers: PRIVATE_HEADERS,
      },
    );
  }
}
