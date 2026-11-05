import { FITZONE_TIMEZONE } from "@/lib/fitzone-time";

export type OfferAgeEligibilityResult =
  | {
      eligible: true;
      ageYears: number | null;
      code: null;
      message: null;
    }
  | {
      eligible: false;
      ageYears: number | null;
      code:
        | "BIRTH_DATE_REQUIRED"
        | "EGYPTIAN_NATIONAL_ID_REQUIRED"
        | "EGYPTIAN_NATIONAL_ID_INVALID"
        | "AGE_NOT_ELIGIBLE"
        | "INVALID_AGE_RULE";
      message: string;
    };

type DateParts = {
  year: number;
  month: number;
  day: number;
};

function calendarParts(
  value: Date,
): DateParts {
  const formatter =
    new Intl.DateTimeFormat("en-US", {
      timeZone: FITZONE_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

  const parts =
    formatter.formatToParts(value);

  const read = (
    type: "year" | "month" | "day",
  ) =>
    Number(
      parts.find(
        (part) => part.type === type,
      )?.value ?? 0,
    );

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
  };
}

export function getAgeYearsByCalendarDay(
  birthDate: Date,
  now = new Date(),
) {
  // Birth date is a date-only business value.
  // Never let its stored clock time or timezone shift the birthday.
  const birth = {
    year: birthDate.getUTCFullYear(),
    month: birthDate.getUTCMonth() + 1,
    day: birthDate.getUTCDate(),
  };

  // Eligibility is evaluated against the current Cairo calendar day.
  const today = calendarParts(now);

  let age =
    today.year - birth.year;

  const birthdayPassed =
    today.month > birth.month ||
    (today.month === birth.month &&
      today.day >= birth.day);

  if (!birthdayPassed) {
    age -= 1;
  }

  return age;
}

function rangeMessage(
  minAgeYears: number | null,
  maxAgeYears: number | null,
) {
  if (
    minAgeYears != null &&
    maxAgeYears != null
  ) {
    return `نعتذر، هذا العرض متاح للفئة العمرية من ${minAgeYears} إلى ${maxAgeYears} سنة فقط. يمكنكِ الاطلاع على باقي الاشتراكات والعروض المتاحة لكِ.`;
  }

  if (minAgeYears != null) {
    return `نعتذر، هذا العرض متاح من عمر ${minAgeYears} سنة فأكثر. يمكنكِ الاطلاع على باقي الاشتراكات والعروض المتاحة لكِ.`;
  }

  if (maxAgeYears != null) {
    return `نعتذر، هذا العرض متاح حتى عمر ${maxAgeYears} سنة. يمكنكِ الاطلاع على باقي الاشتراكات والعروض المتاحة لكِ.`;
  }

  return "نعتذر، لا تنطبق شروط العمر الخاصة بهذا العرض.";
}

export function evaluateOfferAgeEligibility(input: {
  requiresBirthDate: boolean;
  minAgeYears: number | null;
  maxAgeYears: number | null;
  birthDate: Date | null;
  now?: Date;
}): OfferAgeEligibilityResult {
  const {
    requiresBirthDate,
    minAgeYears,
    maxAgeYears,
    birthDate,
    now = new Date(),
  } = input;

  if (!requiresBirthDate && minAgeYears == null && maxAgeYears == null) {
    return {
      eligible: true,
      ageYears: null,
      code: null,
      message: null,
    };
  }

  if (
    (minAgeYears != null &&
      (!Number.isInteger(minAgeYears) ||
        minAgeYears < 0)) ||
    (maxAgeYears != null &&
      (!Number.isInteger(maxAgeYears) ||
        maxAgeYears < 0)) ||
    (minAgeYears != null &&
      maxAgeYears != null &&
      minAgeYears > maxAgeYears)
  ) {
    return {
      eligible: false,
      ageYears: null,
      code: "INVALID_AGE_RULE",
      message:
        "إعدادات شرط العمر لهذا العرض غير صحيحة. يرجى التواصل مع الإدارة.",
    };
  }

  if (!birthDate) {
    return {
      eligible: false,
      ageYears: null,
      code: "BIRTH_DATE_REQUIRED",
      message:
        "للاشتراك في هذا العرض، يرجى إدخال تاريخ الميلاد أولًا.",
    };
  }

  const ageYears =
    getAgeYearsByCalendarDay(
      birthDate,
      now,
    );

  // Negative ages indicate a future date of birth and cannot qualify.
  const belowMinimum =
    ageYears < 0 ||
    (minAgeYears != null && ageYears < minAgeYears);

  const aboveMaximum =
    maxAgeYears != null &&
    ageYears > maxAgeYears;

  if (
    belowMinimum ||
    aboveMaximum
  ) {
    return {
      eligible: false,
      ageYears,
      code: "AGE_NOT_ELIGIBLE",
      message: rangeMessage(
        minAgeYears,
        maxAgeYears,
      ),
    };
  }

  return {
    eligible: true,
    ageYears,
    code: null,
    message: null,
  };
}

/**
 * Format and embedded date validation only — does not verify ID ownership,
 * issuance, or current student enrollment. Do not log/persist the raw ID.
 */
export function parseEgyptianNationalIdBirthDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const number = value.trim().replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code <= 0x0669 ? code - 0x0660 : code - 0x06f0);
  });
  if (!/^[23][0-9]{13}$/.test(number)) return null;
  const year = (number[0] === "2" ? 1900 : 2000) + Number(number.slice(1, 3));
  const month = Number(number.slice(3, 5));
  const day = Number(number.slice(5, 7));
  const governorate = number.slice(7, 9);
  const knownGovernorates = new Set([
    "01", "02", "03", "04",
    "11", "12", "13", "14", "15", "16", "17", "18", "19",
    "21", "22", "23", "24", "25", "26", "27", "28", "29",
    "31", "32", "33", "34", "35", "88",
  ]);
  if (!knownGovernorates.has(governorate)) return null;
  const birthDate = new Date(Date.UTC(year, month - 1, day));
  if (birthDate.getUTCFullYear() !== year ||
      birthDate.getUTCMonth() + 1 !== month ||
      birthDate.getUTCDate() !== day) return null;
  return birthDate;
}

export function evaluateEgyptianNationalIdAgeEligibility(input: {
  egyptianNationalId: unknown;
  minAgeYears: number | null;
  maxAgeYears: number | null;
  now?: Date;
}): OfferAgeEligibilityResult {
  if (typeof input.egyptianNationalId !== "string" ||
      input.egyptianNationalId.trim() === "") {
    return {
      eligible: false, ageYears: null,
      code: "EGYPTIAN_NATIONAL_ID_REQUIRED",
      message: "للاشتراك في هذا العرض، يرجى إدخال الرقم القومي المصري المكوّن من 14 رقمًا.",
    };
  }
  const birthDate = parseEgyptianNationalIdBirthDate(input.egyptianNationalId);
  if (!birthDate) {
    return {
      eligible: false, ageYears: null,
      code: "EGYPTIAN_NATIONAL_ID_INVALID",
      message: "الرقم القومي غير صحيح. راجعي الـ14 رقمًا وتاريخ الميلاد المسجل داخله.",
    };
  }
  return evaluateOfferAgeEligibility({
    requiresBirthDate: true,
    birthDate,
    minAgeYears: input.minAgeYears,
    maxAgeYears: input.maxAgeYears,
    now: input.now,
  });
}
