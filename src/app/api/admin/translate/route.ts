import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { translateArabicToEnglish } from "@/lib/translation-service";

export async function POST(req: Request) {
  const session = await getAdminSession();

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const { text } = (await req.json()) as {
      text?: string;
    };

    if (!text?.trim()) {
      return NextResponse.json(
        { error: "النص فارغ." },
        { status: 400 },
      );
    }

    const translated =
      await translateArabicToEnglish(text);

    return NextResponse.json({ translated });
  } catch (error) {
    console.error("[TRANSLATE]", error);

    return NextResponse.json(
      { error: "تعذر الترجمة الآن." },
      { status: 500 },
    );
  }
}
