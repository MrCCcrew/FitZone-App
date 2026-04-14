import type { CoachIntent } from "@/lib/ai-coach/types";

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matches(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

export function detectCoachIntent(message: string): CoachIntent {
  const text = normalize(message);

  if (!text) return "unknown";

  // Greetings
  if (matches(text, [/^(اهلا|السلام|مرحبا|هاي|hello|hi|hey)\b/, /\bازيك\b/, /\bعامل ايه\b/])) return "greeting";

  // Human handoff
  if (matches(text, [/\bموظف\b/, /\bدعم\b/, /\bاكلم\b.*\bموظف/, /\bhuman\b/, /\blive support\b/])) return "human_handoff";

  // Complaints
  if (matches(text, [/\bشكوى\b/, /\bcomplaint\b/, /\bمشكله\b/, /\bproblem\b/])) return "complaint_help";

  // Check-in — before food so "وزني" doesn't match food
  if (
    matches(text, [
      /\bوزني اليوم\b/,
      /\baليوم وزني\b/,
      /\bوزنت نفسي\b/,
      /\bسجلي وزني\b/,
      /\bقياسي اليوم\b/,
      /\bcheck.?in\b/,
      /\bوزني\s+\d/,
      /\d+\s*(?:كيلو|kg)\b.*(?:وزن|weight)/,
      /(?:وزن|weight).*\d+\s*(?:كيلو|kg)/,
    ])
  )
    return "check_in";

  // Food check
  if (
    matches(text, [
      /\باكلت\b/, /\bاكل\b/, /\bوجبه\b/, /\bعشا\b/, /\bغدا\b/, /\bفطار\b/, /\bوجبات\b/,
      /\bطعام\b/, /\bاكلتي\b/, /\bمناسب للتخسيس\b/, /\bاخف عشا\b/, /\bاخف وجبه\b/,
      /\bبروتين\b/, /\bسعرات\b/, /\bكالوريز\b/, /\bرز\b/, /\bفراخ\b/,
      /\bخضار\b/, /\bسلطه\b/, /\bصدر فراخ\b/, /\bلحمه\b/, /\bسمك\b/, /\bبيض\b/,
      /\bمكرونه\b/, /\bخبز\b/, /\bكيك\b/, /\bشيبس\b/, /\bمشويات\b/,
      /food check/, /\bnutrition\b/, /\beat\b/, /\bmeal\b/, /\bdiet check\b/,
    ])
  )
    return "food_check";

  // Pricing / membership
  if (matches(text, [/\bسعر\b/, /\bاسعار\b/, /\bprice\b/, /\bpricing\b/, /\bاشتراك\b/, /\bعضويه\b/, /\bmembership\b/])) return "pricing";
  if (matches(text, [/\bرشحي\b.*\bباقه\b/, /\bباقه\b/, /\bعضويه مناسبه\b/, /\brecommend\b.*\bmembership\b/, /\bابد[اأ]ي رحلتك\b/])) return "membership_recommendation";

  // Classes
  if (matches(text, [/\bكلاس\b/, /\bحصه\b/, /\bclass\b/, /\bworkout class\b/, /\bالتخسيس\b/, /\bشد الجسم\b/, /\bرشحي لي كلاس\b/])) return "class_recommendation";

  // Schedule
  if (matches(text, [/\bمواعيد\b/, /\bالنهارده\b/, /\bاليوم\b/, /\bschedule\b/, /\btoday\b/, /\bclasses today\b/])) return "schedule_lookup";

  // Booking
  if (matches(text, [/\bحجز\b/, /\bاحجز\b/, /\bbooking\b/, /\bbook\b/, /\bsession\b/])) return "booking_help";

  // Account
  if (matches(text, [/\bاشتراكي\b/, /\bمحفظتي\b/, /\bنقاطي\b/, /\bحجوزاتي\b/, /\baccount\b/, /\bwallet\b/, /\brewards\b/])) return "account_summary";

  // Offers
  if (matches(text, [/\bعرض\b/, /\bعروض\b/, /\boffer\b/, /\bdiscount\b/, /\bpromo\b/])) return "offer_lookup";

  // Trainers
  if (matches(text, [/\bمدرب\b/, /\bمدربه\b/, /\btrainer\b/, /\bcoach\b/])) return "trainer_info";

  // Products
  if (matches(text, [/\bمنتج\b/, /\bمتجر\b/, /\bshop\b/, /\bproduct\b/, /\bleggings\b/, /\bsupplement\b/])) return "product_help";

  // FAQ
  if (matches(text, [/\bساعات العمل\b/, /\bالعنوان\b/, /\bمكان\b/, /\blocation\b/, /\bopen\b/, /\bfaq\b/, /\bازاي\b/, /\bكيف\b/])) return "faq";

  return "unknown";
}
