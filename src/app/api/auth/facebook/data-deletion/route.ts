import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { db } from "@/lib/db";
import { getAppBaseUrl } from "@/lib/oauth";

// Verify Facebook's signed_request
function parseSignedRequest(signedRequest: string, appSecret: string) {
  try {
    const [encodedSig, payload] = signedRequest.split(".");
    if (!encodedSig || !payload) return null;

    const sig = Buffer.from(encodedSig, "base64url");
    const expectedSig = createHmac("sha256", appSecret).update(payload).digest();

    if (sig.length !== expectedSig.length || !sig.equals(expectedSig)) return null;

    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      user_id?: string;
      algorithm?: string;
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (!appSecret) {
      return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }

    const formData = await req.formData();
    const signedRequest = formData.get("signed_request") as string | null;

    if (!signedRequest) {
      return NextResponse.json({ error: "Missing signed_request" }, { status: 400 });
    }

    const data = parseSignedRequest(signedRequest, appSecret);
    if (!data?.user_id) {
      return NextResponse.json({ error: "Invalid signed_request" }, { status: 400 });
    }

    const facebookUserId = data.user_id;

    // Remove Facebook account link and optionally anonymize user data
    const account = await db.account.findUnique({
      where: {
        provider_providerAccountId: { provider: "facebook", providerAccountId: facebookUserId },
      },
    });

    if (account) {
      await db.account.delete({
        where: {
          provider_providerAccountId: { provider: "facebook", providerAccountId: facebookUserId },
        },
      });
    }

    // Return confirmation URL as required by Facebook
    const confirmationCode = Buffer.from(`fb-del-${facebookUserId}-${Date.now()}`).toString("base64url");
    const base = getAppBaseUrl();

    return NextResponse.json({
      url: `${base}/api/auth/facebook/data-deletion/status?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    });
  } catch (err) {
    console.error("[FACEBOOK_DATA_DELETION]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// Status page Facebook redirects users to
export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get("code");
  return new Response(
    `<!DOCTYPE html><html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>حذف البيانات - FitZone</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#111;color:#fff}
.box{text-align:center;padding:2rem;border-radius:1rem;border:1px solid #333;max-width:400px}
h1{color:#22c55e;font-size:1.5rem}p{color:#9ca3af;line-height:1.6}</style></head>
<body><div class="box">
<h1>✓ تم حذف البيانات</h1>
<p>تم تنفيذ طلب حذف بيانات فيسبوك الخاصة بك من تطبيق FitZone بنجاح.</p>
${code ? `<p style="font-size:0.75rem;color:#6b7280">كود التأكيد: ${code}</p>` : ""}
</div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
