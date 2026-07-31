"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, CircleUserRound, CreditCard, ShoppingBag, Sparkles, Star, Target, Users } from "lucide-react";
import { useLang } from "@/lib/language";

type TourTarget = "goals" | "first-goal-membership-card" | "first-class-card" | "first-trainer-card" | "first-shop-product" | "account" | "ai-coach";
type TourPage = "memberships" | "classes" | "trainers" | "shop" | null;
type Step = { target: TourTarget; page: TourPage; icon: typeof Target; ar: { title: string; body: string }; en: { title: string; body: string } };

type Props = {
  onNavigate: (page: TourPage) => void;
  onFinishNavigate: (target: "goals") => void;
  onClose: (status: "completed" | "skipped") => void;
};

const COMPLETED_KEY = "fitzone_onboarding_completed_v1";
const STEPS: Step[] = [
  { target: "goals", page: "memberships", icon: Target, ar: { title: "اختاري هدفك", body: "اختاري النشاط أو الهدف المناسب لكِ، وسنعرض لكِ الاشتراكات والخدمات المرتبطة به." }, en: { title: "Choose your goal", body: "Select the activity or fitness goal that suits you, and we’ll show you the related services and memberships." } },
  { target: "first-goal-membership-card", page: "memberships", icon: CreditCard, ar: { title: "الاشتراكات المناسبة لهدفك", body: "بعد اختيار هدفك، يعرض لكِ FitZone الاشتراكات المناسبة له. قارني السعر والمدة وعدد الحصص والمميزات، ثم اختاري الأنسب لكِ." }, en: { title: "Memberships for your goal", body: "After choosing your goal, FitZone shows the memberships that suit it. Compare the price, duration, sessions, and benefits, then choose what fits you." } },
  { target: "first-class-card", page: "classes", icon: CalendarDays, ar: { title: "احجزي الكلاس المناسب", body: "تابعي مواعيد الكلاسات والسعة المتاحة، ثم احجزي الموعد المناسب حسب اشتراكك." }, en: { title: "Book the right class", body: "View available class times and capacity, then book the session that fits your membership." } },
  { target: "first-trainer-card", page: "trainers", icon: Users, ar: { title: "تعرّفي على المدربات", body: "شاهدي تخصصات المدربات واختاري الخدمة أو المدربة المناسبة لكِ." }, en: { title: "Meet the trainers", body: "Explore trainer specialties and choose the right trainer or service." } },
  { target: "first-shop-product", page: "shop", icon: ShoppingBag, ar: { title: "تسوّقي بسهولة", body: "تصفحي المنتجات، أضيفي ما تحتاجينه للسلة، وأكملي طلبك من داخل الموقع." }, en: { title: "Shop easily", body: "Browse products, add items to your cart, and complete your order from the website." } },
  { target: "account", page: null, icon: CircleUserRound, ar: { title: "كل تفاصيلك في حسابك", body: "تابعي اشتراكك، حجوزاتك، مدفوعاتك، محفظتك، نقاطك ومكافآتك من مكان واحد." }, en: { title: "Everything in one account", body: "Track your membership, bookings, payments, wallet, points, and rewards." } },
  { target: "ai-coach", page: null, icon: Sparkles, ar: { title: "متنسيش تزوري AI Coach", body: "مساعدكِ الذكي في FitZone هيساعدكِ في اختيار الاشتراك المناسب، فهم خدمات ومميزات الموقع، تنظيم أهدافكِ، والإجابة عن أسئلتكِ الرياضية والعامة." }, en: { title: "Don’t forget to visit AI Coach", body: "Your FitZone AI assistant can help you choose the right membership, understand the website features, organize your goals, and answer fitness and general questions." } },
];

const copy = {
  ar: { welcomeTitle: "أهلًا بكِ في FitZone", welcomeBody: "في جولة سريعة هنعرفكِ إزاي تختاري هدفك، تشوفي الاشتراكات، تحجزي الكلاسات، وتستفيدي من مميزات الموقع.", start: "ابدئي الجولة", skip: "تخطي الآن", previous: "السابق", next: "التالي", close: "إغلاق", finishTitle: "بقيتي جاهزة دلوقتي يا بطلة 🎉", finishBody: "اختاري هدفك، شوفي الاشتراكات المناسبة ليكِ، ومتنسيش إن AI Coach موجود يساعدك في أي وقت.", goals: "اختاري هدفك", memberships: "شاهدي الاشتراكات", finish: "إنهاء", step: "من" },
  en: { welcomeTitle: "Welcome to FitZone", welcomeBody: "Take a quick tour to learn how to choose your goal, explore memberships, book classes, and use the website features.", start: "Start tour", skip: "Skip for now", previous: "Previous", next: "Next", close: "Close", finishTitle: "You’re ready now, champion 🎉", finishBody: "Choose your goal, explore the memberships that suit you, and remember that AI Coach is always there to help.", goals: "Choose your goal", memberships: "Explore memberships", finish: "Finish", step: "of" },
};

