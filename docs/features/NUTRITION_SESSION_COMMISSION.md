# نظام عمولة جلسات التغذية

## نظرة عامة

تم إضافة نظام عمولة تلقائي لدكتورة التغذية على **كل جلسة مدفوعة** (consultation/followup)، بالإضافة إلى العمولة الموجودة على الإحالات (referral links).

## المشكلة التي تم حلها

كانت الدكتورة تحصل على عمولة **فقط** من الاشتراكات التي تتم عبر روابط الإحالة الخاصة بها. المطلوب كان إضافة عمولة على **كل حجز جلسة** يدفعه العميل مباشرة.

## الحل

نظام عمولة متكامل:
1. **الأدمن** يحدد نسبة العمولة (percentage أو fixed) من لوحة التحكم
2. عند **دفع العميل** لجلسة تغذية → يتم حساب العمولة تلقائياً
3. **تُسجَّل العمولة** في قاعدة البيانات مع ربطها بالجلسة
4. **تظهر في حساب الدكتورة** في تبويب "روابط الإحالة والعمولات" منفصلة حسب النوع

## المكونات الرئيسية

### 1. قاعدة البيانات

**التعديل:** إضافة حقل `nutritionSessionId` إلى `NutritionCommission`

**الملف:** [prisma/schema.prisma](prisma/schema.prisma)

```prisma
model NutritionCommission {
  id                      String    @id @default(cuid())
  nutritionistUserId      String
  nutritionReferralLinkId String?
  userMembershipId        String?   @unique
  nutritionSessionId      String?    // ← جديد
  amount                  Float
  status                  String    @default("earned") // earned | settled
  settledAt               DateTime?
  createdAt               DateTime  @default(now())

  nutritionistUser      User                   @relation("NutritionCommissions", fields: [nutritionistUserId], references: [id], onDelete: Cascade)
  nutritionReferralLink NutritionReferralLink?  @relation(fields: [nutritionReferralLinkId], references: [id], onDelete: SetNull)
  userMembership        UserMembership?         @relation(fields: [userMembershipId], references: [id], onDelete: SetNull)
  nutritionSession      NutritionSession?       @relation(fields: [nutritionSessionId], references: [id], onDelete: SetNull) // ← جديد

  @@index([nutritionistUserId, status])
  @@index([createdAt])
}

model NutritionSession {
  // ... الحقول الموجودة
  commissions        NutritionCommission[] // ← جديد
}
```

**Migration:** [prisma/migrations/20260722224512_add_nutrition_session_commission/migration.sql](prisma/migrations/20260722224512_add_nutrition_session_commission/migration.sql)

### 2. حساب العمولة عند الدفع

**الملف:** [src/lib/payments/service.ts](src/lib/payments/service.ts)

**التعديل:** في دالة `markPaidByReference`، عند تحديث حالة الجلسة لـ `paid`:

```typescript
// Mark nutrition session as paid
const nutritionSessionId =
  typeof metadata?.nutritionSessionId === "string" ? metadata.nutritionSessionId : null;
if (nutritionSessionId) {
  const session = await db.nutritionSession.findFirst({
    where: { id: nutritionSessionId, status: "approved" },
    include: {
      nutritionist: { select: { userId: true, commissionRate: true, commissionType: true } },
    },
  });

  if (session) {
    await db.nutritionSession.update({
      where: { id: nutritionSessionId },
      data: { status: "paid", paidAt: transaction.paidAt ?? new Date(), paymentTransactionId: transactionId },
    });

    // Calculate and create commission
    const { commissionRate, commissionType, userId: nutritionistUserId } = session.nutritionist;
    if (commissionRate > 0) {
      const commissionAmount =
        commissionType === "percentage"
          ? (session.price * commissionRate) / 100
          : commissionRate;

      await db.nutritionCommission.create({
        data: {
          nutritionistUserId,
          nutritionSessionId: session.id,
          amount: commissionAmount,
          status: "earned",
        },
      });
    }

    // ... إشعار العميل
  }
}
```

