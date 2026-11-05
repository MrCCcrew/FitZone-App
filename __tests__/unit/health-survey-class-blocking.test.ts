import { describe, expect, it } from "vitest";

import {
  normalizeHealthClassTypeKey,
} from "@/lib/health-class-taxonomy";

function normalizeClassTypeKey(value: string) {
  return normalizeHealthClassTypeKey(value);
}

function blockedTypesFromSurvey(
  questions: Array<{
    id: string;
    restrictedClassTypes: string[];
  }>,
  answers: Record<string, { answer: boolean }>,
) {
  const blocked = new Set<string>();

  questions.forEach((question) => {
    if (answers[question.id]?.answer === true) {
      question.restrictedClassTypes.forEach((type) => {
        const key = normalizeClassTypeKey(type);
        if (key) blocked.add(key);
      });
    }
  });

  return [...blocked];
}

function filterClasses(
  classes: Array<{ id: string; type: string }>,
  blocked: string[],
) {
  const blockedSet = new Set(
    blocked.map((type) => normalizeClassTypeKey(type)),
  );

  return classes.filter((gymClass) => {
    const typeKey = normalizeClassTypeKey(gymClass.type);
    return !(typeKey && blockedSet.has(typeKey));
  });
}

describe("health survey class blocking regression", () => {
  it("blocks fitness when answered health question restricts fitness", () => {
    const blocked = blockedTypesFromSurvey(
      [{ id: "q1", restrictedClassTypes: ["fitness"] }],
      { q1: { answer: true } },
    );

    const visible = filterClasses(
      [
        { id: "fitness", type: "فيتنس" },
        { id: "dance", type: "رقص شرقي" },
      ],
      blocked,
    );

    expect(blocked).toEqual(["fitness"]);
    expect(visible.map((item) => item.id)).toEqual(["dance"]);
  });

  it("does not block classes when health answer is false", () => {
    const blocked = blockedTypesFromSurvey(
      [{ id: "q1", restrictedClassTypes: ["fitness"] }],
      { q1: { answer: false } },
    );

    expect(blocked).toEqual([]);
  });

  it("preserves current Arabic/English aliases", () => {
    expect(normalizeClassTypeKey("fitness")).toBe("fitness");
    expect(normalizeClassTypeKey("فيتنس")).toBe("fitness");

    expect(normalizeClassTypeKey("building")).toBe("building");
    expect(normalizeClassTypeKey("بيلدينج")).toBe("building");

    expect(normalizeClassTypeKey("kickboxing")).toBe("kickboxing");
    expect(normalizeClassTypeKey("كيك بوكس")).toBe("kickboxing");
  });

  it("documents current unmapped custom-type behavior", () => {
    // This intentionally freezes current behavior.
    // Do not change as part of the ClassType ID migration.
    expect(normalizeClassTypeKey("زومبا ميكس")).toBe("زومبا ميكس");
    expect(normalizeClassTypeKey("يوجا وبيلاتس")).toBe("يوجا وبيلاتس");
  });
});
