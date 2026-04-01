import { NextResponse } from "next/server";
import { getAvailablePaymentProviders } from "@/lib/payments/service";

export async function GET() {
  return NextResponse.json({
    providers: getAvailablePaymentProviders(),
    defaultProvider: process.env.DEFAULT_PAYMENT_PROVIDER?.trim().toLowerCase() || "manual",
  });
}