**آلية الحساب:**
- **نسبة مئوية** (`percentage`): `العمولة = (سعر الجلسة × نسبة العمولة) ÷ 100`
- **قيمة ثابتة** (`fixed`): `العمولة = نسبة العمولة`

### 3. API للدكتورة

**الملف:** [src/app/api/nutritionist/links/route.ts](src/app/api/nutritionist/links/route.ts)

**التعديل:** في `GET /api/nutritionist/links`:

```typescript
const [links, commissions, profile] = await Promise.all([
  dbx.nutritionReferralLink.findMany({ /* ... */ }),
  dbx.nutritionCommission.findMany({
    where: { nutritionistUserId: userId! },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      userMembership: { select: { user: { select: { name: true } } } },
      nutritionSession: { select: { id: true, type: true, price: true, user: { select: { name: true } } } }, // ← جديد
    },
  }),
  dbx.nutritionistProfile.findUnique({ /* ... */ }),
]);

const referralCommissions = commissions.filter((c: any) => c.userMembershipId !== null);
const sessionCommissions = commissions.filter((c: any) => c.nutritionSessionId !== null);

const totalEarned: number = commissions.reduce((sum: number, c: any) => sum + c.amount, 0);
const pendingEarned: number = commissions.filter((c: any) => c.status === "earned").reduce((sum: number, c: any) => sum + c.amount, 0);

const referralEarned: number = referralCommissions.reduce((sum: number, c: any) => sum + c.amount, 0);
const sessionEarned: number = sessionCommissions.reduce((sum: number, c: any) => sum + c.amount, 0);

return NextResponse.json({
  links,
  commissions,
  referralCommissions,      // ← جديد
  sessionCommissions,       // ← جديد
  summary: {
    totalEarned,
    pendingEarned,
    referralEarned,         // ← جديد
    sessionEarned,          // ← جديد
    count: commissions.length
  },
  commissionRate: profile?.commissionRate ?? 0,
  commissionType: profile?.commissionType ?? "percentage",
});
```

### 4. واجهة الدكتورة

**الملف:** [src/app/account/AccountClient.tsx](src/app/account/AccountClient.tsx)

**التعديلات:**

#### 1. Type definition:
```typescript
type NutritionCommissionItem = {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  userMembership?: { user?: { name?: string } };
  nutritionSession?: { id: string; type: string; price: number; user?: { name?: string } }; // ← جديد
};
```

#### 2. State:
```typescript
const [referralCommissions, setReferralCommissions] = useState<NutritionCommissionItem[]>([]);
const [sessionCommissions, setSessionCommissions] = useState<NutritionCommissionItem[]>([]);
const [commissionSummary, setCommissionSummary] = useState({
  totalEarned: 0,
  pendingEarned: 0,
  referralEarned: 0,  // ← جديد
  sessionEarned: 0,   // ← جديد
});
```

#### 3. UI - ملخص العمولات:
```jsx
{/* Commission summary */}
<div className="grid grid-cols-2 gap-3">
  <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4">
    <div className="text-xs text-green-600 dark:text-green-400 mb-1">{t("إجمالي العمولات", "Total commissions")}</div>
    <div className="text-xl font-black text-green-700 dark:text-green-300">{commissionSummary.totalEarned.toFixed(2)} {t("ج.م", "EGP")}</div>
  </div>
  <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
    <div className="text-xs text-amber-600 dark:text-amber-400 mb-1">{t("في الانتظار", "Pending")}</div>
    <div className="text-xl font-black text-amber-700 dark:text-amber-300">{commissionSummary.pendingEarned.toFixed(2)} {t("ج.م", "EGP")}</div>
  </div>
</div>
<div className="grid grid-cols-2 gap-3">
  <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3">
    <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">{t("عمولات الإحالات", "Referral commissions")}</div>
    <div className="text-lg font-black text-blue-700 dark:text-blue-300">{commissionSummary.referralEarned.toFixed(2)} {t("ج.م", "EGP")}</div>
  </div>
  <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 p-3">
    <div className="text-xs text-purple-600 dark:text-purple-400 mb-1">{t("عمولات الجلسات", "Session commissions")}</div>
    <div className="text-lg font-black text-purple-700 dark:text-purple-300">{commissionSummary.sessionEarned.toFixed(2)} {t("ج.م", "EGP")}</div>
  </div>
</div>
```

