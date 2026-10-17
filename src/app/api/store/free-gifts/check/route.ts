import { NextResponse } from "next/server";
import { getGameSettings } from "@/lib/store-free-gifts-game-settings";

export async function GET() {
  const settings = await getGameSettings();
  return NextResponse.json({ enabled: settings.gameEnabled });
}
