import type {
  Customer, Plan, Offer, GymClass,
  Product, Order, Transaction, PageSection,
} from "./types";

export const MOCK_CUSTOMERS: Customer[] = [
  { id: "c1", name: "محمد الشرقاوي", phone: "01012345678", email: "m.sharkawy@gmail.com", plan: "VIP", status: "active", joinDate: "2024-01-15", points: 1850, balance: 500, avatar: "م" },
  { id: "c2", name: "مريم السيد", phone: "01123456789", email: "mariam@gmail.com", plan: "بلاتيني", status: "active", joinDate: "2024-03-01", points: 740, balance: 0, avatar: "م" },
  { id: "c3", name: "نورا إبراهيم", phone: "01234567890", email: "noura@gmail.com", plan: "أساسي", status: "active", joinDate: "2024-02-10", points: 310, balance: 200, avatar: "ن" },
  { id: "c4", name: "أحمد فاروق", phone: "01098765432", email: "ahmed.f@gmail.com", plan: "بلاتيني", status: "suspended", joinDate: "2023-11-20", points: 920, balance: 0, avatar: "أ" },
  { id: "c5", name: "ياسمين علي", phone: "01587654321", email: "yasmine@gmail.com", plan: "VIP", status: "active", joinDate: "2023-09-05", points: 3200, balance: 1000, avatar: "ي" },
  { id: "c6", name: "خالد منصور", phone: "01665432109", email: "khaled@gmail.com", plan: "أساسي", status: "expired", joinDate: "2023-06-01", points: 150, balance: 0, avatar: "خ" },
  { id: "c7", name: "دينا حسام", phone: "01754321098", email: "dina@gmail.com", plan: "بلاتيني", status: "active", joinDate: "2024-04-12", points: 560, balance: 300, avatar: "د" },
  { id: "c8", name: "عمر طارق", phone: "01843210987", email: "omar@gmail.com", plan: "VIP", status: "active", joinDate: "2023-12-01", points: 2100, balance: 750, avatar: "ع" },
];

export const MOCK_PLANS: Plan[] = [
  { id: "p1", name: "أساسي", price: 299, duration: 30, cycle: "monthly", sessionsCount: 8, features: ["دخول الصالة 6 أيام", "تمارين القلب", "خزائن آمنة"], active: true, membersCount: 312 },
  { id: "p2", name: "بلاتيني", price: 499, duration: 30, cycle: "monthly", sessionsCount: 12, features: ["دخول الصالة 7 أيام", "الحمام السباحة", "كلاسين/أسبوع", "تقييم لياقة"], active: true, membersCount: 198 },
  { id: "p3", name: "VIP", price: 799, duration: 30, cycle: "monthly", sessionsCount: 12, features: ["دخول 24/7", "جميع الكلاسات", "مدرب شخصي 4 جلسات", "تغذية شهرية", "مساج"], active: true, membersCount: 87 },
  { id: "p4", name: "سنوي VIP", price: 7199, duration: 365, cycle: "annual", sessionsCount: 144, features: ["كل مميزات VIP", "شهران مجاناً", "تيشيرت هدية"], active: true, membersCount: 34 },
];

export const MOCK_OFFERS: Offer[] = [
  { id: "o1", title: "خصم رمضان", discount: 30, type: "percentage", appliesTo: "جميع الباقات", validUntil: "2025-04-15", active: true, usedCount: 47 },
  { id: "o2", title: "عرض الطلاب", discount: 100, type: "fixed", appliesTo: "باقة أساسي", validUntil: "2025-12-31", active: true, usedCount: 23 },
  { id: "o3", title: "خصم المجموعات", discount: 20, type: "percentage", appliesTo: "VIP", validUntil: "2025-06-30", active: false, usedCount: 12 },
];

export const DAYS = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

