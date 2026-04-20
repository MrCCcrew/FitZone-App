import { getCurrentAppUser } from "@/lib/app-session";
import {
  createDefaultContext,
  getNextStage,
  isNegativeReply,
  isPositiveReply,
  parseCoachContext,
  parseQuestionnaireAnswer,
  QUESTION_TEXT,
  serializeCoachContext,
  startQuestionnaire,
} from "@/lib/ai-coach/context";
import {
  buildCheckInReply,
  buildFoodCheckReply,
  buildIntentReply,
  buildMembershipAssessmentReply,
  buildQuestionPrompt,
  buildWelcomeMessage,
  matchKnowledge,
} from "@/lib/ai-coach/fallback";
import { detectSafetyFlags } from "@/lib/ai-coach/guards";
import { detectCoachIntent } from "@/lib/ai-coach/intents";
import { phraseCoachReply } from "@/lib/ai-coach/llm";
import {
  buildAdvancedNudge,
  createAdvancedCheckIn,
  logAdvancedCoachEvent,
  parseAdvancedCheckIn,
  persistQuestionnaireProfile,
} from "@/lib/ai-coach/advanced";
import { buildQuickActions } from "@/lib/ai-coach/quick-actions";
import { recommendClasses, recommendMembership } from "@/lib/ai-coach/recommender";
import { getCoachSiteSnapshot } from "@/lib/ai-coach/site-data";
import type {
  CoachConversationContext,
  CoachIntent,
  CoachLang,
  CoachSiteSnapshot,
  CoachStructuredReply,
} from "@/lib/ai-coach/types";
import { db } from "@/lib/db";

type ChatSessionWithRelations = Awaited<ReturnType<typeof getSessionWithRelations>>;

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wantsLiveSupport(text: string) {
  const normalized = normalize(text);
  return /(موظف|خدمه عملاء|دعم|بشر|اكلم موظف|التحدث مع موظف|human|live support)/.test(normalized);
}

async function getSessionWithRelations(sessionId: string) {
  return db.chatSession.findUnique({
    where: { id: sessionId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      recommendedMembership: true,
      assignedTo: { select: { id: true, name: true, email: true, role: true } },
    },
  });
}

async function createBotMessage(sessionId: string, content: string, metadata?: Record<string, unknown>) {
  await db.chatMessage.create({
    data: {
      sessionId,
      senderType: "bot",
      senderName: "AI Coach",
      content,
      metadata: metadata ? JSON.stringify({ ...metadata, quickActions: undefined }) : null,
    },
  });
}

export async function transferToLiveSupport(sessionId: string, lang: CoachLang) {
  const support = await db.user.findFirst({
    where: { role: { in: ["admin", "staff"] }, supportPresence: { isOnline: true } },
    include: { supportPresence: true },
    orderBy: { createdAt: "asc" },
  });

  await db.chatSession.update({
    where: { id: sessionId },
    data: { mode: "live", status: "live", assignedToId: support?.id ?? null, lastMessageAt: new Date() },
  });

  await db.chatMessage.create({
    data: {
      sessionId,
      senderType: "system",
      senderName: lang === "en" ? "System" : "النظام",
      content: support
        ? lang === "en"
          ? `Your conversation was transferred to ${support.name || support.email || "support"} and they will reply soon.`
          : `تم تحويل المحادثة إلى ${support.name || support.email || "موظفة الدعم"} وسيتم الرد عليكِ قريبًا.`
        : lang === "en"
          ? "Your request was registered. No support agent is online right now — you will be answered when available."
          : "تم تسجيل طلبك. لا توجد موظفة متاحة الآن وسيتم الرد عند التوفر.",
    },
  });
}

async function closeConversation(sessionId: string, context: CoachConversationContext) {
  const nextContext = { ...context, questionnaire: { stage: "done" as const, answers: {}, awaitingContinuation: false } };
  await db.chatSession.update({
    where: { id: sessionId },
    data: { status: "resolved", mode: "bot", recommendedMembershipId: null, context: serializeCoachContext(nextContext), lastMessageAt: new Date() },
  });
  await createBotMessage(
    sessionId,
    context.lang === "en"
      ? "This conversation is closed. If you send a new message, I will start a fresh conversation with you."
      : "تم إنهاء المحادثة الحالية. إذا أرسلتِ رسالة جديدة سأبدأ معكِ محادثة جديدة.",
    { closeSession: true },
  );
}

