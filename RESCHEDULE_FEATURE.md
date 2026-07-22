# ميزة إعادة جدولة جلسات التغذية واسترجاع الأموال

## نظرة عامة

تم إضافة نظام كامل لإدارة طلبات إعادة جدولة المواعيد واسترجاع الأموال للجلسات المدفوعة مع دكتورة التغذية.

## المكونات الرئيسية

### 1. قاعدة البيانات (Database Schema)

تم إضافة نموذج جديد `RescheduleRequest` في Prisma schema:

**الملف:** `prisma/schema.prisma`

**الحقول الرئيسية:**
- `sessionId`: معرف الجلسة المرتبطة
- `initiatedBy`: من بدأ الطلب (doctor_initiated | client_initiated)
- `status`: حالة الطلب (pending_client | client_accepted | client_rejected | client_wants_refund | refund_approved | refund_rejected)
- `proposedNewSlot`: الموعد الجديد المقترح من الدكتورة
- `doctorReason`: سبب طلب التغيير
- `clientResponse`: رد العميلة (accept | reject | refund)
- `clientChosenSlot`: الموعد البديل الذي اختارته العميلة
- `refundAmount`: مبلغ الاسترجاع
- `refundStatus`: حالة الاسترجاع (pending | approved | rejected | completed)

**Migration:** `prisma/migrations/20260722190922_add_reschedule_request/migration.sql`

### 2. API Endpoints

#### للدكتورة (Admin Panel)

**الملف:** `src/app/api/admin/nutrition/reschedule/route.ts`

**GET /api/admin/nutrition/reschedule**
- جلب طلبات إعادة الجدولة الخاصة بالدكتورة
- يمكن الفلترة حسب الحالة (status)

**POST /api/admin/nutrition/reschedule**
- إنشاء طلب إعادة جدولة جديد
- المدخلات المطلوبة:
  - `sessionId`: معرف الجلسة
  - `proposedNewSlot`: الموعد الجديد المقترح
  - `doctorReason`: سبب التغيير (اختياري)
- يتم التحقق من أن الجلسة مدفوعة (status = "paid")
- يرسل إشعار للعميلة (TODO)

**PATCH /api/admin/nutrition/reschedule**
- الموافقة أو رفض طلب استرجاع الأموال
- الإجراءات:
  - `approve_refund`: الموافقة وإضافة المبلغ لمحفظة العميلة
  - `reject_refund`: رفض طلب الاسترجاع
- عند الموافقة:
  - يتم إضافة المبلغ لمحفظة العميلة
  - يتم إنشاء معاملة محفظة بنوع "refund"
  - يتم تحديث حالة الجلسة إلى "cancelled"

#### للعميلة

**الملف:** `src/app/api/me/nutrition/reschedule/route.ts`

**GET /api/me/nutrition/reschedule**
- جلب طلبات إعادة الجدولة المعلقة للعميلة
- يعرض فقط الطلبات بحالة (pending_client | client_rejected)

**PATCH /api/me/nutrition/reschedule**
- الرد على طلب إعادة جدولة
- الإجراءات:
  - `accept`: قبول الموعد الجديد المقترح
  - `reject`: رفض واختيار موعد بديل (يتطلب `clientChosenSlot`)
  - `refund`: طلب استرجاع المبلغ
- يرسل إشعار للدكتورة (TODO)

### 3. واجهة الدكتورة (Admin Panel)

**الملف:** `src/app/admin/sections/Nutrition.tsx`

**الميزات المضافة:**

1. **زر "طلب تغيير الموعد"** في بطاقة الجلسة:
   - يظهر فقط للجلسات المدفوعة (status = "paid")
   - يفتح نموذج لإدخال الموعد الجديد والسبب

2. **قسم طلبات الاسترجاع المعلقة**:
   - يظهر في أعلى صفحة الجلسات
   - يعرض جميع الطلبات بحالة "client_wants_refund"
   - لكل طلب:
     - معلومات العميلة
     - الموعد الحالي والمقترح
     - سبب الرفض من العميلة
     - زر "موافقة على الاسترجاع" ✓
     - زر "رفض" ✗

### 4. واجهة العميلة

**الملف:** `src/app/account/AccountClient.tsx`

**في تبويب "Nutrition":**

**قسم طلبات تغيير المواعيد** (يظهر في الأعلى):
- تصميم بارز بلون كهرماني مع أيقونة تحذير
- لكل طلب:
  - صورة واسم الدكتورة
  - الموعد الحالي
  - الموعد الجديد المقترح
  - سبب التغيير من الدكتورة
  - ثلاثة خيارات:
    1. **موافقة على الموعد الجديد** ✓ (زر أخضر)
    2. **اختيار موعد آخر** 📅 (زر أزرق، يطلب إدخال موعد بديل)
    3. **استرجاع المبلغ** 💰 (زر أحمر، يطلب تأكيد)

## سير العمل (Workflow)

### السيناريو 1: العميلة توافق على الموعد الجديد

1. الدكتورة ترسل طلب تغيير موعد (status: `pending_client`)
2. العميلة تضغط "موافقة" (status: `client_accepted`)
3. يتم تحديث موعد الجلسة (`selectedSlot`)
4. ✅ تم

### السيناريو 2: العميلة تختار موعد بديل

