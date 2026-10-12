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