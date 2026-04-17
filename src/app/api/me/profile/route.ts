import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

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
  const birthDate  = body.birthDate
    ? new Date(String(body.birthDate))
    : undefined;

  // Validate
  if (name !== undefined && name.split(/\s+/).length < 3) {
    return NextResponse.json({ error: "يجب إدخال ثلاثة أسماء على الأقل." }, { status: 400 });
  }
  if (birthDate !== undefined && isNaN(birthDate.getTime())) {
    return NextResponse.json({ error: "تاريخ الميلاد غير صحيح." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (name       !== undefined) data.name       = name;
  if (phone      !== undefined) data.phone      = phone || null;
  if (gender     !== undefined) data.gender     = gender;
  if (governorate !== undefined) data.governorate = governorate;
  if (address    !== undefined) data.address    = address;
  if (birthDate  !== undefined) data.birthDate  = birthDate;

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "لا توجد بيانات للتحديث." }, { status: 400 });
  }

  await db.user.update({ where: { id: session.id }, data });

  return NextResponse.json({ success: true });
}