async function phraseStructuredReply(args: {
  lang: CoachLang;
  intent: CoachIntent;
  userMessage: string;
  draft: string;
  facts: string[];
}): Promise<{ text: string; usedAI: boolean }> {
  const phrased = await phraseCoachReply(args);
  return { text: phrased ?? args.draft, usedAI: Boolean(phrased) };
}

// ─── Quick action helper ──────────────────────────────────────────────────────

function buildActions(
  snapshot: CoachSiteSnapshot,
  intent: CoachIntent | undefined,
  context: CoachConversationContext,
  liveMode = false,
) {
  const attendance = snapshot.account.attendanceStats;
  return buildQuickActions({
    lang: snapshot.account.authenticated ? context.lang : context.lang,
    authenticated: snapshot.account.authenticated,
    intent,
    supportOnline: snapshot.supportOnline,
    liveMode,
    profile: snapshot.coachProfile,
    hasMembership: Boolean(snapshot.account.membership),
    hasUpcomingBooking: Boolean(snapshot.account.upcomingBookingDate),
    checkInDue: isCheckInDue(snapshot),
    attendanceLow: isAttendanceLow(attendance),
  });
}

function isCheckInDue(snapshot: CoachSiteSnapshot): boolean {
  if (!snapshot.coachProfile) return false;
  if (snapshot.recentCheckIns.length === 0) return true;
  const days = Math.floor(
    (Date.now() - new Date(snapshot.recentCheckIns[0].createdAt).getTime()) / (1000 * 60 * 60 * 24),
  );
  return days >= 14;
}

function isAttendanceLow(stats: CoachSiteSnapshot["account"]["attendanceStats"] | undefined): boolean {
  if (!stats) return false;
  return stats.daysSinceLastAttended !== null && stats.daysSinceLastAttended > 10;
}

// ─── Questionnaire ────────────────────────────────────────────────────────────

