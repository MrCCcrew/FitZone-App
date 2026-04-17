// SMS / WhatsApp reminders via Twilio REST API (no SDK needed)
// Required env vars:
//   TWILIO_ACCOUNT_SID   – your Twilio Account SID
//   TWILIO_AUTH_TOKEN    – your Twilio Auth Token
//   TWILIO_FROM_NUMBER   – SMS sender  e.g. +12015551234
//                          OR for WhatsApp: whatsapp:+14155238886
//
// If TWILIO_FROM_NUMBER starts with "whatsapp:" the message is sent via WhatsApp.

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID ?? "";
const AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN  ?? "";
const FROM        = process.env.TWILIO_FROM_NUMBER ?? "";

function twilioEnabled() {
  return ACCOUNT_SID.length > 0 && AUTH_TOKEN.length > 0 && FROM.length > 0;
}

export async function sendSms(toPhone: string, message: string): Promise<boolean> {
  if (!twilioEnabled()) {
    console.warn("[SMS] Twilio not configured — skipping reminder to", toPhone);
    return false;
  }

  // Normalise Egyptian numbers to E.164 format
  let to = toPhone.replace(/\s/g, "");
  if (to.startsWith("0") && !to.startsWith("00")) to = "+2" + to.slice(1);
  else if (!to.startsWith("+")) to = "+2" + to;

  // WhatsApp requires the prefix on the To as well
  if (FROM.startsWith("whatsapp:") && !to.startsWith("whatsapp:")) {
    to = "whatsapp:" + to;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: FROM, Body: message }).toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[SMS] Twilio error:", err);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[SMS] Network error:", err);
    return false;
  }
}

export function buildReminderMessage(opts: {
  name: string;
  className: string;
  trainerName: string;
  dayLabel: string;
  time: string;
}): string {
  return (
    `مرحباً ${opts.name} 👋\n` +
    `تذكير بموعدك القادم في FitZone:\n` +
    `📌 ${opts.className} مع ${opts.trainerName}\n` +
    `📅 ${opts.dayLabel} الساعة ${opts.time}\n` +
    `نراكِ قريباً! 💪`
  );
}
