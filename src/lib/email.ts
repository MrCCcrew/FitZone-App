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

const FROM = `"فيت زون" <${process.env.SMTP_USER ?? "info@fitzoneland.com"}>`;

export async function sendVerificationEmail(email: string, name: string, code: string) {
  try {
    await getTransporter().sendMail({
      from: FROM,
      to: email,
      subject: "كود تفعيل حسابك في فيت زون 🏋️‍♀️",
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #111; color: #fff; border-radius: 12px; overflow: hidden;">
          <div style="background: #dc2626; padding: 28px 32px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px; font-weight: 900; letter-spacing: 1px;">FIT<span style="color: #fbbf24;">ZONE</span></h1>
            <p style="margin: 6px 0 0; font-size: 13px; color: rgba(255,255,255,0.8);">FITNESS CLUB • بني سويف</p>
          </div>
          <div style="padding: 32px;">
            <p style="font-size: 17px; font-weight: 700; color: #fff; margin: 0 0 8px;">أهلًا ${name} 👋</p>
            <p style="font-size: 14px; color: #9ca3af; line-height: 1.7; margin: 0 0 24px;">
              تم إنشاء حسابك بنجاح في فيت زون. استخدمي الكود أدناه لتفعيل بريدك الإلكتروني.
            </p>
            <div style="background: #1f1f1f; border: 2px solid #dc2626; border-radius: 12px; padding: 24px; text-align: center; margin: 0 0 24px;">
              <p style="margin: 0 0 8px; font-size: 13px; color: #9ca3af;">كود التفعيل</p>
              <p style="margin: 0; font-size: 42px; font-weight: 900; letter-spacing: 12px; color: #fbbf24; font-family: monospace;">${code}</p>
              <p style="margin: 12px 0 0; font-size: 12px; color: #6b7280;">صالح لمدة 24 ساعة</p>
            </div>
            <p style="font-size: 13px; color: #6b7280; margin: 0;">إذا لم تقومي بالتسجيل، تجاهلي هذا البريد.</p>
          </div>
          <div style="background: #1a1a1a; padding: 16px 32px; text-align: center;">
            <p style="margin: 0; font-size: 12px; color: #6b7280;">© 2026 FitZone Fitness Club • fitzoneland.com</p>
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
    const endStr = endDate.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    await getTransporter().sendMail({
      from: FROM,
      to: email,
      subject: `تم تفعيل اشتراكك في باقة ${planName} ✅`,
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #111; color: #fff; border-radius: 12px; overflow: hidden;">
          <div style="background: #dc2626; padding: 28px 32px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px; font-weight: 900; letter-spacing: 1px;">FIT<span style="color: #fbbf24;">ZONE</span></h1>
            <p style="margin: 6px 0 0; font-size: 13px; color: rgba(255,255,255,0.8);">FITNESS CLUB • بني سويف</p>
          </div>
          <div style="padding: 32px;">
            <p style="font-size: 17px; font-weight: 700; color: #fff; margin: 0 0 8px;">مبروك ${name} 🎉</p>
            <p style="font-size: 14px; color: #9ca3af; line-height: 1.7; margin: 0 0 24px;">
              تم تفعيل اشتراكك بنجاح في فيت زون. يسعدنا انضمامك لعائلتنا!
            </p>
            <div style="background: #1f1f1f; border: 2px solid #fbbf24; border-radius: 12px; padding: 24px; margin: 0 0 20px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 14px; padding-bottom: 14px; border-bottom: 1px solid #2a2a2a;">
                <span style="color: #9ca3af; font-size: 13px;">الباقة</span>
                <span style="color: #fbbf24; font-weight: 900; font-size: 15px;">باقة ${planName}</span>
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
            <p style="font-size: 13px; color: #6b7280; margin: 0;">للاستفسار: <a href="mailto:info@fitzoneland.com" style="color: #dc2626;">info@fitzoneland.com</a></p>
          </div>
          <div style="background: #1a1a1a; padding: 16px 32px; text-align: center;">
            <p style="margin: 0; font-size: 12px; color: #6b7280;">© 2026 FitZone Fitness Club • fitzoneland.com</p>
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
