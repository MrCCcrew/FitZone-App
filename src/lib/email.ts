import nodemailer from "nodemailer";
import type { MembershipInvoiceDetails } from "@/lib/membership-invoice";
import type { MembershipCardAttachment } from "@/lib/membership-card";

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
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? process.env.SMTP_USER ?? "info@fitzoneland.com";

type MembershipInvoiceAttachment = {
  details: MembershipInvoiceDetails;
  filename: string;
  content: Buffer;
};

function money(value: number) {
  return value.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
  scheduleRows: { date: Date; time: string; className: string; trainerName: string }[] = [],
  invoice?: MembershipInvoiceAttachment | null,
  membershipCard?: MembershipCardAttachment | null,
) {
  try {
    const endStr = endDate.toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const scheduleHtml = scheduleRows.length
      ? `
            <div style="margin-top: 18px;">
              <div style="font-size: 14px; color: #f8b4d9; font-weight: 800; margin-bottom: 8px;">مواعيدك الأسبوعية</div>
              <div style="background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 10px; padding: 12px;">
                <table style="width: 100%; border-collapse: collapse;">
                  ${scheduleRows
                    .map((row) => {
                      const dateStr = row.date.toLocaleDateString("ar-EG", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      });
                      return `
                      <tr style="border-bottom: 1px solid #2a2a2a;">
                        <td style="padding: 8px 4px; color: #fff; font-weight: 700; font-size: 13px;">${row.className}</td>
                        <td style="padding: 8px 4px; color: #9ca3af; font-size: 12px;">${row.trainerName}</td>
                        <td style="padding: 8px 4px; color: #9ca3af; font-size: 12px; text-align: left;">${dateStr} - ${row.time}</td>
                      </tr>
                      `;
                    })
                    .join("")}
                </table>
              </div>
            </div>
          `
      : "";

    const invoiceHtml = invoice
      ? `
            <div style="margin-top: 18px; background: #1f1f1f; border: 1px solid #2a2a2a; border-radius: 12px; padding: 18px;">
              <div style="font-size: 14px; color: #f8b4d9; font-weight: 800; margin-bottom: 10px;">ملخص الفاتورة</div>
              <table style="width:100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #9ca3af; font-size: 13px; border-bottom: 1px solid #2a2a2a;">رقم الفاتورة</td>
                  <td style="padding: 8px 0; color: #fff; font-weight: 700; font-size: 13px; border-bottom: 1px solid #2a2a2a; text-align: left;">${invoice.details.invoiceNumber}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #9ca3af; font-size: 13px; border-bottom: 1px solid #2a2a2a;">السعر الأصلي</td>
                  <td style="padding: 8px 0; color: #fff; font-weight: 700; font-size: 13px; border-bottom: 1px solid #2a2a2a; text-align: left;">${money(invoice.details.originalPrice)} ج.م</td>
                </tr>
                ${invoice.details.membershipDiscount > 0 ? `
                <tr>
                  <td style="padding: 8px 0; color: #9ca3af; font-size: 13px; border-bottom: 1px solid #2a2a2a;">خصم الباقة</td>
                  <td style="padding: 8px 0; color: #4ade80; font-weight: 700; font-size: 13px; border-bottom: 1px solid #2a2a2a; text-align: left;">- ${money(invoice.details.membershipDiscount)} ج.م</td>
                </tr>` : ""}
                ${invoice.details.discountCodeAmount > 0 ? `
                <tr>
                  <td style="padding: 8px 0; color: #9ca3af; font-size: 13px; border-bottom: 1px solid #2a2a2a;">${invoice.details.discountCode ? `خصم الكود (${invoice.details.discountCode})` : "خصم إضافي"}</td>
                  <td style="padding: 8px 0; color: #4ade80; font-weight: 700; font-size: 13px; border-bottom: 1px solid #2a2a2a; text-align: left;">- ${money(invoice.details.discountCodeAmount)} ج.م</td>
                </tr>` : ""}
                ${(invoice.details.walletDeduct ?? 0) > 0 ? `
                <tr>
                  <td style="padding: 8px 0; color: #9ca3af; font-size: 13px; border-bottom: 1px solid #2a2a2a;">خصم من المحفظة</td>
                  <td style="padding: 8px 0; color: #4ade80; font-weight: 700; font-size: 13px; border-bottom: 1px solid #2a2a2a; text-align: left;">- ${money(invoice.details.walletDeduct ?? 0)} ج.م</td>
                </tr>` : ""}
                ${(invoice.details.pointsDeduct ?? 0) > 0 ? `
                <tr>
                  <td style="padding: 8px 0; color: #9ca3af; font-size: 13px; border-bottom: 1px solid #2a2a2a;">خصم نقاط المكافآت</td>
                  <td style="padding: 8px 0; color: #4ade80; font-weight: 700; font-size: 13px; border-bottom: 1px solid #2a2a2a; text-align: left;">- ${money(invoice.details.pointsDeduct ?? 0)} ج.م</td>
                </tr>` : ""}
                <tr>
                  <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">الإجمالي المدفوع</td>
                  <td style="padding: 8px 0; color: #f8b4d9; font-weight: 900; font-size: 14px; text-align: left;">${money(invoice.details.finalAmount)} ج.م</td>
                </tr>
              </table>
              <div style="margin-top: 12px; font-size: 12px; color: #94a3b8;">تم إرفاق فاتورة PDF مع هذه الرسالة.</div>
            </div>
          `
      : "";

    const membershipCardHtml = membershipCard
      ? `
            <div style="margin-top: 18px; background: #1f1f1f; border: 1px solid #2a2a2a; border-radius: 12px; padding: 18px;">
              <div style="font-size: 14px; color: #f8b4d9; font-weight: 800; margin-bottom: 10px;">كارت العضوية و QR الحضور</div>
              <div style="background: linear-gradient(135deg,#2f1020,#571133); border: 1px solid rgba(248,180,217,0.22); border-radius: 14px; padding: 14px;">
                <img src="${membershipCard.previewDataUrl}" alt="Membership QR Card" style="display:block; width:100%; max-width:420px; margin:0 auto; border-radius:12px;" />
              </div>
              <div style="margin-top: 12px; font-size: 12px; color: #94a3b8; line-height: 1.8;">
                تم إرفاق كارت العضوية كملف منفصل مع هذه الرسالة. يمكنك الاحتفاظ به على الهاتف واستخدامه عند الوصول إلى الجيم لتسجيل الحضور.
              </div>
            </div>
          `
      : "";

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
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 10px 0; color: #9ca3af; font-size: 13px; border-bottom: 1px solid #2a2a2a;">الباقة</td>
                  <td style="padding: 10px 0; color: #f8b4d9; font-weight: 900; font-size: 15px; border-bottom: 1px solid #2a2a2a; text-align: left;">${planName}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #9ca3af; font-size: 13px; ${walletBonus && walletBonus > 0 ? "border-bottom: 1px solid #2a2a2a;" : ""}">صالح حتى</td>
                  <td style="padding: 10px 0; color: #fff; font-weight: 700; font-size: 13px; ${walletBonus && walletBonus > 0 ? "border-bottom: 1px solid #2a2a2a;" : ""} text-align: left;">${endStr}</td>
                </tr>
                ${walletBonus && walletBonus > 0 ? `
                <tr>
                  <td style="padding: 10px 0; color: #9ca3af; font-size: 13px;">مكافأة المحفظة</td>
                  <td style="padding: 10px 0; color: #4ade80; font-weight: 700; font-size: 13px; text-align: left;">+${walletBonus} ج.م</td>
                </tr>` : ""}
              </table>
            </div>
            ${membershipCardHtml}
            ${invoiceHtml}
            ${scheduleHtml}
            <p style="font-size: 13px; color: #94a3b8; margin: 0;">
              لأي استفسار: <a href="mailto:info@fitzoneland.com" style="color: #f8b4d9;">info@fitzoneland.com</a>
            </p>
          </div>
          <div style="background: #18181b; padding: 16px 32px; text-align: center;">
            <p style="margin: 0; font-size: 12px; color: #6b7280;">© 2026 FitZone Fitness Club</p>
          </div>
        </div>
      `,
      attachments: [
        ...(invoice
          ? [
              {
                filename: invoice.filename,
                content: invoice.content,
                contentType: "application/pdf",
              },
            ]
          : []),
        ...(membershipCard
          ? [
              {
                filename: membershipCard.filename,
                content: membershipCard.content,
                contentType: membershipCard.contentType,
              },
            ]
          : []),
      ],
    });
    return true;
  } catch (err) {
    console.error("[EMAIL_SUBSCRIPTION]", err);
    return false;
  }
}

export async function sendContactEmail(opts: {
  senderName: string;
  senderEmail: string;
  subject: string;
  message: string;
}) {
  try {
    await getTransporter().sendMail({
      from: FROM,
      to: ADMIN_EMAIL,
      replyTo: opts.senderEmail,
      subject: `[اتصل بنا] ${opts.subject}`,
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #111; color: #fff; border-radius: 12px; overflow: hidden;">
          <div style="background: #e91e63; padding: 24px 32px; text-align: center;">
            <h1 style="margin: 0; font-size: 26px; font-weight: 900; letter-spacing: 1px;">FIT<span style="color: #f8b4d9;">ZONE</span></h1>
            <p style="margin: 6px 0 0; font-size: 13px; color: rgba(255,255,255,0.8);">رسالة جديدة من العميل</p>
          </div>
          <div style="padding: 28px 32px;">
            <table style="width:100%; border-collapse: collapse; margin-bottom: 20px;">
              <tr>
                <td style="padding: 10px 0; color: #9ca3af; font-size: 13px; width: 110px; border-bottom: 1px solid #222;">الاسم</td>
                <td style="padding: 10px 0; color: #fff; font-weight: 700; font-size: 14px; border-bottom: 1px solid #222;">${opts.senderName}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #9ca3af; font-size: 13px; border-bottom: 1px solid #222;">البريد</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #222;">
                  <a href="mailto:${opts.senderEmail}" style="color: #f8b4d9; font-weight: 700; font-size: 14px;">${opts.senderEmail}</a>
                </td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #9ca3af; font-size: 13px; border-bottom: 1px solid #222;">الموضوع</td>
                <td style="padding: 10px 0; color: #fff; font-weight: 700; font-size: 14px; border-bottom: 1px solid #222;">${opts.subject}</td>
              </tr>
            </table>
            <div style="background: #1f1f1f; border: 1px solid #2a2a2a; border-radius: 10px; padding: 18px;">
              <p style="margin: 0 0 8px; font-size: 12px; color: #9ca3af;">الرسالة</p>
              <p style="margin: 0; font-size: 14px; color: #e5e7eb; line-height: 1.8; white-space: pre-wrap;">${opts.message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
            </div>
            <p style="margin: 18px 0 0; font-size: 12px; color: #6b7280;">
              للرد على العميل مباشرة اضغط Reply — الرد سيذهب إلى <span style="color:#f8b4d9;">${opts.senderEmail}</span>
            </p>
          </div>
          <div style="background: #18181b; padding: 14px 32px; text-align: center;">
            <p style="margin: 0; font-size: 12px; color: #6b7280;">© 2026 FitZone Fitness Club</p>
          </div>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error("[EMAIL_CONTACT]", err);
    return false;
  }
}

export async function sendPasswordResetEmail(email: string, name: string, resetUrl: string) {
  try {
    await getTransporter().sendMail({
      from: FROM,
      to: email,
      subject: "إعادة ضبط كلمة المرور في FitZone",
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #111; color: #fff; border-radius: 12px; overflow: hidden;">
          <div style="background: #e91e63; padding: 28px 32px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px; font-weight: 900; letter-spacing: 1px;">FIT<span style="color: #f8b4d9;">ZONE</span></h1>
            <p style="margin: 6px 0 0; font-size: 13px; color: rgba(255,255,255,0.8);">بني سويف - مصر</p>
          </div>
          <div style="padding: 32px;">
            <p style="font-size: 17px; font-weight: 700; color: #fff; margin: 0 0 8px;">مرحبًا ${name}،</p>
            <p style="font-size: 14px; color: #cbd5e1; line-height: 1.8; margin: 0 0 24px;">
              تلقينا طلبًا لإعادة ضبط كلمة المرور الخاصة بحسابك. إذا كان هذا الطلب منك، استخدم الزر التالي لاختيار كلمة مرور جديدة.
            </p>
            <div style="text-align: center; margin: 0 0 24px;">
              <a href="${resetUrl}" style="display: inline-block; background: #e91e63; color: #fff; text-decoration: none; padding: 14px 24px; border-radius: 12px; font-weight: 700;">
                إعادة ضبط كلمة المرور
              </a>
            </div>
            <p style="font-size: 13px; color: #94a3b8; line-height: 1.8; margin: 0 0 12px;">
              إذا لم يعمل الزر، انسخ هذا الرابط وافتحه في المتصفح:
            </p>
            <p style="font-size: 12px; color: #f8b4d9; line-height: 1.8; word-break: break-all; margin: 0 0 20px;">
              ${resetUrl}
            </p>
            <p style="font-size: 13px; color: #94a3b8; line-height: 1.8; margin: 0;">
              إذا لم تطلب إعادة ضبط كلمة المرور، يمكنك تجاهل هذه الرسالة بأمان.
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
    console.error("[EMAIL_PASSWORD_RESET]", err);
    return false;
  }
}

export async function sendGiftTrialEmail(opts: {
  email: string;
  name: string;
  className: string;
  trainerName: string;
  scheduleDate: Date;
  scheduleTime: string;
  note: string | null;
  membershipCard: import("@/lib/membership-card").MembershipCardAttachment | null;
  qrPngBuffer: Buffer | null;
}) {
  const { email, name, className, trainerName, scheduleDate, scheduleTime, note, membershipCard, qrPngBuffer } = opts;
  const dateStr = scheduleDate.toLocaleDateString("ar-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // QR code embedded via CID (works in all email clients, unlike base64 data URLs)
  const qrCid = "qrcode@fitzone.gift";
  const qrHtml = qrPngBuffer
    ? `
      <div style="margin-top: 24px; background: #1f1f1f; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; text-align: center;">
        <div style="font-size: 14px; color: #f8b4d9; font-weight: 800; margin-bottom: 16px;">📱 رمز QR للحضور</div>
        <div style="display: inline-block; background: #ffffff; border-radius: 16px; padding: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.4);">
          <img src="cid:${qrCid}" alt="QR Code" width="220" height="220" style="display:block; border-radius: 8px;" />
        </div>
        <div style="margin-top: 14px; font-size: 12px; color: #94a3b8; line-height: 1.8;">
          أظهري هذا الرمز للمسؤولة عند الدخول لتسجيل حضورك تلقائيًا.<br/>
          كما تم إرفاق كارت العضوية كاملًا في ملف منفصل مع هذه الرسالة.
        </div>
      </div>`
    : "";

  const noteHtml = note
    ? `<div style="margin-top: 18px; background: #1f2937; border-right: 3px solid #f59e0b; border-radius: 8px; padding: 14px 18px; font-size: 13px; color: #fcd34d;">${note.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`
    : "";

  const attachments: Array<{ filename: string; content: Buffer; contentType: string; cid?: string }> = [];
  if (qrPngBuffer) {
    attachments.push({ filename: "qr-code.png", content: qrPngBuffer, contentType: "image/png", cid: qrCid });
  }
  if (membershipCard) {
    attachments.push({ filename: membershipCard.filename, content: membershipCard.content, contentType: membershipCard.contentType });
  }

  try {
    await getTransporter().sendMail({
      from: FROM,
      to: email,
      subject: "🎁 هدية من إدارة FitZone — حصة تجريبية مجانية",
      attachments,
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #111; color: #fff; border-radius: 16px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #7c3aed, #4f46e5); padding: 32px; text-align: center;">
            <div style="font-size: 40px; margin-bottom: 8px;">🎁</div>
            <h1 style="margin: 0 0 6px; font-size: 26px; font-weight: 900;">هدية مجانية من إدارة FitZone</h1>
            <p style="margin: 0; font-size: 14px; color: rgba(255,255,255,0.8);">حصة تجريبية بالكامل على حساب الجيم</p>
          </div>
          <div style="padding: 32px;">
            <p style="font-size: 17px; font-weight: 700; color: #fff; margin: 0 0 6px;">مرحبًا ${name}،</p>
            <p style="font-size: 14px; color: #cbd5e1; line-height: 1.8; margin: 0 0 24px;">
              يسعدنا إهداؤكِ حصة تجريبية مجانية كهدية من إدارة FitZone. نتمنى لكِ تجربة رائعة!
            </p>
            <div style="background: #1f1f1f; border: 1px solid #2a2a2a; border-radius: 12px; padding: 18px; margin-bottom: 18px;">
              <div style="font-size: 13px; color: #9ca3af; margin-bottom: 14px; font-weight: 700;">تفاصيل الحصة المهداة</div>
              <table style="width:100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #9ca3af; font-size: 13px; border-bottom: 1px solid #2a2a2a;">الكلاس</td>
                  <td style="padding: 8px 0; color: #fff; font-weight: 800; font-size: 14px; border-bottom: 1px solid #2a2a2a; text-align: left;">${className}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #9ca3af; font-size: 13px; border-bottom: 1px solid #2a2a2a;">المدربة</td>
                  <td style="padding: 8px 0; color: #fff; font-weight: 700; font-size: 13px; border-bottom: 1px solid #2a2a2a; text-align: left;">${trainerName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #9ca3af; font-size: 13px; border-bottom: 1px solid #2a2a2a;">الموعد</td>
                  <td style="padding: 8px 0; color: #fff; font-weight: 700; font-size: 13px; border-bottom: 1px solid #2a2a2a; text-align: left;">${dateStr} — ${scheduleTime}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #9ca3af; font-size: 13px;">التكلفة</td>
                  <td style="padding: 8px 0; color: #4ade80; font-weight: 900; font-size: 15px; text-align: left;">مجانًا 🎁</td>
                </tr>
              </table>
            </div>
            ${noteHtml}
            ${qrHtml}
            <div style="margin-top: 24px; background: #1f2937; border: 1px solid #374151; border-radius: 10px; padding: 14px 18px;">
              <div style="font-size: 13px; color: #9ca3af; margin-bottom: 6px; font-weight: 700;">كيفية استخدام الهدية</div>
              <ol style="margin: 0; padding-right: 18px; font-size: 13px; color: #d1d5db; line-height: 2;">
                <li>احضري في الموعد المحدد أعلاه.</li>
                <li>أظهري رمز QR أو الكارت المرفق للمسؤولة عند الدخول.</li>
                <li>سيتم تسجيل حضورك تلقائيًا.</li>
              </ol>
            </div>
          </div>
          <div style="background: #18181b; padding: 16px 32px; text-align: center;">
            <p style="margin: 0; font-size: 12px; color: #6b7280;">© 2026 FitZone Fitness Club — بني سويف، مصر</p>
          </div>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error("[EMAIL_GIFT_TRIAL]", err);
    return false;
  }
}
