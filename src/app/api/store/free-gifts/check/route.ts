import { NextResponse } from "next/server";
import { getGameSettings } from "@/app/api/admin/store-free-gifts-game/route";

export async function GET() {
  const settings = await getGameSettings();
  return NextResponse.json({ enabled: settings.gameEnabled });
}
