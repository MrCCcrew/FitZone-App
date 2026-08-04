export type CoachLang = "ar" | "en";

export type CoachIntent =
  | "greeting"
  | "faq"
  | "pricing"
  | "membership_recommendation"
  | "class_recommendation"
  | "schedule_lookup"
  | "booking_help"
  | "account_summary"
  | "offer_lookup"
  | "trainer_info"
  | "trainer_recommendation"
  | "partner_info"
  | "nutritionist_service"
  | "goals_list"
  | "product_help"
  | "product_recommendation"
  | "product_discount"
  | "weight_context"
  | "nutrition_guidance"
  | "shop_browse"
  | "complaint_help"
  | "human_handoff"
  | "privacy_guard"
  | "food_check"
  | "nutrition_review"
  | "weight_advice"
  | "check_in"
  | "unknown";

export type QuestionnaireGoal = "weight-loss" | "muscle-gain" | "toning" | "general-fitness";
export type QuestionnaireActivity = "low" | "medium" | "high";
export type QuestionnaireExperience = "beginner" | "intermediate" | "advanced";
export type QuestionnaireYesNo = "yes" | "no";

export type QuestionKey =
  | "goal"
  | "gender"
  | "age"
  | "height"
  | "weight"
  | "activity"
  | "experience"
  | "frequency"
  | "classes"
  | "injuries"
  | "meals"
  | "budget";

export type QuestionnaireAnswers = {
  goal?: QuestionnaireGoal;
  gender?: "male" | "female";
  age?: number;
  height?: number;
  weight?: number;
  activity?: QuestionnaireActivity;
  experience?: QuestionnaireExperience;
  frequency?: QuestionnaireActivity;
  classes?: QuestionnaireYesNo;
  injuries?: QuestionnaireYesNo;
  meals?: "poor" | "average" | "good";
  budget?: number;
};

export type CoachQuestionnaireState = {
  stage: QuestionKey | "done" | "idle";
  answers: QuestionnaireAnswers;
  awaitingContinuation?: boolean;
};

export type CoachConversationContext = {
  version: 1;
  lang: CoachLang;
  lastIntent?: CoachIntent;
  /** Small, structured context only; no transcript is persisted here. */
  currentEntity?: "trainers" | "partners" | "nutritionist" | "goals" | "classes" | null;
  lastResolvedIntent?: CoachIntent;
  selectedGoal?: string | null;
  selectedCategory?: string | null;
  lastTopic?: "weight_loss" | "fitness" | "nutrition" | null;
  statedWeight?: number;
  questionnaire: CoachQuestionnaireState;
  // Optional counter used only when advanced coaching nudges are enabled.
  nudgeShownCount?: number;
    lastDomain?: "memberships" | "packages" | "products" | "classes" | "offers" | "account" | "site" | null;
  lastEntities?: Record<string, string | number | boolean>;
  lastListMode?: boolean;
  lastSort?: "price_asc" | null;
  lastTemporalFilter?: Record<string, string>;
  lastActionTarget?: string | null;
  lastResultIds?: string[];
  lastResultCount?: number;
  contextUpdatedAt?: string;
  tour?: { currentStep: number; totalSteps: number; active: boolean };
};

export type CoachQuickAction = {
  id: string;
  label: string;
  prompt: string;
};

export type CoachSafetyFlags = {
  hasRisk: boolean;
  hasUrgentSymptom?: boolean;
  mentionsInjury: boolean;
  mentionsPregnancy: boolean;
  mentionsChronicCondition: boolean;
  mentionsPain: boolean;
};

export type CoachPublicMembership = {
  id: string;
  name: string;
  price: number;
  features: string[];
  maxClasses: number;
};

export type CoachPublicOffer = {
  id: string;
  title: string;
  description: string;
  expiresAt: string | null;
};

export type CoachPublicTrainer = {
  id: string;
  name: string;
  specialty: string;
  bio: string;
  rating: number;
  classesCount: number;
};

export type CoachPublicPartner = { id: string; name: string; category: string; benefit: string | null; code: string | null };
export type CoachPublicGoal = { id: string; name: string; description: string | null };
export type CoachNutritionistService = { id: string; name: string; bio: string | null; slots: Array<{ label: string; day?: string; time?: string }>; consultationFee: number; followupFee: number };

