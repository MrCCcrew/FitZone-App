import nodemailer from "nodemailer";

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.hostinger.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: true,
    auth: {
      user: process.env.SMTP_USER ?? "",
      pass: process.env.SMTP_PASS ?? "",
    },
  });
}

const FROM = `"FitZone" <${process.env.SMTP_USER ?? "info@fitzoneland.com"}>`;

export async function sendVerificationEmail(email: string, name: string, code: string) {
  try {
    await getTransporter().sendMail({
      from: FROM,
      to: email,
      subject: "رمز تفعيل حسابك في FitZone",
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #111; color: #fff; border-radius: 12px; overflow: hidden;">
          <div style="background: #e91e63; padding: 28px 32px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px; font-weight: 900; letter-spacing: 1px;">FIT<span style="color: #f8b4d9;">ZONE</span></h1>
            <p style="margin: 6px 0 0; font-size: 13px; color: rgba(255,255,255,0.8);">بني سويف - مصر</p>
          </div>
          <div style="padding: 32px;">
            <p style="font-size: 17px; font-weight: 700; color: #fff; margin: 0 0 8px;">أهلًا ${name}،</p>
            <p style="font-size: 14px; color: #cbd5e1; line-height: 1.8; margin: 0 0 24px;">
              شكرًا لتسجيلك في FitZone. استخدم رمز التفعيل التالي لتأكيد بريدك الإلكتروني وإكمال تفعيل الحساب.
            </p>
            <div style="background: #1f1f1f; border: 2px solid #e91e63; border-radius: 12px; padding: 24px; text-align: center; margin: 0 0 24px;">
              <p style="margin: 0 0 8px; font-size: 13px; color: #9ca3af;">رمز التفعيل</p>
              <p style="margin: 0; font-size: 42px; font-weight: 900; letter-spacing: 12px; color: #f8b4d9; font-family: monospace;">${code}</p>
              <p style="margin: 12px 0 0; font-size: 12px; color: #6b7280;">الرمز صالح لمدة 24 ساعة</p>
            </div>
            <p style="font-size: 13px; color: #94a3b8; line-height: 1.8; margin: 0;">
              إذا لم تقم بإنشاء هذا الحساب، يمكنك تجاهل هذه الرسالة.
            </p>
          </div>
          <div style="background: #18181b; padding: 16px 32px; text-align: center;">
            <p style="margin: 0; font-size: 12px; color: #6b7280;">© 2026 FitZone Fitness Club</p>
          </div>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error("[EMAIL_VERIFY]", err);
    return false;
  }
}

export async function sendSubscriptionEmail(
  email: string,
  name: string,
  planName: string,
  endDate: Date,
  walletBonus?: number,
) {
  try {
    const endStr = endDate.toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    await getTransporter().sendMail({
      from: FROM,
      to: email,
      subject: `تم تفعيل اشتراكك في باقة ${planName}`,
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #111; color: #fff; border-radius: 12px; overflow: hidden;">
          <div style="background: #e91e63; padding: 28px 32px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px; font-weight: 900; letter-spacing: 1px;">FIT<span style="color: #f8b4d9;">ZONE</span></h1>
            <p style="margin: 6px 0 0; font-size: 13px; color: rgba(255,255,255,0.8);">بني سويف - مصر</p>
          </div>
          <div style="padding: 32px;">
            <p style="font-size: 17px; font-weight: 700; color: #fff; margin: 0 0 8px;">مبروك ${name}</p>
            <p style="font-size: 14px; color: #cbd5e1; line-height: 1.8; margin: 0 0 24px;">
              تم تفعيل اشتراكك بنجاح. يسعدنا انضمامك إلى FitZone.
            </p>
            <div style="background: #1f1f1f; border: 2px solid #f8b4d9; border-radius: 12px; padding: 24px; margin: 0 0 20px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 14px; padding-bottom: 14px; border-bottom: 1px solid #2a2a2a;">
                <span style="color: #9ca3af; font-size: 13px;">الباقة</span>
                <span style="color: #f8b4d9; font-weight: 900; font-size: 15px;">${planName}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 14px; padding-bottom: 14px; border-bottom: 1px solid #2a2a2a;">
                <span style="color: #9ca3af; font-size: 13px;">صالح حتى</span>
                <span style="color: #fff; font-weight: 700; font-size: 13px;">${endStr}</span>
              </div>
              ${walletBonus && walletBonus > 0 ? `
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #9ca3af; font-size: 13px;">مكافأة المحفظة</span>
                <span style="color: #4ade80; font-weight: 700; font-size: 13px;">+${walletBonus} ج.م</span>
              </div>` : ""}
            </div>
            <p style="font-size: 13px; color: #94a3b8; margin: 0;">
              لأي استفسار: <a href="mailto:info@fitzoneland.com" style="color: #f8b4d9;">info@fitzoneland.com</a>
            </p>
          </div>
          <div style="background: #18181b; padding: 16px 32px; text-align: center;">
            <p style="margin: 0; font-size: 12px; color: #6b7280;">© 2026 FitZone Fitness Club</p>
          </div>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error("[EMAIL_SUBSCRIPTION]", err);
    return false;
  }
}