async function handleQuestionnaireFlow(args: {
  sessionId: string;
  context: CoachConversationContext;
  userMessage: string;
  lang: CoachLang;
  userId: string | null;
}): Promise<CoachStructuredReply | null> {
  const { sessionId, context, userMessage, lang, userId } = args;
  const questionnaire = context.questionnaire;

  if (questionnaire.stage === "done" && questionnaire.awaitingContinuation) {
    if (isPositiveReply(userMessage)) {
      const nextContext: CoachConversationContext = { ...context, questionnaire: { ...questionnaire, awaitingContinuation: false } };
      await db.chatSession.update({ where: { id: sessionId }, data: { context: serializeCoachContext(nextContext), status: "open", lastMessageAt: new Date() } });
      return {
        intent: "membership_recommendation",
        text: lang === "en"
          ? "Sure. I am still with you. Ask me about classes, pricing, bookings, offers, or support."
          : "أكيد. أنا معكِ. تقدري تسألي عن الكلاسات أو الأسعار أو الحجز أو العروض أو الدعم.",
        facts: [],
        quickActions: [],
      };
    }
    if (isNegativeReply(userMessage)) {
      await closeConversation(sessionId, context);
      return { intent: "membership_recommendation", text: "", facts: [], quickActions: [], closeSession: true };
    }
    return {
      intent: "membership_recommendation",
      text: lang === "en"
        ? "If you want to continue, reply yes. If you want to end this conversation, reply no."
        : "إذا كنتِ تريدين الاستمرار اكتبي نعم، وإذا أردتِ إنهاء المحادثة اكتبي لا.",
      facts: [],
      quickActions: [],
    };
  }

  if (questionnaire.stage === "idle") {
    const nextContext = startQuestionnaire(context);
    await db.chatSession.update({ where: { id: sessionId }, data: { context: serializeCoachContext(nextContext), lastMessageAt: new Date() } });
    return { intent: "membership_recommendation", text: buildQuestionPrompt(lang, "goal"), facts: [], quickActions: [] };
  }

  if (questionnaire.stage === "done") return null;

  const parsedAnswer = parseQuestionnaireAnswer(questionnaire.stage, userMessage);
  if (typeof parsedAnswer === "undefined") return null;

  const nextAnswers = { ...questionnaire.answers, [questionnaire.stage]: parsedAnswer };
  const nextStage = getNextStage(questionnaire.stage);

  if (nextStage === "done") {
    const snapshot = await getCoachSiteSnapshot(lang, userId, sessionId);
    const membership = recommendMembership(nextAnswers, snapshot.memberships, snapshot.coachProfile);
    const safetyFlags = detectSafetyFlags(userMessage);
    const draft = buildMembershipAssessmentReply({ lang, answers: nextAnswers, membership, safetyFlags, profile: snapshot.coachProfile });

    const nextContext: CoachConversationContext = {
      ...context,
      questionnaire: { stage: "done", answers: nextAnswers, awaitingContinuation: true },
      lastIntent: "membership_recommendation",
    };

    await db.chatSession.update({
      where: { id: sessionId },
      data: { context: serializeCoachContext(nextContext), recommendedMembershipId: membership?.id ?? null, status: "open", lastMessageAt: new Date() },
    });

    await persistQuestionnaireProfile(userId, sessionId, nextAnswers);

    const { text, usedAI } = await phraseStructuredReply({
      lang,
      intent: "membership_recommendation",
      userMessage,
      draft,
      facts: membership ? [`membership=${membership.name}`, `price=${membership.price}`] : [],
    });

    logAdvancedCoachEvent({ sessionId, intent: "membership_recommendation", usedAI, outcome: membership ? "membership_recommended" : "no_membership" });

    return {
      intent: "membership_recommendation",
      text,
      facts: membership ? [membership.name, String(membership.price)] : [],
      quickActions: [],
      recommendedMembershipId: membership?.id ?? null,
      usedAI,
    };
  }

  const nextContext: CoachConversationContext = {
    ...context,
    questionnaire: { stage: nextStage, answers: nextAnswers, awaitingContinuation: false },
    lastIntent: "membership_recommendation",
  };
  await db.chatSession.update({ where: { id: sessionId }, data: { context: serializeCoachContext(nextContext), lastMessageAt: new Date() } });
  return { intent: "membership_recommendation", text: QUESTION_TEXT[lang][nextStage], facts: [], quickActions: [] };
}

// ─── Main reply builder ───────────────────────────────────────────────────────

