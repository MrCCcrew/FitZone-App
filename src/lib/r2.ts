import { S3Client } from "@aws-sdk/client-s3";

const requiredEnv = [
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PUBLIC_URL",
] as const;

export function getMissingR2Env() {
  return requiredEnv.filter((key) => !process.env[key]?.trim());
}

export function isR2Configured() {
  return getMissingR2Env().length === 0;
}

let client: S3Client | null = null;

export function getR2Client() {
  if (!isR2Configured()) {
    throw new Error(`Missing R2 configuration: ${getMissingR2Env().join(", ")}`);
  }

  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT!,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }

  return client;
}

export const R2_BUCKET = process.env.R2_BUCKET_NAME ?? "fitzone-images";
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? "";
