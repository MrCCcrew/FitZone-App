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
  | "product_help"
  | "complaint_help"
  | "human_handoff"
  | "food_check"
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
  questionnaire: CoachQuestionnaireState;
  // Optional counter used only when advanced coaching nudges are enabled.
  nudgeShownCount?: number;
};

export type CoachQuickAction = {
  id: string;
  label: string;
  prompt: string;
};

export type CoachSafetyFlags = {
  hasRisk: boolean;
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
  expiresAt: string;
};

export type CoachPublicTrainer = {
  id: string;
  name: string;
  specialty: string;
  bio: string;
  rating: number;
  classesCount: number;
};

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
};

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
};