async function buildDeterministicReply(args: {
  sessionId: string;
  userMessage: string;
  intent: CoachIntent;
  lang: CoachLang;
  context: CoachConversationContext;
  messageCount: number;
}): Promise<CoachStructuredReply> {
  const { sessionId, userMessage, intent, lang, context, messageCount } = args;
  const user = await getCurrentAppUser().catch(() => null);
  const snapshot = await getCoachSiteSnapshot(lang, user?.id ?? null, sessionId);
  const profile = snapshot.coachProfile;
  const attendance = snapshot.account.attendanceStats;
  const knowledgeEntry = matchKnowledge(userMessage, snapshot.knowledge);
  const baseContext = { ...context, nudgeShownCount: context.nudgeShownCount ?? 0 };

  // ── Live support ───────────────────────────────────────────────────────────
  if (intent === "human_handoff" || wantsLiveSupport(userMessage)) {
    await transferToLiveSupport(sessionId, lang);
    logAdvancedCoachEvent({ sessionId, intent: "human_handoff", usedAI: false, handoff: true, outcome: "handoff" });
    return {
      intent: "human_handoff",
      text: "",
      facts: [],
      quickActions: buildActions(snapshot, "human_handoff", baseContext, true),
      switchToLive: true,
    };
  }

  // ── Questionnaire ──────────────────────────────────────────────────────────
  // If user explicitly requests membership recommendation but questionnaire is already done, restart it
  const effectiveContext =
    intent === "membership_recommendation" &&
    context.questionnaire.stage === "done" &&
    !context.questionnaire.awaitingContinuation
      ? { ...baseContext, questionnaire: { stage: "idle" as const, answers: {}, awaitingContinuation: false } }
      : baseContext;

  if (intent === "membership_recommendation" || (effectiveContext.questionnaire.stage !== "idle" && effectiveContext.questionnaire.stage !== "done")) {
    const questionnaireReply = await handleQuestionnaireFlow({ sessionId, context: effectiveContext, userMessage, lang, userId: user?.id ?? null });
    if (questionnaireReply) return questionnaireReply;
  }

  // ── Check-in ───────────────────────────────────────────────────────────────
  if (intent === "check_in") {
    const parsed = parseAdvancedCheckIn(userMessage);

    if (!parsed) {
      const text = lang === "ar"
        ? "لم أتمكن من قراءة وزنك. اكتبي مثلاً: **وزني اليوم ٧٠ كيلو** وسأسجله لكِ."
        : "I couldn't read your weight. Try something like: **my weight today is 70 kg**.";
      await updateContext(sessionId, baseContext, intent);
      logAdvancedCoachEvent({ sessionId, intent: "check_in", usedAI: false, outcome: "parse_failed" });
      return { intent, text, facts: [], quickActions: buildActions(snapshot, intent, baseContext) };
    }

    const savedCheckIn = await createAdvancedCheckIn(user?.id ?? null, sessionId, parsed);
    if (!savedCheckIn) {
      await updateContext(sessionId, baseContext, intent);
      return {
        intent,
        text:
          lang === "en"
            ? "I can help you log your weight, but this feature is currently unavailable."
            : "أقدر أساعدك في تسجيل وزنك، لكن هذه الخاصية غير متاحة حاليًا.",
        facts: [],
        quickActions: buildActions(snapshot, intent, baseContext),
      };
    }

    const { checkIn, previous } = savedCheckIn;
    const draft = buildCheckInReply(lang, checkIn, previous, profile);
    const { text, usedAI } = await phraseStructuredReply({ lang, intent, userMessage, draft, facts: [] });

    await updateContext(sessionId, baseContext, intent);
    logAdvancedCoachEvent({ sessionId, intent: "check_in", usedAI, outcome: "check_in" });

    return {
      intent,
      text,
      facts: [],
      quickActions: buildActions(snapshot, intent, baseContext),
      usedAI,
    };
  }

  // ── Food check ─────────────────────────────────────────────────────────────
  if (intent === "food_check") {
    const draft = buildFoodCheckReply(lang, userMessage, profile);
    const { text, usedAI } = await phraseStructuredReply({ lang, intent, userMessage, draft, facts: [] });
    await updateContext(sessionId, baseContext, intent);
    logAdvancedCoachEvent({ sessionId, intent: "food_check", usedAI, outcome: "food_check" });
    return { intent, text, facts: [], quickActions: buildActions(snapshot, intent, baseContext), usedAI };
  }

  // ── Class recommendation ───────────────────────────────────────────────────
  const classRecommendations =
    intent === "class_recommendation"
      ? recommendClasses(userMessage, snapshot.classes, lang, profile, attendance)
      : [];

  const draft =
    intent === "class_recommendation" && classRecommendations.length > 0
      ? lang === "en"
        ? `Based on your request${profile?.primaryGoal ? ` and your ${profile.primaryGoal} goal` : ""}${isAttendanceLow(attendance) ? " (easing back in after a gap)" : ""}, these classes look closest:\n${classRecommendations.map((c) => `- ${c.name} with ${c.trainer}`).join("\n")}`
        : `بناءً على طلبك${profile?.primaryGoal ? ` وهدفك في ${profile.primaryGoal}` : ""}${isAttendanceLow(attendance) ? " (مع مراعاة العودة التدريجية)" : ""}، هذه أقرب كلاسات لك:\n${classRecommendations.map((c) => `- ${c.name} مع ${c.trainer}`).join("\n")}`
      : buildIntentReply({
          lang,
          intent,
          knowledgeEntry,
          memberships: snapshot.memberships,
          offers: snapshot.offers,
          classes: snapshot.classes,
          trainers: snapshot.trainers,
          products: snapshot.products,
          account: snapshot.account,
          supportOnline: snapshot.supportOnline,
          profile,
          userMessage,
        });

  const facts = [
    ...snapshot.memberships.slice(0, 4).map((m) => `${m.name}:${m.price}`),
    ...snapshot.offers.slice(0, 3).map((o) => o.title),
    ...classRecommendations.slice(0, 3).map((c) => c.name),
  ].slice(0, 8);

  const { text: mainText, usedAI } = await phraseStructuredReply({ lang, intent, userMessage, draft, facts });

  // ── Nudge ──────────────────────────────────────────────────────────────────
  const nudgeShownCount = baseContext.nudgeShownCount ?? 0;
  const nudge = buildAdvancedNudge({
    lang,
    profile,
    snapshot,
    lastIntent: intent,
    nudgeShownCount,
    messageCount,
  });

  const finalText = nudge ? `${mainText}${nudge.message}` : mainText;

  // Update context (bump nudgeShownCount if nudge was shown)
  const nextContext: CoachConversationContext = {
    ...baseContext,
    lang,
    lastIntent: intent,
    nudgeShownCount: nudge ? nudgeShownCount + 1 : nudgeShownCount,
  };
  await db.chatSession.update({
    where: { id: sessionId },
    data: { context: serializeCoachContext(nextContext), lastMessageAt: new Date() },
  });

  const outcome = intent === "class_recommendation" ? "class_suggested"
    : intent === "pricing" || intent === "membership_recommendation" ? "membership_recommended"
    : intent;

  logAdvancedCoachEvent({ sessionId, intent, usedAI, outcome });

  return {
    intent,
    text: finalText,
    facts,
    quickActions: buildActions(snapshot, intent, nextContext),
    usedAI,
  };
}