export type CoachPublicSchedule = {
  id: string;
  date: string;
  time: string;
  availableSpots: number;
};

export type CoachPublicClass = {
  id: string;
  name: string;
  description: string;
  trainer: string;
  trainerSpecialty: string;
  category: string | null;
  type: string;
  subType: string | null;
  duration: string;
  schedules: CoachPublicSchedule[];
};

export type CoachPublicProduct = {
  id: string;
  name: string;
  price: number;
  categoryLabel: string;
  description: string;
  stock: number;
};

export type CoachKnowledgeEntry = {
  id: string;
  title: string;
  category: string;
  answer: string;
  priority: number;
  keywords: string[];
  isMandatory?: boolean;
  allowParaphrasing?: boolean;
  validFrom?: string | null;
  validUntil?: string | null;
};

export type CoachSourceType = "live_site_data" | "mandatory_knowledge" | "knowledge_base" | "general_fitness" | "safe_fallback" | "policy_guard" | "mixed";

export type CoachAction = { type: "open_page"; label: string; url: "/" | "/login" | "/account" | "/store" | "/privacy" | "/refund" | "/?page=blog" | "/?page=partners" | "/#memberships" | "/#offers" | "/#classes" | "/#trainers-list" | "/#nutrition" | "/#goals" | "/#packages-section" };

export type CoachAttendanceStats = {
  attendedCount30d: number;
  confirmedCount7d: number;
  daysSinceLastAttended: number | null;
};

export type CoachAccountSummary = {
  authenticated: boolean;
  userName?: string;
  membership?: {
    name: string;
    endDate: string;
  } | null;
  walletBalance?: number;
  rewardPoints?: number;
  rewardTier?: string;
  referralCode?: string | null;
  upcomingBookingDate?: string | null;
  recentBookingDates?: string[];
  attendanceStats?: CoachAttendanceStats;
};

export type CoachCheckInData = {
  id: string;
  weight: number | null;
  waist: number | null;
  energyLevel: number | null;
  adherenceScore: number | null;
  notes: string | null;
  createdAt: string;
};

// Advanced coaching profile. Core chat must continue to work when this is null.
export type CoachProfileData = {
  id: string;
  primaryGoal: string | null;
  trainingLevel: string | null;
  preferredDays: number | null;
  preferredClassTypes: string[];
  injuries: string | null;
  nutritionStyle: string | null;
  currentWeight: number | null;
  targetWeight: number | null;
  height: number | null;
  age: number | null;
  notes: string | null;
  lastAssessmentAt: string | null;
  lastCheckInAt: string | null;
};

// Optional proactive prompt generated only by advanced coaching features.
export type CoachNudge = {
  type: "check_in_reminder" | "attendance_low" | "book_class" | "complete_onboarding";
  message: string;
};

export type CoachSiteSnapshot = {
  memberships: CoachPublicMembership[];
  offers: CoachPublicOffer[];
  classes: CoachPublicClass[];
  trainers: CoachPublicTrainer[];
  partners: CoachPublicPartner[];
  goals: CoachPublicGoal[];
  nutritionist: CoachNutritionistService | null;
  products: CoachPublicProduct[];
  knowledge: CoachKnowledgeEntry[];
  account: CoachAccountSummary;
  // Advanced coaching data. Treat as optional enrichment, not required core data.
  coachProfile: CoachProfileData | null;
  recentCheckIns: CoachCheckInData[];
  supportOnline: boolean;
};

export type CoachStructuredReply = {
  intent: CoachIntent;
  text: string;
  facts: string[];
  quickActions: CoachQuickAction[];
  recommendedMembershipId?: string | null;
  switchToLive?: boolean;
  closeSession?: boolean;
  usedAI?: boolean;
  outcome?: string;
  metadata?: Record<string, unknown>;
  action?: { type: "navigate"; page: "shop"; anchor: "shop-products" };
  sourceType?: CoachSourceType;
  confidence?: number;
  actions?: CoachAction[];
  requiresEscalation?: boolean;
};
