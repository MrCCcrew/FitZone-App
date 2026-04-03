export type Section =
  | "overview"
  | "pages"
  | "knowledge"
  | "subscriptions"
  | "goals"
  | "programs"
  | "delivery"
  | "health"
  | "payments"
  | "classes"
  | "trainers"
  | "products"
  | "reviews"
  | "balance"
  | "customers"
  | "chat"
  | "complaints";

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  plan: string;
  status: "active" | "suspended" | "expired";
  joinDate: string;
  points: number;
  balance: number;
  avatar: string;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  duration: "monthly" | "quarterly" | "annual";
  features: string[];
  active: boolean;
  membersCount: number;
}

export interface Offer {
  id: string;
  title: string;
  discount: number;
  type: "percentage" | "fixed" | "special";
  appliesTo: string;
  membershipId?: string | null;
  validUntil: string;
  active: boolean;
  usedCount: number;
  description?: string;
  specialPrice?: number | null;
  maxSubscribers?: number | null;
  currentSubscribers?: number;
  image?: string | null;
  showOnHome?: boolean;
}

export interface GymClass {
  id: string;
  name: string;
  trainer: string;
  day: string;
  time: string;
  duration: number;
  capacity: number;
  enrolled: number;
  type: string;
  active: boolean;
}

export interface Trainer {
  id: string;
  name: string;
  specialty: string;
  bio?: string | null;
  certifications: string[];
  rating: number;
  sessionsCount: number;
  image?: string | null;
  classesCount: number;
  active: boolean;
  showOnHome: boolean;
  sortOrder: number;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  categoryLabel?: string;
  sizeType?: "none" | "clothing" | "shoes";
  price: number;
  oldPrice?: number | null;
  stock: number;
  sold: number;
  active: boolean;
  emoji: string;
  description?: string;
  images?: string[];
  sizes?: string[];
  colors?: string[];
}

export interface ProductCategory {
  id: string;
  key: string;
  label: string;
  sizeType: "none" | "clothing" | "shoes";
  sortOrder: number;
  active: boolean;
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  product: string;
  quantity: number;
  total: number;
  status: "pending" | "confirmed" | "delivered" | "cancelled";
  date: string;
}

export interface Transaction {
  id: string;
  customerId: string;
  customerName: string;
  type: "earn" | "redeem" | "topup" | "deduct";
  points: number;
  amount: number;
  reason: string;
  date: string;
}

export interface PageSection {
  id: string;
  name: string;
  label: string;
  visible: boolean;
  order: number;
}

export interface Goal {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  image?: string | null;
  kind: string;
  parentId?: string | null;
  parent?: { id: string; name: string } | null;
  sortOrder: number;
  active: boolean;
  childrenCount?: number;
  linkedProgramsCount?: number;
  enrollmentsCount?: number;
}

export interface Program {
  id: string;
  title: string;
  slug: string;
  type: "subscription" | "package";
  audience: string;
  billingCycle?: string | null;
  sessionsCount?: number | null;
  durationDays?: number | null;
  validityDays?: number | null;
  basePrice: number;
  salePrice?: number | null;
  compareAtPrice?: number | null;
  classSessionPrice?: number | null;
  description?: string | null;
  image?: string | null;
  active: boolean;
  showOnHome: boolean;
  sortOrder: number;
  surveyEnabled: boolean;
  scheduleManagedByAdmin: boolean;
  features?: string[];
  goals?: Array<{ id: string; name: string; slug: string; kind: string; isPrimary?: boolean; sortOrder?: number }>;
  consumables?: Array<{ id: string; productId: string; productName: string; quantity: number; notes?: string | null; stock?: number }>;
  schedules?: Array<{ id: string; label: string; audience?: string | null; timetableJson: string; notes?: string | null; isDefault: boolean; active: boolean; sortOrder: number }>;
  enrollmentsCount?: number;
  offersCount?: number;
}

export interface DeliveryOption {
  id: string;
  name: string;
  type: "courier" | "pickup";
  description?: string | null;
  fee: number;
  estimatedDaysMin?: number | null;
  estimatedDaysMax?: number | null;
  active: boolean;
  showCashOnDelivery: boolean;
  sortOrder: number;
  ordersCount?: number;
}

export interface HealthQuestion {
  id: string;
  title: string;
  slug: string;
  prompt: string;
  active: boolean;
  sortOrder: number;
  restrictedClassTypes?: string[];
  restrictions?: Array<{ id: string; classType: string; notes?: string | null }>;
}

export interface Complaint {
  id: string;
  subject: string;
  message: string;
  status: "open" | "in-progress" | "resolved" | "closed";
  adminNote?: string | null;
  createdAt: string;
  user: { name: string | null; email: string | null };
}

export interface ChatMessage {
  id: string;
  senderType: "user" | "bot" | "admin" | "staff" | "system";
  senderName?: string | null;
  content: string;
  createdAt: string;
  metadata?: { membershipId?: string } | null;
}

export interface ChatSession {
  id: string;
  visitorName?: string | null;
  visitorPhone?: string | null;
  status: "open" | "live" | "resolved";
  mode: "bot" | "live";
  lastMessageAt: string;
  createdAt: string;
  assignedTo?: { id: string; name?: string | null; email?: string | null; role?: string | null } | null;
  recommendedMembership?: { id: string; name: string; price: number } | null;
  messages: ChatMessage[];
}

export interface ChatKnowledgeEntry {
  id: string;
  title: string;
  category: string;
  keywords: string[];
  answer: string;
  priority: number;
  active: boolean;
  updatedAt: string;
}

export interface Testimonial {
  id: string;
  displayName: string;
  content: string;
  rating: number;
  status: "pending" | "approved" | "rejected";
  adminNote?: string | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string | null };
}