#### 4. UI - سجل العمولات (منفصل حسب النوع):
- **💰 عمولات الجلسات** (لون بنفسجي): تعرض اسم العميل، نوع الجلسة (كشف/إعادة كشف)، سعر الجلسة، مبلغ العمولة
- **🔗 عمولات الإحالات** (لون أزرق): تعرض اسم العميل، مبلغ العمولة

## سير العمل (Workflow)

### السيناريو: عميل يدفع لجلسة تغذية

```
1. الأدمن
   └─ يفتح Admin Panel → التغذية → معلومات الدكتورة
   └─ يحدد نسبة العمولة (مثلاً: 20% أو 50 ج.م ثابت)
   └─ يحفظ الإعدادات

2. العميل
   └─ يحجز جلسة تغذية (كشف: 400 ج.م، كشف عضوة: 300 ج.م، إعادة كشف: 100 ج.م)
   └─ الدكتورة توافق على الطلب
   └─ العميل يدفع عبر Fawry/Paymob

3. النظام (payment service)
   └─ يستقبل callback من بوابة الدفع
   └─ يحدث حالة الجلسة إلى "paid"
   └─ يجيب بيانات الدكتورة (userId, commissionRate, commissionType)
   └─ يحسب العمولة:
      • لو percentage: (400 × 20) ÷ 100 = 80 ج.م
      • لو fixed: 50 ج.م
   └─ ينشئ سجل عمولة جديد في NutritionCommission:
      • nutritionistUserId = الدكتورة
      • nutritionSessionId = الجلسة المدفوعة
      • amount = 80 ج.م
      • status = "earned"
   └─ يرسل إشعار للعميل: "تم تأكيد حجز كشف دكتورة التغذية!"

4. الدكتورة
   └─ تفتح Account → ملف التغذية → روابط الإحالة والعمولات
   └─ تشوف الملخص:
      • إجمالي العمولات: 80 ج.م
      • في الانتظار: 80 ج.م
      • عمولات الإحالات: 0 ج.م
      • عمولات الجلسات: 80 ج.م
   └─ في السجل تشوف:
      💰 عمولات الجلسات
      ├─ اسم العميل
      ├─ كشف • 400 ج.م
      ├─ 80.00 ج.م (عمولة)
      └─ في الانتظار

5. الأدمن (لاحقاً)
   └─ يصرف العمولة للدكتورة
   └─ يحدث status إلى "settled"
```

## الملفات المعدلة

### قاعدة البيانات
- [prisma/schema.prisma](prisma/schema.prisma) - إضافة nutritionSessionId + relation
- [prisma/migrations/20260722224512_add_nutrition_session_commission/migration.sql](prisma/migrations/20260722224512_add_nutrition_session_commission/migration.sql) - Migration

### Backend
- [src/lib/payments/service.ts](src/lib/payments/service.ts) - حساب وإنشاء العمولة عند الدفع
- [src/app/api/nutritionist/links/route.ts](src/app/api/nutritionist/links/route.ts) - فصل البيانات حسب النوع

### Frontend
- [src/app/account/AccountClient.tsx](src/app/account/AccountClient.tsx) - UI محدثة مع فصل العرض

## التشغيل والاختبار

### 1. تطبيق الـ Migration:

```bash
# إذا MySQL يعمل بدون مشاكل
npx prisma migrate deploy

# أو تطبيق SQL يدوياً
mysql -u fitzone -p fitzone_prod < prisma/migrations/20260722224512_add_nutrition_session_commission/migration.sql

# تحديث Prisma Client
npx prisma generate
```

### 2. تحديد نسبة العمولة:

```
1. سجل دخول كـ admin
2. افتح Admin Panel → التغذية
3. اضغط "معلومات الدكتورة"
4. اضبط:
   - نسبة العمولة: 20 (مثلاً)
   - نوع العمولة: percentage (أو fixed)
5. احفظ
```

