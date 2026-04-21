import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const session = await getCurrentAppUser();
  if (!session) {
    return NextResponse.json({ error: "يجب تسجيل الدخول أولًا." }, { status: 401 });
  }

  const trainer = await db.trainer.findFirst({
    where: { userId: session.id },
    select: { id: true },
  });
  if (!trainer) {
    return NextResponse.json({ error: "لا يوجد ملف مدربة مرتبط بهذا الحساب." }, { status: 403 });
  }

  try {
    const { text } = (await req.json()) as { text?: string };
    if (!text?.trim()) {
      return NextResponse.json({ error: "النص فارغ." }, { status: 400 });
    }

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ar&tl=en&dt=t&q=${encodeURIComponent(text.trim())}`;
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) throw new Error(`translate API ${response.status}`);

    const data = (await response.json()) as [[string, string][], ...unknown[]];
    const translated = data[0].map(([segment]) => segment).join("").trim();

    return NextResponse.json({ translated });
  } catch (error) {
    console.error("[TRAINER_PROFILE_TRANSLATE]", error);
    return NextResponse.json({ error: "تعذر الترجمة الآن." }, { status: 500 });
  }
}