export const MOCK_CLASSES: GymClass[] = [
  { id: "cl1", name: "كروس فيت", trainer: "أحمد حسن", day: "السبت", time: "06:00", duration: 60, capacity: 15, enrolled: 13, type: "strength", active: true },
  { id: "cl2", name: "يوغا", trainer: "منى خالد", day: "الأحد", time: "08:00", duration: 45, capacity: 20, enrolled: 18, type: "yoga", active: true },
  { id: "cl3", name: "ملاكمة", trainer: "كريم عادل", day: "الاثنين", time: "17:00", duration: 60, capacity: 12, enrolled: 10, type: "boxing", active: true },
  { id: "cl4", name: "رقص لاتيني", trainer: "سارة محمود", day: "الثلاثاء", time: "19:00", duration: 45, capacity: 20, enrolled: 15, type: "dance", active: true },
  { id: "cl5", name: "سباحة", trainer: "طارق علي", day: "الأربعاء", time: "07:00", duration: 60, capacity: 10, enrolled: 8, type: "swimming", active: true },
  { id: "cl6", name: "تمارين مقاومة", trainer: "أحمد حسن", day: "الخميس", time: "18:00", duration: 75, capacity: 15, enrolled: 7, type: "strength", active: false },
  { id: "cl7", name: "زومبا", trainer: "منى خالد", day: "الجمعة", time: "10:00", duration: 45, capacity: 25, enrolled: 22, type: "cardio", active: true },
];

export const MOCK_PRODUCTS: Product[] = [
  { id: "pr1", name: "بروتين واي 2كج", category: "supplement", price: 850, stock: 24, sold: 156, active: true, emoji: "🥛" },
  { id: "pr2", name: "قفازات تدريب جلد", category: "gear", price: 180, stock: 42, sold: 89, active: true, emoji: "🥊" },
  { id: "pr3", name: "تيشيرت FitZone", category: "clothing", price: 120, stock: 60, sold: 203, active: true, emoji: "👕" },
  { id: "pr4", name: "حبل قفز احترافي", category: "gear", price: 95, stock: 33, sold: 67, active: true, emoji: "⚡" },
  { id: "pr5", name: "كرياتين مونوهيدرات", category: "supplement", price: 450, stock: 18, sold: 92, active: true, emoji: "💊" },
  { id: "pr6", name: "شنطة رياضية", category: "accessory", price: 320, stock: 15, sold: 41, active: false, emoji: "🎒" },
];

export const MOCK_ORDERS: Order[] = [
  { id: "or1", customerId: "c1", customerName: "محمد الشرقاوي", product: "بروتين واي 2كج", quantity: 2, total: 1700, status: "delivered", date: "2025-03-10" },
  { id: "or2", customerId: "c2", customerName: "مريم السيد", product: "تيشيرت FitZone", quantity: 1, total: 120, status: "pending", date: "2025-03-12" },
  { id: "or3", customerId: "c5", customerName: "ياسمين علي", product: "قفازات تدريب جلد", quantity: 1, total: 180, status: "confirmed", date: "2025-03-11" },
  { id: "or4", customerId: "c8", customerName: "عمر طارق", product: "كرياتين مونوهيدرات", quantity: 2, total: 900, status: "delivered", date: "2025-03-09" },
  { id: "or5", customerId: "c3", customerName: "نورا إبراهيم", product: "حبل قفز احترافي", quantity: 1, total: 95, status: "cancelled", date: "2025-03-08" },
];

export const MOCK_TRANSACTIONS: Transaction[] = [
  { id: "t1", customerId: "c1", customerName: "محمد الشرقاوي", type: "earn", points: 200, amount: 0, reason: "تجديد اشتراك VIP", date: "2025-03-01" },
  { id: "t2", customerId: "c5", customerName: "ياسمين علي", type: "redeem", points: -500, amount: 50, reason: "استبدال نقاط بخصم", date: "2025-03-05" },
  { id: "t3", customerId: "c2", customerName: "مريم السيد", type: "topup", points: 0, amount: 300, reason: "شحن رصيد", date: "2025-03-07" },
  { id: "t4", customerId: "c8", customerName: "عمر طارق", type: "earn", points: 150, amount: 0, reason: "شراء منتج", date: "2025-03-09" },
  { id: "t5", customerId: "c4", customerName: "أحمد فاروق", type: "deduct", points: -100, amount: 0, reason: "انتهاك قواعد النادي", date: "2025-03-10" },
];

export const MOCK_PAGE_SECTIONS: PageSection[] = [
  { id: "hero", name: "hero", label: "القسم الرئيسي (Hero)", visible: true, order: 1 },
  { id: "about", name: "about", label: "عن النادي", visible: true, order: 2 },
  { id: "classes", name: "classes", label: "الكلاسات", visible: true, order: 3 },
  { id: "plans", name: "plans", label: "الاشتراكات", visible: true, order: 4 },
  { id: "trainers", name: "trainers", label: "المدربون", visible: true, order: 5 },
  { id: "testimonials", name: "testimonials", label: "آراء الأعضاء", visible: true, order: 6 },
  { id: "contact", name: "contact", label: "تواصل معنا", visible: true, order: 7 },
];
