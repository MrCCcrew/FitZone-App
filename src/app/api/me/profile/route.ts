import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { parseOptionalProfileBirthDate } from "@/lib/profile-birth-date";

const EGYPT_GOVERNORATES = [
  "القاهرة","الجيزة","الإسكندرية","الدقهلية","البحر الأحمر","البحيرة","الفيوم",
  "الغربية","الإسماعيلية","المنوفية","المنيا","القليوبية","الوادي الجديد","السويس",
  "أسوان","أسيوط","بني سويف","بور سعيد","دمياط","جنوب سيناء","كفر الشيخ",
  "مطروح","الأقصر","قنا","شمال سيناء","الشرقية","سوهاج",
];

export async function PATCH(req: Request) {
  const session = await getCurrentAppUser();
  if (!session) return NextResponse.json({ error: "غير مصرح." }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  const name       = body.name       ? String(body.name).trim()       : undefined;
  const phone      = body.phone      ? String(body.phone).trim()       : undefined;
  const MARITAL_STATUSES = ["single_graduated", "married_new", "married_with_kids", "student"];
  const gender     = body.gender && MARITAL_STATUSES.includes(String(body.gender)) ? String(body.gender) : undefined;
  const governorate = body.governorate && EGYPT_GOVERNORATES.includes(String(body.governorate))
    ? String(body.governorate)
    : undefined;
  const address    = body.address !== undefined
    ? (body.address ? String(body.address).trim() : null)
    : undefined;
  // Empty date inputs remain optional; populated dates must be canonical.
  const parsedBirthDate = parseOptionalProfileBirthDate(body.birthDate);

  // Validate
  if (name !== undefined && name.split(/\s+/).length < 3) {
    return NextResponse.json({ error: "يجب إدخال ثلاثة أسماء على الأقل." }, { status: 400 });
  }
  if (parsedBirthDate && !parsedBirthDate.ok) {
    return NextResponse.json({
      error: parsedBirthDate.error === "FUTURE_BIRTH_DATE"
        ? "لا يمكن حفظ تاريخ ميلاد مستقبلي."
        : "تاريخ الميلاد غير صحيح.",
    }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (name       !== undefined) data.name       = name;
  if (phone !== undefined) {
    const current = await db.user.findUnique({
      where: { id: session.id },
      select: { phone: true },
    });

    if (!current) {
      return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    }

    if ((current.phone ?? "").trim() !== phone) {
      return NextResponse.json(
        { error: "PHONE_CHANGE_REQUIRES_VERIFICATION" },
        { status: 400 },
      );
    }
  }
  if (gender     !== undefined) data.gender     = gender;
  if (governorate !== undefined) data.governorate = governorate;
  if (address    !== undefined) data.address    = address;
  if (parsedBirthDate.ok && parsedBirthDate.birthDate) data.birthDate = parsedBirthDate.birthDate;

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "لا توجد بيانات للتحديث." }, { status: 400 });
  }

  await db.user.update({ where: { id: session.id }, data });

  return NextResponse.json({ success: true });
}