export default function FitZoneTour({ onNavigate, onFinishNavigate, onClose }: Props) {
  const { lang } = useLang();
  const text = copy[lang === "en" ? "en" : "ar"];
  const [step, setStep] = useState(-1);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mascotAvailable, setMascotAvailable] = useState(true);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const measureFrameRef = useRef<number | null>(null);
  const targetObserverRef = useRef<MutationObserver | null>(null);
  const targetWaitTimeoutRef = useRef<number | null>(null);

  const targetElement = useCallback((target: TourTarget) => document.querySelector<HTMLElement>(`[data-tour="${target}"]`), []);
  const measure = useCallback((target: TourTarget) => {
    const element = targetElement(target);
    setTargetRect(element ? element.getBoundingClientRect() : null);
    return element;
  }, [targetElement]);

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const close = useCallback((status: "completed" | "skipped") => {
    localStorage.setItem(COMPLETED_KEY, "true");
    window.dispatchEvent(new Event("fitzone:tour-clear-goal"));
    onClose(status);
    requestAnimationFrame(() => previousFocus.current?.focus());
  }, [onClose]);

  const openViewAndWaitForTarget = useCallback((current: Step) => {
    onNavigate(current.page);
    if (current.target === "first-goal-membership-card") {
      window.dispatchEvent(new Event("fitzone:tour-show-goal-memberships"));
    }

    const revealTarget = () => {
      const element = targetElement(current.target);
      if (!element) return false;
      targetObserverRef.current?.disconnect();
      if (targetWaitTimeoutRef.current !== null) window.clearTimeout(targetWaitTimeoutRef.current);
      element.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center", inline: "nearest" });
      measureFrameRef.current = requestAnimationFrame(() => {
        measureFrameRef.current = requestAnimationFrame(() => measure(current.target));
      });
      return true;
    };
    if (revealTarget()) return;
    // Cards can be rendered after page navigation/data loading. Observe the DOM
    // instead of skipping the step after an arbitrary number of animation frames.
    targetObserverRef.current = new MutationObserver(() => { revealTarget(); });
    targetObserverRef.current.observe(document.body, { childList: true, subtree: true });
    targetWaitTimeoutRef.current = window.setTimeout(() => {
      // Keep the same step visible if the target is unavailable for this user.
      // This prevents a silent 3→6 jump and lets the user navigate explicitly.
      targetObserverRef.current?.disconnect();
      setTargetRect(null);
    }, 3000);
  }, [measure, onNavigate, reducedMotion, targetElement]);

  useEffect(() => {
    if (step < 0 || step >= STEPS.length) return;
    const current = STEPS[step];
    openViewAndWaitForTarget(current);
    return () => {
      if (measureFrameRef.current !== null) cancelAnimationFrame(measureFrameRef.current);
      measureFrameRef.current = null;
      targetObserverRef.current?.disconnect();
      targetObserverRef.current = null;
      if (targetWaitTimeoutRef.current !== null) window.clearTimeout(targetWaitTimeoutRef.current);
      targetWaitTimeoutRef.current = null;
    };
  }, [step, openViewAndWaitForTarget]);

  useEffect(() => {
    if (step < 0 || step >= STEPS.length) return;
    const currentTarget = STEPS[step].target;
    const update = () => {
      if (measureFrameRef.current !== null) cancelAnimationFrame(measureFrameRef.current);
      measureFrameRef.current = requestAnimationFrame(() => measure(currentTarget));
    };
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      if (measureFrameRef.current !== null) cancelAnimationFrame(measureFrameRef.current);
    };
  }, [step, measure]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") return close(step < 0 ? "skipped" : "completed");
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const isWelcome = step === -1;
  const isFinish = step === STEPS.length;
  const current = step >= 0 && step < STEPS.length ? STEPS[step] : null;
  const Icon = current?.icon ?? Star;
  const cardStyle: React.CSSProperties = targetRect && typeof window !== "undefined" && window.innerWidth >= 768
    ? targetRect.right + 370 < window.innerWidth
      ? { top: Math.max(20, Math.min(targetRect.top, window.innerHeight - 320)), left: targetRect.right + 20 }
      : targetRect.left > 370
        ? { top: Math.max(20, Math.min(targetRect.top, window.innerHeight - 320)), left: targetRect.left - 360 }
        : { bottom: 24, left: "50%", transform: "translateX(-50%)" }
    : targetRect && typeof window !== "undefined" && targetRect.bottom > window.innerHeight * 0.62
      ? { top: "calc(12px + env(safe-area-inset-top, 0px))", left: 12, right: 12 }
      : { bottom: "calc(16px + env(safe-area-inset-bottom, 0px))", left: 12, right: 12 };

  return (
    <div className="fitzone-tour" dir={lang === "en" ? "ltr" : "rtl"} onKeyDown={onKeyDown}>
      <div className="fitzone-tour__overlay" aria-hidden="true" />
      {targetRect && current && <div className="fitzone-tour__spotlight" aria-hidden="true" style={{ top: Math.max(8, targetRect.top - 8), left: Math.max(8, targetRect.left - 8), width: Math.min(window.innerWidth - 16, targetRect.width + 16), height: Math.min(window.innerHeight - 16, targetRect.height + 16) }} />}
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="fitzone-tour-title" className={`fitzone-tour__card ${isWelcome ? "fitzone-tour__card--welcome" : ""}`} style={isWelcome || isFinish ? undefined : cardStyle}>
        <button type="button" className="fitzone-tour__close" onClick={() => close(isWelcome ? "skipped" : "completed")} aria-label={text.close}>×</button>
        <div className={`fitzone-tour__mascot ${isWelcome ? "fitzone-tour__mascot--welcome" : ""} ${isFinish ? "fitzone-tour__mascot--finish" : ""}`} aria-hidden="true">
          {mascotAvailable ? <Image src="/hero-heba.png" alt="" aria-hidden="true" width={140} height={188} sizes="(max-width: 767px) 78px, 118px" priority onError={() => setMascotAvailable(false)} /> : <span className="fitzone-tour__mascot-fallback">✦</span>}
        </div>
        {isFinish && !reducedMotion && <div className="fitzone-tour__confetti" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <span key={index} style={{ "--delay": `${index * 70}ms`, "--x": `${index * 18 - 36}px` } as React.CSSProperties} />)}</div>}
        <div className="fitzone-tour__content">
          {!isWelcome && !isFinish && <div className="fitzone-tour__icon"><Icon size={18} aria-hidden="true" /></div>}
          <h2 id="fitzone-tour-title">{isWelcome ? text.welcomeTitle : isFinish ? text.finishTitle : (lang === "en" ? current!.en.title : current!.ar.title)}</h2>
          <p>{isWelcome ? text.welcomeBody : isFinish ? text.finishBody : (lang === "en" ? current!.en.body : current!.ar.body)}</p>
          {!isWelcome && !isFinish && <div className="fitzone-tour__progress">{step + 1} {text.step} {STEPS.length}</div>}
          {isWelcome ? <div className="fitzone-tour__actions"><button type="button" className="fitzone-tour__primary" onClick={() => setStep(0)}>{text.start}</button><button type="button" className="fitzone-tour__secondary" onClick={() => close("skipped")}>{text.skip}</button></div>
            : isFinish ? <div className="fitzone-tour__actions"><button type="button" className="fitzone-tour__primary" onClick={() => { onFinishNavigate("goals"); close("completed"); }}>{text.goals}</button><button type="button" className="fitzone-tour__secondary" onClick={() => { onFinishNavigate("goals"); close("completed"); }}>{text.memberships}</button><button type="button" className="fitzone-tour__secondary" onClick={() => close("completed")}>{text.finish}</button></div>
              : <div className="fitzone-tour__actions"><button type="button" className="fitzone-tour__secondary" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>{text.previous}</button><button type="button" className="fitzone-tour__primary" onClick={() => setStep((value) => value + 1)}>{text.next}</button><button type="button" className="fitzone-tour__skip" onClick={() => close("skipped")}>{text.skip}</button></div>}
        </div>
      </div>
      <style>{`
        .fitzone-tour{position:fixed;inset:0;z-index:1000;font-family:'Cairo','Tajawal',sans-serif}.fitzone-tour__overlay{position:absolute;inset:0;background:rgba(15,23,42,.42)}.fitzone-tour__spotlight{position:fixed;border-radius:16px;box-shadow:0 0 0 9999px rgba(15,23,42,.42),0 0 0 3px #BE123C;pointer-events:none;transition:top 300ms cubic-bezier(.22,1,.36,1),left 300ms cubic-bezier(.22,1,.36,1),width 300ms cubic-bezier(.22,1,.36,1),height 300ms cubic-bezier(.22,1,.36,1)}.fitzone-tour__card{position:fixed;z-index:2;width:min(344px,calc(100vw - 24px));max-height:calc(100dvh - 32px - env(safe-area-inset-bottom,0px));overflow:auto;background:#fff;border:1px solid #F5D0DC;border-radius:18px;box-shadow:0 20px 55px rgba(26,8,18,.28);padding:20px;display:flex;gap:10px;align-items:flex-end;transition:opacity 280ms cubic-bezier(.22,1,.36,1),transform 280ms cubic-bezier(.22,1,.36,1)}.fitzone-tour__card--welcome{top:50%;left:50%;transform:translate(-50%,-50%);width:min(520px,calc(100vw - 32px));align-items:center;padding:26px}.fitzone-tour__content{position:relative;z-index:2;flex:1;min-width:0}.fitzone-tour__content h2{font-size:20px;line-height:1.35;color:#1A0812;margin:0 0 8px;font-weight:900}.fitzone-tour__content p{font-size:13px;line-height:1.8;color:#4B5563;margin:0 0 12px}.fitzone-tour__icon{width:32px;height:32px;border-radius:9px;background:#FFE4EC;color:#BE123C;display:grid;place-items:center;margin-bottom:8px}.fitzone-tour__progress{font-size:11px;color:#7A5B68;margin-bottom:10px}.fitzone-tour__actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.fitzone-tour__actions button{border-radius:8px;padding:8px 11px;font:700 12px inherit;cursor:pointer}.fitzone-tour__primary{background:#BE123C;color:#fff;border:1px solid #BE123C}.fitzone-tour__secondary{background:#fff;color:#BE123C;border:1px solid #BE123C}.fitzone-tour__skip{background:none;color:#4B5563;border:0;text-decoration:underline;padding-inline:2px!important}.fitzone-tour__actions button:disabled{opacity:.45;cursor:default}.fitzone-tour__close{position:absolute;top:8px;inset-inline-end:10px;border:0;background:none;color:#4B5563;font-size:24px;line-height:1;cursor:pointer;z-index:3}.fitzone-tour__mascot{position:relative;z-index:1;width:118px;height:144px;flex:0 0 118px;pointer-events:none;filter:drop-shadow(0 8px 10px rgba(26,8,18,.16));animation:fitzone-tour-idle 3s ease-in-out infinite}.fitzone-tour__mascot img{width:100%;height:100%;object-fit:contain;object-position:bottom}.fitzone-tour__mascot--welcome{animation:fitzone-tour-enter 380ms cubic-bezier(.22,1,.36,1) both}.fitzone-tour__mascot--finish{animation:fitzone-tour-celebrate 420ms cubic-bezier(.22,1,.36,1) both}.fitzone-tour__mascot-fallback{display:grid;place-items:center;width:100%;height:100%;font-size:44px;color:#BE123C}.fitzone-tour__confetti{position:absolute;top:16px;left:50%;z-index:1;pointer-events:none}.fitzone-tour__confetti span{position:absolute;width:7px;height:11px;background:#BE123C;border-radius:2px;animation:fitzone-tour-confetti 650ms ease-out both;animation-delay:var(--delay);transform:translateX(var(--x))}.fitzone-tour__confetti span:nth-child(2n){background:#92400E}.fitzone-tour__confetti span:nth-child(3n){background:#15803D}@keyframes fitzone-tour-enter{from{opacity:0;transform:translateY(12px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes fitzone-tour-idle{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}@keyframes fitzone-tour-celebrate{0%{transform:scale(.96)}60%{transform:scale(1.08)}100%{transform:scale(1)}}@keyframes fitzone-tour-confetti{from{opacity:1;transform:translate(var(--x),0) rotate(0)}to{opacity:0;transform:translate(calc(var(--x) * 2),42px) rotate(150deg)}}@media(max-width:767px){.fitzone-tour__overlay{background:rgba(15,23,42,.34)}.fitzone-tour__spotlight{box-shadow:0 0 0 9999px rgba(15,23,42,.34),0 0 0 3px #BE123C}.fitzone-tour__card{padding:16px;gap:6px}.fitzone-tour__card--welcome{align-items:flex-end}.fitzone-tour__mascot{width:78px;height:108px;flex-basis:78px}.fitzone-tour__content h2{font-size:18px}.fitzone-tour__content p{font-size:12px}.fitzone-tour__actions button{padding:7px 9px;font-size:11px}}@media(prefers-reduced-motion:reduce){.fitzone-tour__spotlight,.fitzone-tour__card{transition:none}.fitzone-tour__mascot,.fitzone-tour__mascot--welcome,.fitzone-tour__mascot--finish{animation:none}.fitzone-tour__confetti{display:none}}
      `}</style>
    </div>
  );
}
