import { describe, expect, it } from "vitest";
import { parseEgyptianNationalIdBirthDate, evaluateEgyptianNationalIdAgeEligibility } from "@/lib/offer-age-eligibility";
const today = new Date("2026-10-10T12:00:00Z");
const mk = (yyyy: number, mm: string, dd: string, gov = "01") =>
  (yyyy < 2000 ? "2" : "3") + String(yyyy).slice(2) + mm + dd + gov + "12345";
const check = (id: unknown) => evaluateEgyptianNationalIdAgeEligibility({
  egyptianNationalId: id, minAgeYears: 13, maxAgeYears: 25, now: today,
});

describe("Egyptian national ID student-offer age gate", () => {
  it("extracts DOB for both century prefixes", () => {
    expect(parseEgyptianNationalIdBirthDate(mk(2008,"10","10"))?.toISOString().slice(0,10)).toBe("2008-10-10");
    expect(parseEgyptianNationalIdBirthDate(mk(1999,"02","28"))?.toISOString().slice(0,10)).toBe("1999-02-28");
  });
  it("rejects absent, malformed or invalid-digit IDs", () => {
    expect(check("").code).toBe("EGYPTIAN_NATIONAL_ID_REQUIRED");
    for (const x of [null, "123", mk(2008,"10","10")+"7", "4"+mk(2008,"10","10").slice(1), mk(2008,"10","10","99"), mk(2008,"10","10").slice(0,-1)+"x"]) {
      expect(check(x).eligible).toBe(false);
    }
  });
  it("rejects impossible dates and invalid governorates", () => {
    for(const x of [mk(2013,"02","29"),mk(2008,"13","10"),mk(2008,"00","10"),mk(2008,"12","00"),mk(2008,"12","32")]){
      expect(check(x).code).toBe("EGYPTIAN_NATIONAL_ID_INVALID");
    }
    expect(check(mk(2008,"02","29")).eligible).toBe(true);
    expect(check(mk(2008,"10","10","88")).eligible).toBe(true);
    expect(check(mk(2008,"02","30")).code).toBe("EGYPTIAN_NATIONAL_ID_INVALID");
  });
  it("enforces exact 13 and 25 year birthdates against Cairo calendar day", () => {
    expect(check(mk(2013,"10","10")).eligible).toBe(true);
    expect(check(mk(2013,"10","11")).eligible).toBe(false);
    expect(check(mk(2000,"10","11")).eligible).toBe(true);
    expect(check(mk(2000,"10","10")).eligible).toBe(false);
    expect(check(mk(2027,"10","10")).eligible).toBe(false);
  });
  it("accepts Arabic-Indic digits", () => {
    const s = mk(2008,"10","10").replace(/[0-9]/g,x=>String.fromCharCode(0x0660+Number(x)));
    expect(check(s).eligible).toBe(true);
  });
});
