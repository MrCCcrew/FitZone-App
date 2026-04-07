import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  console.log("🌱 بدء تحميل البيانات التجريبية...");

  // ─── Clean slate ─────────────────────────────────────────────────────────────
  await db.rewardHistory.deleteMany();
  await db.rewardPoints.deleteMany();
  await db.walletTransaction.deleteMany();
  await db.wallet.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.booking.deleteMany();
  await db.schedule.deleteMany();
  await db.class.deleteMany();
  await db.trainer.deleteMany();
  await db.userMembership.deleteMany();
  await db.membership.deleteMany();
  await db.notification.deleteMany();
  await db.referral.deleteMany();
  await db.offer.deleteMany();
  await db.product.deleteMany();
  await db.session.deleteMany();
  await db.account.deleteMany();
  await db.user.deleteMany();

  // ─── Memberships ─────────────────────────────────────────────────────────────
  const [planBasic, planPlatinum, planVip, planAnnual] = await Promise.all([
    db.membership.create({ data: { name: "أساسي", price: 299, duration: 30, features: JSON.stringify(["دخول الصالة 6 أيام", "تمارين القلب", "خزائن آمنة"]), maxClasses: 8, walletBonus: 0, isActive: true } }),
    db.membership.create({ data: { name: "بلاتيني", price: 499, duration: 30, features: JSON.stringify(["دخول الصالة 7 أيام", "الحمام السباحة", "كلاسين/أسبوع", "تقييم لياقة مجاني"]), maxClasses: 12, walletBonus: 50, isActive: true } }),
    db.membership.create({ data: { name: "VIP", price: 799, duration: 30, features: JSON.stringify(["دخول 24/7", "جميع الكلاسات", "مدرب شخصي 4 جلسات", "تغذية شهرية", "مساج"]), maxClasses: -1, walletBonus: 100, isActive: true } }),
    db.membership.create({ data: { name: "سنوي VIP", price: 7199, duration: 365, features: JSON.stringify(["كل مميزات VIP", "شهران مجاناً", "تيشيرت هدية"]), maxClasses: -1, walletBonus: 500, gift: "تيشيرت FitZone", isActive: true } }),
  ]);

  // ─── Trainers ─────────────────────────────────────────────────────────────────
  const [trainerAhmed, trainerMona, trainerKarim, trainerSara, trainerTarek] = await Promise.all([
    db.trainer.create({ data: { name: "أحمد حسن", specialty: "كروس فيت ومقاومة", bio: "مدرب معتمد من ACSM بخبرة 8 سنوات في تدريب القوة.", certifications: JSON.stringify(["ACSM Certified", "CrossFit L2"]), rating: 4.9, sessionsCount: 1240, image: null } }),
    db.trainer.create({ data: { name: "منى خالد", specialty: "يوغا وزومبا", bio: "مدربة يوغا معتمدة RYT-200 مع خبرة 6 سنوات في تدريب المرونة.", certifications: JSON.stringify(["RYT-200", "Zumba Instructor"]), rating: 4.8, sessionsCount: 980, image: null } }),
    db.trainer.create({ data: { name: "كريم عادل", specialty: "ملاكمة ودفاع عن النفس", bio: "بطل قومي سابق في الملاكمة بخبرة 10 سنوات في التدريب.", certifications: JSON.stringify(["National Champion", "Boxing Coach Level 3"]), rating: 4.9, sessionsCount: 1560, image: null } }),
    db.trainer.create({ data: { name: "سارة محمود", specialty: "تغذية رياضية ولياقة نسائية", bio: "حاصلة على دكتوراه في التغذية الرياضية مع 5 سنوات خبرة.", certifications: JSON.stringify(["PhD Sports Nutrition", "NASM-CPT"]), rating: 4.7, sessionsCount: 720, image: null } }),
    db.trainer.create({ data: { name: "طارق علي", specialty: "سباحة ولياقة مائية", bio: "مدرب سباحة معتمد مع خبرة 7 سنوات في تدريب جميع المستويات.", certifications: JSON.stringify(["FINA Level 2", "Lifeguard Certified"]), rating: 4.8, sessionsCount: 890, image: null } }),
  ]);

  // ─── Classes ─────────────────────────────────────────────────────────────────
  const [clsCrossfit, clsYoga, clsBoxing, clsZumba, clsSwim, clsStrength, clsDance, clsPilates] = await Promise.all([
    db.class.create({ data: { name: "كروس فيت", description: "تمارين وظيفية عالية الكثافة لبناء القوة والتحمل", trainerId: trainerAhmed.id, type: "strength", duration: 60, intensity: "عالي جداً", maxSpots: 15, price: 0 } }),
    db.class.create({ data: { name: "يوغا", description: "تمارين تنفس ومرونة لتحقيق التوازن الجسدي والنفسي", trainerId: trainerMona.id, type: "yoga", duration: 45, intensity: "خفيف", maxSpots: 20, price: 0 } }),
    db.class.create({ data: { name: "ملاكمة", description: "تدريب ملاكمة احترافي يحسن القوة والتنسيق الحركي", trainerId: trainerKarim.id, type: "boxing", duration: 60, intensity: "عالي", maxSpots: 12, price: 0 } }),
    db.class.create({ data: { name: "زومبا", description: "رقص لاتيني ممتع يحرق السعرات بطريقة مسلية", trainerId: trainerMona.id, type: "cardio", duration: 45, intensity: "متوسط", maxSpots: 25, price: 0 } }),
    db.class.create({ data: { name: "سباحة", description: "تمارين سباحة لجميع المستويات في مسبحنا الأولمبي", trainerId: trainerTarek.id, type: "swimming", duration: 60, intensity: "متوسط", maxSpots: 10, price: 0 } }),
    db.class.create({ data: { name: "تمارين مقاومة", description: "تمارين الأثقال والمقاومة لبناء العضلات", trainerId: trainerAhmed.id, type: "strength", duration: 75, intensity: "عالي", maxSpots: 15, price: 0 } }),
    db.class.create({ data: { name: "رقص لاتيني", description: "تعلم الرقص اللاتيني في بيئة مرحة ومشجعة", trainerId: trainerSara.id, type: "dance", duration: 45, intensity: "متوسط", maxSpots: 20, price: 0 } }),
    db.class.create({ data: { name: "بيلاتس", description: "تمارين بيلاتس لتقوية عضلات الجسم الأساسية", trainerId: trainerSara.id, type: "yoga", duration: 50, intensity: "خفيف", maxSpots: 15, price: 0 } }),
  ]);

  // ─── Schedules (next 7 days) ──────────────────────────────────────────────────
  const today = new Date();
  const schedules = [];
  const classTimePairs = [
    { cls: clsCrossfit,  time: "06:00", dayOffset: 0 },
    { cls: clsYoga,      time: "08:00", dayOffset: 0 },
    { cls: clsBoxing,    time: "17:00", dayOffset: 1 },
    { cls: clsZumba,     time: "19:00", dayOffset: 1 },
    { cls: clsSwim,      time: "07:00", dayOffset: 2 },
    { cls: clsStrength,  time: "18:00", dayOffset: 2 },
    { cls: clsDance,     time: "19:00", dayOffset: 3 },
    { cls: clsPilates,   time: "09:00", dayOffset: 3 },
    { cls: clsCrossfit,  time: "06:00", dayOffset: 4 },
    { cls: clsYoga,      time: "08:00", dayOffset: 4 },
    { cls: clsBoxing,    time: "17:00", dayOffset: 5 },
    { cls: clsZumba,     time: "10:00", dayOffset: 6 },
  ];
  for (const { cls, time, dayOffset } of classTimePairs) {
    const date = new Date(today);
    date.setDate(date.getDate() + dayOffset);
    const s = await db.schedule.create({
      data: { classId: cls.id, date, time, availableSpots: cls.maxSpots, isActive: true },
    });
    schedules.push(s);
  }

  // Past schedules for booking history
  const pastSchedules = [];
  for (const { cls, time } of classTimePairs.slice(0, 4)) {
    const date = new Date(today);
    date.setDate(date.getDate() - 7);
    const s = await db.schedule.create({
      data: { classId: cls.id, date, time, availableSpots: 0, isActive: false },
    });
    pastSchedules.push(s);
  }

  // ─── Products ─────────────────────────────────────────────────────────────────
  await Promise.all([
    db.product.create({ data: { name: "بروتين واي 2كج", description: "بروتين واي عالي الجودة بنكهة الشوكولاتة والفانيليا", price: 850, oldPrice: 950, category: "supplement", stock: 24, images: JSON.stringify(["/products/protein.jpg"]), isActive: true } }),
    db.product.create({ data: { name: "قفازات تدريب جلد", description: "قفازات تدريب احترافية من الجلد الطبيعي", price: 180, category: "gear", stock: 42, sizes: JSON.stringify(["S", "M", "L", "XL"]), isActive: true } }),
    db.product.create({ data: { name: "تيشيرت FitZone", description: "تيشيرت رياضي مريح بشعار FitZone", price: 120, category: "clothing", stock: 60, sizes: JSON.stringify(["S", "M", "L", "XL", "XXL"]), colors: JSON.stringify(["أسود", "أبيض", "أحمر"]), isActive: true } }),
    db.product.create({ data: { name: "حبل قفز احترافي", description: "حبل قفز قابل للتعديل مصنوع من الفولاذ المطلي", price: 95, category: "gear", stock: 33, isActive: true } }),
    db.product.create({ data: { name: "كرياتين مونوهيدرات", description: "كرياتين نقي 100% لزيادة القوة والأداء", price: 450, oldPrice: 500, category: "supplement", stock: 18, isActive: true } }),
    db.product.create({ data: { name: "شنطة رياضية", description: "حقيبة رياضية واسعة مع جيب منفصل للأحذية", price: 320, category: "accessory", stock: 15, colors: JSON.stringify(["أسود", "رمادي"]), isActive: true } }),
  ]);

  // ─── Offers ───────────────────────────────────────────────────────────────────
  const future = new Date(); future.setMonth(future.getMonth() + 2);
  await Promise.all([
    db.offer.create({ data: { title: "خصم رمضان 30%", discount: 30, description: "خصم 30% على جميع الباقات طوال شهر رمضان", expiresAt: future, isActive: true } }),
    db.offer.create({ data: { title: "عرض الطلاب", discount: 100, description: "خصم 100 جنيه على باقة أساسي للطلاب", expiresAt: future, isActive: true } }),
    db.offer.create({ data: { title: "خصم الصيف 20%", discount: 20, description: "استمتع بصيف صحي بخصم 20% على VIP", expiresAt: future, isActive: false } }),
  ]);

  // ─── Users ────────────────────────────────────────────────────────────────────
  const adminHash  = await bcrypt.hash("Admin123!", 10);
  const memberHash = await bcrypt.hash("Member123!", 10);
  const ahmed2Hash = await bcrypt.hash("Ahmed123!", 10);

  const [adminUser, memberUser, ahmed2User] = await Promise.all([
    db.user.create({ data: { name: "المدير العام", email: "admin@fitzone.eg", password: adminHash, role: "admin", phone: "01000000000" } }),
    db.user.create({ data: { name: "ياسمين علي",  email: "yasmine@fitzone.eg", password: memberHash, role: "member", phone: "01098765432" } }),
    db.user.create({ data: { name: "أحمد فاروق",  email: "ahmed@fitzone.eg",   password: ahmed2Hash,  role: "member", phone: "01123456789" } }),
  ]);

  // ─── Memberships for users ────────────────────────────────────────────────────
  const membershipStart = new Date();
  const membershipEnd = new Date(); membershipEnd.setDate(membershipEnd.getDate() + 25);
  await Promise.all([
    db.userMembership.create({ data: { userId: memberUser.id, membershipId: planVip.id, startDate: membershipStart, endDate: membershipEnd, status: "active" } }),
    db.userMembership.create({ data: { userId: ahmed2User.id, membershipId: planBasic.id, startDate: membershipStart, endDate: membershipEnd, status: "active" } }),
  ]);

  // ─── Wallet ───────────────────────────────────────────────────────────────────
  const [walletMember, walletAhmed] = await Promise.all([
    db.wallet.create({ data: { userId: memberUser.id, balance: 750 } }),
    db.wallet.create({ data: { userId: ahmed2User.id, balance: 150 } }),
  ]);

  await Promise.all([
    db.walletTransaction.create({ data: { walletId: walletMember.id, amount: 100, type: "credit", description: "مكافأة اشتراك VIP" } }),
    db.walletTransaction.create({ data: { walletId: walletMember.id, amount: 650, type: "credit", description: "شحن رصيد" } }),
    db.walletTransaction.create({ data: { walletId: walletMember.id, amount: -50,  type: "debit",  description: "حجز كلاس كروس فيت" } }),
    db.walletTransaction.create({ data: { walletId: walletAhmed.id,  amount: 150, type: "credit", description: "شحن رصيد" } }),
  ]);

  // ─── Reward Points ─────────────────────────────────────────────────────────────
  const [rewardMember, rewardAhmed] = await Promise.all([
    db.rewardPoints.create({ data: { userId: memberUser.id, points: 3200, tier: "platinum" } }),
    db.rewardPoints.create({ data: { userId: ahmed2User.id, points: 420, tier: "bronze" } }),
  ]);

  await Promise.all([
    db.rewardHistory.create({ data: { rewardId: rewardMember.id, points: 200, reason: "تجديد اشتراك VIP" } }),
    db.rewardHistory.create({ data: { rewardId: rewardMember.id, points: 3000, reason: "نقاط البداية" } }),
    db.rewardHistory.create({ data: { rewardId: rewardAhmed.id,  points: 420, reason: "نقاط البداية" } }),
  ]);

  // ─── Referrals ────────────────────────────────────────────────────────────────
  await Promise.all([
    db.referral.create({ data: { userId: memberUser.id, code: "YASMINE2025", totalEarned: 150 } }),
    db.referral.create({ data: { userId: ahmed2User.id,  code: "AHMED2025",   totalEarned: 0 } }),
  ]);

  // ─── Bookings ─────────────────────────────────────────────────────────────────
  await Promise.all([
    db.booking.create({ data: { userId: memberUser.id, scheduleId: schedules[0].id, status: "confirmed", paidAmount: 0, paymentMethod: "membership" } }),
    db.booking.create({ data: { userId: memberUser.id, scheduleId: schedules[2].id, status: "confirmed", paidAmount: 0, paymentMethod: "membership" } }),
    db.booking.create({ data: { userId: memberUser.id, scheduleId: pastSchedules[0].id, status: "attended",  paidAmount: 0, paymentMethod: "membership" } }),
    db.booking.create({ data: { userId: memberUser.id, scheduleId: pastSchedules[1].id, status: "attended",  paidAmount: 0, paymentMethod: "membership" } }),
    db.booking.create({ data: { userId: ahmed2User.id,  scheduleId: schedules[1].id, status: "confirmed", paidAmount: 0, paymentMethod: "membership" } }),
  ]);

  // ─── Orders ───────────────────────────────────────────────────────────────────
  const protein = await db.product.findFirst({ where: { name: { contains: "بروتين" } } });
  const tshirt  = await db.product.findFirst({ where: { name: { contains: "تيشيرت" } } });

  if (protein && tshirt) {
    const order = await db.order.create({ data: { userId: memberUser.id, total: 970, status: "delivered", address: "شارع النيل، بني سويف", paymentMethod: "wallet" } });
    await Promise.all([
      db.orderItem.create({ data: { orderId: order.id, productId: protein.id, quantity: 1, price: 850 } }),
      db.orderItem.create({ data: { orderId: order.id, productId: tshirt.id,  quantity: 1, price: 120 } }),
    ]);
  }

  // ─── Notifications ────────────────────────────────────────────────────────────
  await Promise.all([
    db.notification.create({ data: { userId: memberUser.id, title: "مرحباً بك في FitZone! 🎉", body: "تم تفعيل اشتراكك VIP بنجاح. استمتع بجميع الخدمات.", type: "success", isRead: true } }),
    db.notification.create({ data: { userId: memberUser.id, title: "حجزك مؤكد ✅", body: "تم تأكيد حجزك في كلاس كروس فيت غداً الساعة 6 صباحاً.", type: "info", isRead: false } }),
    db.notification.create({ data: { userId: memberUser.id, title: "عرض خاص لك 🔥", body: "احصل على خصم 30% على تجديد اشتراكك خلال 5 أيام القادمة.", type: "info", isRead: false } }),
    db.notification.create({ data: { userId: memberUser.id, title: "اشتراكك ينتهي قريباً ⚠️", body: "اشتراكك VIP سينتهي خلال 25 يوماً. جدد الآن واحصل على 100 جنيه هدية.", type: "warning", isRead: false } }),
    db.notification.create({ data: { userId: ahmed2User.id,  title: "مرحباً أحمد! 👋", body: "تم تفعيل اشتراكك الأساسي. نتمنى لك رحلة رياضية ممتعة.", type: "success", isRead: true } }),
  ]);

  // ─── Done ─────────────────────────────────────────────────────────────────────
  console.log("✅ تم تحميل البيانات بنجاح!");
  console.log("─────────────────────────────────────────");
  console.log("👤 المستخدمون:");
  console.log("   admin@fitzone.eg     / Admin123!   (مدير)");
  console.log("   yasmine@fitzone.eg   / Member123!  (عضو VIP)");
  console.log("   ahmed@fitzone.eg     / Ahmed123!   (عضو أساسي)");
  console.log("─────────────────────────────────────────");
  console.log(`📦 ${await db.membership.count()} باقات`);
  console.log(`🏋️  ${await db.class.count()} كلاسات`);
  console.log(`📅 ${await db.schedule.count()} جلسات`);
  console.log(`🛍️  ${await db.product.count()} منتجات`);
}

main()
  .catch((e) => { console.error("❌ خطأ:", e); process.exit(1); })
  .finally(async () => { await db.$disconnect(); });