1. الدكتورة ترسل طلب تغيير موعد (status: `pending_client`)
2. العميلة تختار موعد آخر (status: `client_rejected`)
3. يتم تحديث موعد الجلسة بالموعد الذي اختارته العميلة
4. ✅ تم

### السيناريو 3: العميلة تطلب استرجاع المبلغ

1. الدكتورة ترسل طلب تغيير موعد (status: `pending_client`)
2. العميلة تطلب استرجاع (status: `client_wants_refund`)
3. يظهر الطلب في قسم "طلبات الاسترجاع المعلقة" للدكتورة
4. **إذا الدكتورة وافقت:**
   - يتم إضافة المبلغ لمحفظة العميلة
   - تتحول حالة الجلسة إلى "cancelled"
   - status: `refund_approved`
5. **إذا الدكتورة رفضت:**
   - status: `refund_rejected`
   - يمكن للعميلة اختيار موعد آخر أو التواصل مع الدكتورة

## TODO: الإشعارات

يجب إضافة إشعارات push في المواقع التالية:

### في `src/app/api/admin/nutrition/reschedule/route.ts`:

```typescript
// عند إنشاء طلب جديد (POST)
await sendPushNotification(session.userId, {
  title: "طلب تغيير موعد",
  body: `الدكتورة ${session.nutritionist.name} تطلب تغيير موعد جلستك إلى ${body.proposedNewSlot}`,
});

// عند الموافقة على الاسترجاع (PATCH - approve_refund)
await sendPushNotification(request.session.userId, {
  title: "تمت الموافقة على الاسترجاع",
  body: `تم إضافة ${request.refundAmount ?? request.session.price} جنيه إلى محفظتك`,
});

// عند رفض الاسترجاع (PATCH - reject_refund)
await sendPushNotification(request.session.userId, {
  title: "تم رفض طلب الاسترجاع",
  body: body.reason ?? "يرجى التواصل مع الدكتورة لتحديد موعد آخر",
});
```

### في `src/app/api/me/nutrition/reschedule/route.ts`:

```typescript
// عند قبول الموعد الجديد (accept)
await sendPushNotification(request.session.nutritionist.userId, {
  title: "تم قبول تغيير الموعد",
  body: `${request.session.user.name} وافقت على الموعد الجديد: ${request.proposedNewSlot}`,
});

// عند اختيار موعد بديل (reject)
await sendPushNotification(request.session.nutritionist.userId, {
  title: "اختيار موعد بديل",
  body: `${request.session.user.name} اختارت موعد بديل: ${body.clientChosenSlot}`,
});

// عند طلب الاسترجاع (refund)
await sendPushNotification(request.session.nutritionist.userId, {
  title: "طلب استرجاع مبلغ",
  body: `${request.session.user.name} طلبت استرجاع مبلغ الجلسة (${request.session.price} جنيه)`,
});
```

## الملفات المعدلة

1. `prisma/schema.prisma` - إضافة نموذج RescheduleRequest
2. `prisma/migrations/20260722190922_add_reschedule_request/migration.sql` - ملف الهجرة
3. `src/app/api/admin/nutrition/reschedule/route.ts` - API للدكتورة (جديد)
4. `src/app/api/me/nutrition/reschedule/route.ts` - API للعميلة (جديد)
5. `src/app/admin/sections/Nutrition.tsx` - واجهة الدكتورة
6. `src/app/account/AccountClient.tsx` - واجهة العميلة

## التشغيل والاختبار

### تطبيق الـ Migration:

```bash
# إذا كان MySQL يعمل ولا توجد مشاكل authentication
npx prisma migrate deploy

# أو تطبيق SQL يدوياً
mysql -u fitzone -p fitzone_prod < prisma/migrations/20260722190922_add_reschedule_request/migration.sql
```

### سيناريوهات الاختبار:

1. **كدكتورة:**
   - افتح لوحة التحكم → Nutrition → الطلبات
   - اختر جلسة مدفوعة
   - اضغط "طلب تغيير الموعد"
   - أدخل موعد جديد وسبب
   - تحقق من ظهور الإشعار للعميلة

2. **كعميلة:**
   - افتح حسابي → Nutrition
   - تحقق من ظهور قسم طلبات التغيير
   - جرب كل خيار (موافقة، موعد بديل، استرجاع)

3. **استرجاع الأموال:**
   - كعميلة: اطلب استرجاع
   - كدكتورة: وافق على الطلب
   - كعميلة: تحقق من إضافة المبلغ للمحفظة
   - تحقق من تحول حالة الجلسة إلى "cancelled"

## الأمان والتحقق

- ✅ التحقق من صاحب الجلسة قبل السماح بأي إجراء
- ✅ التحقق من حالة الجلسة (يجب أن تكون مدفوعة)
- ✅ منع طلبات إعادة جدولة متعددة للجلسة الواحدة
- ✅ استخدام transactions عند إضافة المبلغ للمحفظة
- ✅ Audit logging لجميع الإجراءات

## ملاحظات مهمة

1. الميزة تعمل فقط مع الجلسات المدفوعة (status = "paid")
2. لا يمكن إنشاء أكثر من طلب إعادة جدولة معلق لنفس الجلسة
3. عند الموافقة على الاسترجاع، يتم تحويل المبلغ للمحفظة (وليس للبطاقة البنكية)
4. الإشعارات (push notifications) لم يتم تفعيلها بعد - تحتاج لإزالة التعليقات من الكود
