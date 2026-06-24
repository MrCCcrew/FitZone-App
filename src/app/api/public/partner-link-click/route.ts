import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const { token } = await req.json().catch(() => ({})) as { token?: string };
  if (!token) return NextResponse.json({ success: false, valid: false });
  const normalized = String(token).trim().toUpperCase();
  const link = await db.partnerAffiliateLink.findUnique({
    where: { token: normalized },
    select: { id: true, isActive: true },
  });
  if (!link?.isActive) return NextResponse.json({ success: false, valid: false });
  await db.partnerAffiliateLink.update({ where: { id: link.id }, data: { clickCount: { increment: 1 } } });
  return NextResponse.json({ success: true, valid: true });
}
