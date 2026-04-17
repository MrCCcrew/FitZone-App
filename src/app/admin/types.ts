export type Section =
  | "overview"
  | "accounting"
  | "settings"
  | "pages"
  | "knowledge"
  | "subscriptions"
  | "packages"
  | "goals"
  | "delivery"
  | "health"
  | "payments"
  | "classes"
  | "trainers"
  | "products"
  | "inventory"
  | "reviews"
  | "balance"
  | "bookings"
  | "customers"
  | "chat"
  | "complaints"
  | "discounts"
  | "rewards"
  | "database"
  | "push";

export interface AdminEmployee {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  jobTitle?: string | null;
  adminAccess: boolean;
  isActive: boolean;
  adminPermissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorUserId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  details?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

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
  memberships?: CustomerMembershipReport[];
}

export interface CustomerMembershipReport {
  id: string;
  name: string;
  kind: "subscription" | "package";
  status: string;
  startDate: string;
  endDate: string;
  sessionsTotal: number | null;
  sessionsUsed: number;
  sessionsRemaining: number | null;
  paymentAmount: number;
  paymentMethod: string | null;
  offerTitle?: string | null;
  productRewards?: Array<{ productId: string; productName?: string; quantity: number }>;
}

export interface Plan {
  id: string;
  name: string;
  nameEn?: string | null;
  kind?: "subscription" | "package";
  price: number;
  priceBefore?: number | null;
  priceAfter?: number | null;
  image?: string | null;
  sortOrder?: number;
  duration: number;
  cycle?: "monthly" | "quarterly" | "semi_annual" | "annual" | "custom";
  sessionsCount?: number | null;
  classSessions?: Array<{ classId: string; className?: string; sessions: number }>;
  productRewards?: Array<{ productId: string; productName?: string; quantity: number }>;
  features: string[];
  featuresEn?: string[];
  active: boolean;
  membersCount: number;
  goalIds?: string[];
  giftEn?: string | null;
}

export interface Offer {
  id: string;
  title: string;
  titleEn?: string | null;
  discount: number;
  type: "percentage" | "fixed" | "special";
  appliesTo: string;
  appliesToEn?: string | null;
  membershipId?: string | null;
  validUntil: string;
  active: boolean;
  usedCount: number;
  description?: string;
  descriptionEn?: string | null;
  specialPrice?: number | null;
  maxSubscribers?: number | null;
  currentSubscribers?: number;
  image?: string | null;
  showOnHome?: boolean;
  showMaxSubscribers?: boolean;
}

export interface GymClass {
  id: string;
  name: string;
  nameEn?: string | null;
  trainer: string;
  day: string;
  time: string;
  duration: number;
  capacity: number;
  enrolled: number;
  category?: string | null;
  categoryEn?: string | null;
  type: string;
  typeEn?: string | null;
  subType?: string | null;
  subTypeEn?: string | null;
  description?: string | null;
  descriptionEn?: string | null;
  active: boolean;
  showTrainerName?: boolean;
  trainerId?: string;
}

export interface Trainer {
  id: string;
  name: string;
  nameEn?: string | null;
  specialty: string;
  specialtyEn?: string | null;
  bio?: string | null;
  bioEn?: string | null;
  certifications: string[];
  certificationsEn?: string[];
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
  nameEn?: string | null;
  category: string;
  categoryLabel?: string;
  categoryLabelEn?: string | null;
  sizeType?: "none" | "clothing" | "shoes";
  price: number;
  oldPrice?: number | null;
  stock: number;
  sold: number;
  averageCost?: number;
  lastPurchaseCost?: number;
  active: boolean;
  emoji: string;
  description?: string;
  descriptionEn?: string | null;
  images?: string[];
  sizes?: string[];
  colors?: string[];
}

export interface InventoryReceiptItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface InventoryReceipt {
  id: string;
  referenceNumber?: string | null;
  supplierName?: string | null;
  notes?: string | null;
  receivedAt: string;
  totalCost: number;
  status: string;
  items: InventoryReceiptItem[];
}

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  type: string;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  unitCost?: number | null;
  createdAt: string;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
}

export interface ProductCategory {
  id: string;
  key: string;
  label: string;
  labelEn?: string | null;
  sizeType: "none" | "clothing" | "shoes";
  icon?: string | null;
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
  nameEn?: string | null;
  slug: string;
  description?: string | null;
  descriptionEn?: string | null;
  image?: string | null;
  kind: string;
  parentId?: string | null;
  parent?: { id: string; name: string } | null;
  sortOrder: number;
  active: boolean;
  childrenCount?: number;
}

export interface DeliveryOption {
  id: string;
  name: string;
  nameEn?: string | null;
  type: "courier" | "pickup";
  description?: string | null;
  descriptionEn?: string | null;
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
  titleEn?: string | null;
  slug: string;
  prompt: string;
  promptEn?: string | null;
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

export interface QuickReply {
  id: string;
  label: string;
  content: string;
  sortOrder: number;
  createdAt: string;
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
  displayNameEn?: string | null;
  content: string;
  contentEn?: string | null;
  rating: number;
  status: "pending" | "approved" | "rejected";
  adminNote?: string | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string | null };
}