### 3. اختبار الحجز والدفع:

```
1. سجل دخول كعميل
2. احجز جلسة تغذية (كشف - 400 ج.م)
3. انتظر موافقة الدكتورة
4. ادفع عبر Fawry/Paymob
5. تأكد من:
   ✓ تحديث حالة الجلسة إلى "paid"
   ✓ إنشاء سجل عمولة في NutritionCommission
   ✓ العمولة = (400 × 20) ÷ 100 = 80 ج.م
```

### 4. التحقق من واجهة الدكتورة:

```
1. سجل دخول كـ nutritionist
2. افتح Account → ملف التغذية → روابط الإحالة والعمولات
3. تأكد من:
   ✓ ظهور "عمولات الجلسات: 80 ج.م"
   ✓ ظهور السجل في قسم "💰 عمولات الجلسات"
   ✓ عرض اسم العميل + نوع الجلسة + السعر + العمولة
```

## الأمان

- ✅ العمولة تُحسب **فقط** عند status = "approved" وبعد الدفع الفعلي
- ✅ لا يتم إنشاء عمولة مكررة (كل جلسة لها عمولة واحدة فقط)
- ✅ العمولة مربوطة بالجلسة عبر `nutritionSessionId` (foreign key)
- ✅ الحذف cascade-safe: لو اتحذفت الجلسة، العمولة تبقى لكن nutritionSessionId يبقى null
- ✅ نسبة العمولة محفوظة في `NutritionistProfile` ويحددها الأدمن فقط

## ملاحظات مهمة

1. **العمولة تُحسب مرة واحدة فقط** عند أول دفع ناجح
2. **لو الجلسة اتلغت بعد الدفع** (reschedule + refund)، العمولة تبقى كما هي - الأدمن يتصرف يدوياً
3. **نسبة العمولة الحالية** تُطبق على كل الجلسات الجديدة (مش retroactive)
4. **الفرق بين النوعين:**
   - عمولات الإحالات: على اشتراكات الجيم عبر روابط الإحالة
   - عمولات الجلسات: على حجوزات جلسات التغذية المباشرة
5. **الملخص يجمع النوعين** في "إجمالي العمولات"

## الميزات المستقبلية المقترحة

- [ ] إشعار push للدكتورة عند إضافة عمولة جديدة
- [ ] تقرير شهري بالعمولات (PDF export)
- [ ] إمكانية تعديل/حذف العمولة من الأدمن (مع Audit log)
- [ ] رسم بياني للعمولات حسب النوع والوقت
- [ ] نظام صرف تلقائي (auto-settle) شهرياً
- [ ] تصدير CSV لكل العمولات
- [ ] حساب ضريبة على العمولة (إن وُجد)
- [ ] ربط مع نظام المحاسبة (Accounting)

## أمثلة حسابية

### مثال 1: نسبة مئوية
```
نسبة العمولة: 20%
نوع الجلسة: كشف (عضوة)
سعر الجلسة: 300 ج.م
العمولة = (300 × 20) ÷ 100 = 60 ج.م
```

### مثال 2: قيمة ثابتة
```
نسبة العمولة: 50 ج.م (ثابت)
نوع الجلسة: إعادة كشف
سعر الجلسة: 100 ج.م
العمولة = 50 ج.م
```

### مثال 3: عمولة صفر
```
نسبة العمولة: 0%
نوع الجلسة: كشف
سعر الجلسة: 400 ج.م
العمولة = لا يتم إنشاء سجل عمولة (if commissionRate > 0)
```

## الدعم والصيانة

- السجلات في `NutritionCommission` تُحفظ دائماً (لا تُحذف)
- يمكن الاستعلام بـ SQL:
  ```sql
  SELECT * FROM NutritionCommission 
  WHERE nutritionSessionId IS NOT NULL
  ORDER BY createdAt DESC;
  ```
- الـ Audit log يسجل تعديلات نسبة العمولة من الأدمن
