import { describe, expect, it } from "vitest";
import { understandCoachMessage } from "@/lib/ai-coach/understanding";
import { COACH_PAGES, pageAction } from "@/lib/ai-coach/page-registry";

describe("AI Coach UAT Arabic intent matrix", () => {
  it.each([
    ["والمدربات؟", "trainer_lookup"],
    ["بالنسبة للمدربات", "trainer_lookup"],
    ["أفضل مدربة ايه؟", "trainer_recommendation"],
    ["اقدر استفاد من الشركاء بايه؟", "partner_info"],
    ["مين الشركاء؟", "partner_info"],
    ["في دكتورة للتغذية؟", "nutritionist_service"],
    ["مواعيد دكتورة التغذية", "nutritionist_service"],
    ["ايه الاهداف المتاحة اللي اقدر اختارها؟", "goals_list"],
    ["لا اهداف من خلالها اختار اشتراك", "goals_list"],
    ["عايزة أخس", "goals_list"],
    ["العروض الموجودة في الجيم", "offer_lookup"],
  ] as const)("routes %s to %s", async (message, intent) => {
    await expect(understandCoachMessage(message, "ar")).resolves.toMatchObject({ intent });
  });

  it("keeps trainer as the active entity for short follow-ups", async () => {
    await expect(understandCoachMessage("أفضل واحدة؟", "ar", { currentEntity: "trainers" })).resolves.toMatchObject({ intent: "trainer_recommendation", contextReference: true });
  });

  it("always uses the Arabic registry label for Arabic customer actions", () => {
    for (const page of COACH_PAGES) expect(pageAction(page, "ar").label).toBe(page.labelAr);
    expect(pageAction(COACH_PAGES.find((page) => page.id === "classes")!, "ar").label).toBe("عرض الكلاسات والمواعيد");
    expect(pageAction(COACH_PAGES.find((page) => page.id === "store")!, "ar").label).toBe("فتح المتجر");
    expect(pageAction(COACH_PAGES.find((page) => page.id === "offers")!, "ar").label).toBe("عرض العروض");
  });
});