async function updateContext(sessionId: string, context: CoachConversationContext, intent: CoachIntent) {
  const next: CoachConversationContext = { ...context, lastIntent: intent };
  await db.chatSession.update({ where: { id: sessionId }, data: { context: serializeCoachContext(next), lastMessageAt: new Date() } });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function initializeCoachSession(sessionId: string, lang: CoachLang = "ar") {
  const session = await getSessionWithRelations(sessionId);
  if (!session) return null;
  if (session.messages.length > 0) return session;

  const context = createDefaultContext(lang);
  await createBotMessage(sessionId, buildWelcomeMessage(lang), { intent: "greeting" });
  await db.chatSession.update({
    where: { id: sessionId },
    data: { context: serializeCoachContext(context), status: "open", mode: "bot", lastMessageAt: new Date() },
  });

  return getSessionWithRelations(sessionId);
}

export async function handleCoachMessage(sessionId: string, userMessage: string, lang: CoachLang = "ar") {
  const session = await db.chatSession.findUnique({
    where: { id: sessionId },
    include: { messages: { select: { id: true } } },
  });
  if (!session) return null;
  if (session.mode === "live") return getSessionWithRelations(sessionId);

  const context = parseCoachContext(session.context, lang);
  const intent = detectCoachIntent(userMessage);
  const messageCount = (session as { messages: { id: string }[] }).messages.length;

  const reply = await buildDeterministicReply({ sessionId, userMessage, intent, lang, context, messageCount });

  if (!reply.switchToLive && !reply.closeSession && reply.text) {
    await createBotMessage(sessionId, reply.text, {
      intent: reply.intent,
      recommendedMembershipId: reply.recommendedMembershipId ?? null,
      quickActions: reply.quickActions,
      usedAI: reply.usedAI ?? false,
    });
  }

  return getSessionWithRelations(sessionId);
}

export async function buildCoachPayload(
  session: ChatSessionWithRelations | null,
  lang: CoachLang = "ar",
) {
  if (!session) return null;

  const context = parseCoachContext(session.context, lang);
  const user = await getCurrentAppUser().catch(() => null);
  const snapshot = await getCoachSiteSnapshot(lang, user?.id ?? null, session.id);

  return {
    ...session,
    quickActions: buildActions(snapshot, context.lastIntent, context, session.mode === "live"),
  };
}
