import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    time: new Date().toISOString(),
    nodeVersion: process.version,
    uptime: Math.floor(process.uptime()),
    memory: Math.floor(process.memoryUsage().rss / 1024 / 1024) + "MB",
  });
}

