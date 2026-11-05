import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import {
  ADMIN_MASTER_ACCESS_COOKIE,
  createAdminMasterAccessToken,
  getAdminMasterAccess,
  getAdminMasterAccessCookieOptions,
  getProtectedAdminSections,
  isProtectedAdminSection,
} from "@/lib/admin-master-access";

const MASTER_PASSWORD = process.env.DB_RESET_MASTER_PASSWORD ?? "";

export async function GET() {
  const guard = await requireAdminFeature("settings");
  if ("error" in guard) return guard.error;

  const access = await getAdminMasterAccess();
  return NextResponse.json({
    unlockedSections: access?.sections ?? [],
  });
}

export async function POST(req: Request) {
  const guard = await requireAdminFeature("settings");
  if ("error" in guard) return guard.error;

  try {
    const body = (await req.json()) as { password?: string; section?: string };
    const password = String(body.password ?? "");
    const requestedSection = String(body.section ?? "");

    if (!isProtectedAdminSection(requestedSection)) {
      return NextResponse.json({ error: "القسم المطلوب غير مدعوم." }, { status: 400 });
    }

    if (!MASTER_PASSWORD || password !== MASTER_PASSWORD) {
      return NextResponse.json({ error: "كلمة المرور الرئيسية غير صحيحة." }, { status: 401 });
    }

    const access = await getAdminMasterAccess();
    const mergedSections = Array.from(new Set([...(access?.sections ?? []), requestedSection])).filter(
      isProtectedAdminSection,
    );

    const response = NextResponse.json({
      success: true,
      unlockedSections: mergedSections,
      protectedSections: getProtectedAdminSections(),
    });

    response.cookies.set(
      ADMIN_MASTER_ACCESS_COOKIE,
      createAdminMasterAccessToken(mergedSections),
      getAdminMasterAccessCookieOptions(),
    );

    return response;
  } catch {
    return NextResponse.json({ error: "تعذر التحقق من كلمة المرور الرئيسية." }, { status: 500 });
  }
}
