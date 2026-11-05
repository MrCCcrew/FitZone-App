import { NextResponse } from "next/server";
import { getAvailablePaymentProviders } from "@/lib/payments/service";
import { getPaymentSettings } from "@/lib/payments/settings";

export async function GET() {
  const settings = await getPaymentSettings();
  return NextResponse.json({
    providers: getAvailablePaymentProviders(),
    defaultProvider: "paymob",
    checkoutMethods: [
      {
        key: "paymob",
        labelAr: settings.displayLabelAr,
        labelEn: settings.displayLabelEn,
        type: "electronic",
      },
      ...(settings.cashOnDeliveryEnabled
        ? [
            {
              key: "cod",
              labelAr: settings.cashOnDeliveryLabelAr,
              labelEn: settings.cashOnDeliveryLabelEn,
              type: "offline",
            },
          ]
        : []),
    ],
  });
}
