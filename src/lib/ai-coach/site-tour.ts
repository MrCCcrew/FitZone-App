import { COACH_PAGES, type CoachPage } from "@/lib/ai-coach/page-registry";
import { normalizeArabicIntent } from "@/lib/ai-coach/intents";
import type { CoachLang } from "@/lib/ai-coach/types";

const ORDER: CoachPage["id"][] = ["home", "classes", "memberships", "offers", "trainers", "nutritionist", "store", "blog", "partners", "account"];
const narration: Partial<Record<CoachPage["id"], [string, string]>> = {
  home: ["دي الرئيسية: منها تقدري توصلي لأهم خدمات FitZone وتبدئي من القسم اللي يهمك.", "This is the home page, where you can reach FitZone's main services."],
  classes: ["هنا الكلاسات والجدول. شوفي المواعيد واختاري النشاط المناسب لمستواكي.", "Here are the classes and schedule. Choose what suits your level."],
  memberships: ["هنا الاشتراكات والباقات المتاحة. قارني المزايا واختاري اللي يناسب هدفك.", "Here are available memberships and packages to compare."],
  offers: ["هنا العروض الظاهرة حاليًا. التفاصيل الموجودة في الصفحة هي المرجع النهائي.", "Here are the currently visible offers."],
  trainers: ["هنا المدربات وتخصصاتهن المنشورة، علشان تختاري الدعم الأقرب لهدفك.", "Here are the published trainers and their specialties."],
  nutritionist: ["هنا خدمة أخصائية التغذية للحالات التي تحتاج متابعة وخطة أكثر تخصيصًا.", "This is the nutrition specialist service for more tailored support."],
  store: ["هنا المتجر والمنتجات المتاحة. تقدري تتصفحي الأقسام الظاهرة وتختاري المناسب.", "This is the store and its visible products."],
  blog: ["هنا المدونة والمقالات، فيها محتوى يساعدك تفهمي التدريب والتغذية بشكل أبسط.", "This is the blog with training and nutrition articles."],
  partners: ["هنا شركاء FitZone والمعلومات المنشورة عنهم.", "Here are FitZone's published partners."],
  account: ["هنا حسابك الشخصي، لمتابعة بياناتك وحجوزاتك بعد تسجيل الدخول.", "This is your personal account for your own details and bookings."],
};

export function siteTourPages(authenticated: boolean) { return ORDER.map((id) => COACH_PAGES.find((page) => page.id === id)).filter((page): page is CoachPage => page !== undefined && (!page.requiredAuth || authenticated)); }
export function isSiteTourRequest(message: string) { return /(?:كلميني عن الموقع|عرفيني علي الموقع|اشرحيلي الموقع|خديلي جوله في الموقع|اعمليلي جوله في الموقع|وريني الموقع|ايه الموجود في الموقع|قوليلي اقسام الموقع)/.test(normalizeArabicIntent(message).replace(/ة/g, "ه")); }
export function siteTourCommand(message: string) { const text = normalizeArabicIntent(message).replace(/ة/g, "ه"); return /^(?:التالي|next)$/.test(text) ? "next" : /^(?:السابق|previous|prev)$/.test(text) ? "previous" : /(?:وقفي الجوله|اوقفي الجوله|stop tour)/.test(text) ? "stop" : /(?:عيدي الشرح|اعيدي الشرح|repeat)/.test(text) ? "repeat" : null; }
export function tourNarration(page: CoachPage, lang: CoachLang, first = false) { const text = narration[page.id]?.[lang === "en" ? 1 : 0] ?? page.description; return first && lang === "ar" ? `تعالي أخدك في جولة داخل فيت زون. ${text}` : text; }
