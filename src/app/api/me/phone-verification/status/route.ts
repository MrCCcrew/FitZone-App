import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import {
  isCompletedVerifiedProfile,
  isVerifiedProfilePhone,
} from "@/lib/profile-phone-verification";

export async function GET() {
  const session = await getCurrentAppUser();

  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHORIZED" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const user = await db.user.findUnique({
    where: { id: session.id },
    select: {
      role: true,
      phone: true,
      verifiedPhone: true,
      phoneVerifiedAt: true,
      gender: true,
      birthDate: true,
      governorate: true,
    },
  });

  if (!user) {
    return NextResponse.json(
      { error: "USER_NOT_FOUND" },
      { status: 404 },
    );
  }

  if (user.role !== "member") {
    return NextResponse.json({
      eligible: false,
      phoneVerified: false,
      profileComplete: false,
      hasPhone: false,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  return NextResponse.json({
    eligible: true,
    phoneVerified: isVerifiedProfilePhone(user),
    profileComplete: isCompletedVerifiedProfile(user),
    hasPhone: Boolean(user.phone),
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}