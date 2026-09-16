import { PUBLIC_TIME_ZONE, cairoDayWindow } from "@/lib/public-catalog";

export type ScheduleWeekday =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

export type ScheduleTemporalFilter = {
  date?: "today" | "tomorrow";
  weekday?: ScheduleWeekday;
};

const WEEKDAYS: Array<{
  key: ScheduleWeekday;
  index: number;
  patterns: RegExp[];
}> = [
  { key: "sunday", index: 0, patterns: [/(?:الاحد|الأحد|sunday)/i] },
  { key: "monday", index: 1, patterns: [/(?:الاثنين|الإثنين|الاتنين|monday)/i] },
  { key: "tuesday", index: 2, patterns: [/(?:الثلاثاء|التلات|التلاتاء|tuesday)/i] },
  { key: "wednesday", index: 3, patterns: [/(?:الاربعاء|الأربعاء|wednesday)/i] },
  { key: "thursday", index: 4, patterns: [/(?:الخميس|thursday)/i] },
  { key: "friday", index: 5, patterns: [/(?:الجمعه|الجمعة|friday)/i] },
  { key: "saturday", index: 6, patterns: [/(?:السبت|saturday)/i] },
];

const cairoWeekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PUBLIC_TIME_ZONE,
  weekday: "short",
});

const CAIRO_DAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function extractScheduleTemporalFilter(
  value: string,
): ScheduleTemporalFilter {
  if (/(?:النهارده|النهاردة|اليوم|today)/i.test(value)) {
    return { date: "today" };
  }

  if (/(?:بكره|بكرة|بكرا|tomorrow)/i.test(value)) {
    return { date: "tomorrow" };
  }

  for (const weekday of WEEKDAYS) {
    if (weekday.patterns.some((pattern) => pattern.test(value))) {
      return { weekday: weekday.key };
    }
  }

  return {};
}

export function stripScheduleTemporalTerms(value: string): string {
  return value
    .replace(
      /(?:النهارده|النهاردة|اليوم|بكره|بكرة|بكرا|today|tomorrow)/gi,
      " ",
    )
    .replace(
      /(?:يوم\s+)?(?:الاحد|الأحد|الاثنين|الإثنين|الاتنين|الثلاثاء|التلات|التلاتاء|الاربعاء|الأربعاء|الخميس|الجمعه|الجمعة|السبت|sunday|monday|tuesday|wednesday|thursday|friday|saturday)/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function scheduleTemporalDayWindow(
  now: Date,
  filter?: ScheduleTemporalFilter,
) {
  if (!filter) return null;

  if (filter.date === "today") {
    return cairoDayWindow(now, 0);
  }

  if (filter.date === "tomorrow") {
    return cairoDayWindow(now, 1);
  }

  if (!filter.weekday) return null;

  const currentLabel = cairoWeekdayFormatter.format(now);
  const currentIndex = CAIRO_DAY_INDEX[currentLabel];

  const target = WEEKDAYS.find((item) => item.key === filter.weekday);
  if (currentIndex == null || !target) return null;

  const offset = (target.index - currentIndex + 7) % 7;
  return cairoDayWindow(now, offset);
}
