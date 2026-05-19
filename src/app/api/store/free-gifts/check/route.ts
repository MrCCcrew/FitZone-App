import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { getGameSettings } from "@/app/api/admin/store-free-gifts-game/route";
import { getFreeGiftsEligibility } from "@/lib/store-free-gifts";

export async function GET() {
  const settings = await getGameSettings();
  if (!settings.gameEnabled) {
    return NextResponse.json({ enabled: false, eligible: false, error: "game_disabled" });
  }

  const user = await getCurrentAppUser();
  const eligibility = await getFreeGiftsEligibility(user?.id ?? null);
  return NextResponse.json({
    enabled: true,
    eligible: eligibility.eligible,
    ...(eligibility.eligible ? {} : {
      error: eligibility.code,
      messageAr: eligibility.messageAr,
      messageEn: eligibility.messageEn,
    }),
  });
}
