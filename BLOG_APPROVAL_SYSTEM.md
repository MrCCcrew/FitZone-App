# نظام الموافقة على مقالات المدونة

## نظرة عامة

تم إضافة نظام موافقة كامل لمقالات المدونة يسمح لمدير التعاقدات بإضافة محتوى للمدونة، مع إرسال الطلب للأدمن للمراجعة قبل النشر.

## المشكلة التي تم حلها

كان مدير التعاقدات يملك صلاحية "blog" لكن ما كان عنده صلاحية "site-content"، لذلك عندما كان يضيف مقالات، التعديلات ما كانت تتحفظ في الموقع.

## الحل

نظام موافقة على ثلاث مراحل:
1. **مدير التعاقدات** يضيف/يعدل مقال → يُرسل للمراجعة (pending)
2. **الأدمن** يستقبل إشعار ويراجع المقال
3. **الأدمن** يوافق → ينشر في المدونة مباشرة | يرفض → يرجع لمدير التعاقدات مع السبب

## المكونات الرئيسية

### 1. قاعدة البيانات

**النموذج الجديد:** `BlogPendingPost`

**الملف:** [prisma/schema.prisma](prisma/schema.prisma)

**الحقول:**
- `submittedBy`: معرف مدير التعاقدات
- `status`: `pending` | `approved` | `rejected`
- بيانات المقال الكاملة (title, content, summary, coverImage, etc.)
- `existingPostId`: إذا كان تعديل على مقال موجود
- `reviewedBy`, `reviewedAt`, `rejectReason`: بيانات المراجعة

**Migration:** [prisma/migrations/20260722205747_add_blog_pending_post/migration.sql](prisma/migrations/20260722205747_add_blog_pending_post/migration.sql)

### 2. API Endpoints

**الملف:** [src/app/api/admin/blog-pending/route.ts](src/app/api/admin/blog-pending/route.ts)

#### GET /api/admin/blog-pending
- جلب المقالات المعلقة
- الفلترة حسب الحالة: `?status=pending|approved|rejected|all`
- **للأدمن/staff:** يشوف كل المقالات
- **لمدير التعاقدات:** يشوف مقالاته فقط

#### POST /api/admin/blog-pending
- إنشاء/تعديل مقال معلق
- المدخلات: بيانات المقال الكاملة
- متاح لكل من لديه صلاحية "blog"

#### PATCH /api/admin/blog-pending
- الموافقة/الرفض على مقال (admin/staff only)
- يتطلب صلاحية "site-content"
- **عند الموافقة:**
  - يتم إضافة/تعديل المقال في `site_content.blog.posts`
  - تحديث حالة الطلب إلى `approved`
  - مسح الـ cache
- **عند الرفض:**
  - تحديث الحالة إلى `rejected`
  - حفظ سبب الرفض

#### DELETE /api/admin/blog-pending
- حذف مقال معلق
- يسمح للمُرسِل أو الأدمن فقط

### 3. واجهة مدير التعاقدات

**الملف:** [src/app/admin/sections/PagesContent.tsx](src/app/admin/sections/PagesContent.tsx)

**التعديلات:**
- الكشف التلقائي عن صلاحية "blog-only" (بدون "site-content")
- إخفاء قائمة المقالات الموجودة لمدير التعاقدات
- إخفاء إعدادات التصنيفات
- عرض رسالة تحذير في الأعلى
- تغيير زر الحفظ إلى "إرسال للمراجعة"
- عند الإضافة/التعديل: يُرسل الطلب إلى `BlogPendingPost` بدلاً من الحفظ المباشر
- عرض رسالة نجاح بعد الإرسال

**الواجهة:**
```
⚠️ ملاحظة: جميع المقالات التي تضيفها ستُرسل للمراجعة أولاً...

[نموذج إضافة المقال]
└─ زر: "إرسال للمراجعة" (بدلاً من "إضافة المحتوى")
```

### 4. واجهة الأدمن

**الملف الجديد:** [src/app/admin/sections/BlogPending.tsx](src/app/admin/sections/BlogPending.tsx)

**القسم:** "طلبات نشر المدونة" 📝

**الميزات:**
- فلترة حسب الحالة (pending, approved, rejected, الكل)
- عرض تفاصيل كل مقال (قابل للتوسيع)
- معاينة المحتوى، الملخص، صورة الغلاف
- عرض معلومات المُرسِل وتاريخ الإرسال
- لكل مقال معلق:
  - ✓ **موافقة ونشر في المدونة** (زر أخضر)
  - ✗ **رفض** (زر أحمر مع إمكانية إدخال سبب)
  - 🗑 **حذف الطلب**

**الحالات:**
- 🟡 **بانتظار المراجعة** (pending) - لون أصفر
- 🟢 **تمت الموافقة** (approved) - لون أخضر
- 🔴 **مرفوض** (rejected) - لون أحمر

### 5. تحديثات النظام

**الملفات المعدلة:**

1. [src/app/admin/AdminPanel.tsx](src/app/admin/AdminPanel.tsx)
   - إضافة import لـ BlogPending
   - إضافة في NAV
   - إضافة في TITLES
   - إضافة في SECTIONS

2. [src/app/admin/types.ts](src/app/admin/types.ts)
   - إضافة `"blog-pending"` في Section type

3. [src/lib/admin-permissions.ts](src/lib/admin-permissions.ts)
   - إضافة mapping: `"blog-pending": "site-content"`

## سير العمل (Workflow)

### السيناريو 1: إضافة مقال جديد

```
1. مدير التعاقدات
   └─ يفتح Admin Panel → الصفحات والمحتوى → المدونة
   └─ يملأ بيانات المقال (عنوان، محتوى، صورة، الخ)
   └─ يضغط "إرسال للمراجعة"
   └─ ✅ رسالة: "تم إرسال المقال للمراجعة..."

2. النظام
   └─ يحفظ المقال في جدول `BlogPendingPost`
   └─ status = "pending"
   └─ TODO: يرسل إشعار للأدمن

3. الأدمن
   └─ يفتح Admin Panel → طلبات نشر المدونة
   └─ يشوف المقال الجديد بحالة "بانتظار المراجعة"
   └─ يضغط "عرض" لقراءة المحتوى
   └─ يضغط "✓ موافقة ونشر في المدونة"

4. النظام
   └─ يضيف المقال إلى `site_content.blog.posts`
   └─ يحدث status إلى "approved"
   └─ يمسح الـ cache
   └─ ✅ المقال يظهر في المدونة مباشرة

5. TODO: إشعار لمدير التعاقدات
   └─ "تم نشر مقالك '{title}' في المدونة"
```

### السيناريو 2: رفض المقال

```
3. الأدمن (بدلاً من الموافقة)
   └─ يضغط "✗ رفض"
   └─ يكتب سبب الرفض: "الصورة غير واضحة، يرجى تحديث..."
   └─ يضغط OK

4. النظام
   └─ يحدث status إلى "rejected"
   └─ يحفظ rejectReason
   └─ TODO: يرسل إشعار لمدير التعاقدات مع السبب

5. مدير التعاقدات
   └─ يستقبل الإشعار
   └─ يعدل المقال ويرسله مرة أخرى
```

### السيناريو 3: تعديل مقال موجود

نفس السيناريو 1، لكن:
- يتم حفظ `existingPostId` مع الطلب
- عند الموافقة: يتم **استبدال** المقال القديم بدلاً من إضافة جديد

## الصلاحيات

| الدور | site-content | blog | يقدر يضيف | يقدر يوافق |
|------|--------------|------|-----------|------------|
| admin | ✅ | ✅ | ✅ (مباشر) | ✅ |
| staff | ✅ | ✅ | ✅ (مباشر) | ✅ |
| contracts_manager | ❌ | ✅ | ✅ (pending) | ❌ |

## TODO: الإشعارات

يجب إضافة إشعارات push في:

### في [src/app/api/admin/blog-pending/route.ts](src/app/api/admin/blog-pending/route.ts):

```typescript
// POST - بعد إنشاء الطلب
await sendPushNotification(adminUserId, {
  title: "طلب نشر مقال جديد في المدونة",
  body: `${submitterName} يطلب نشر مقال: ${body.title}`,
});

// PATCH - عند الموافقة
await sendPushNotification(post.submittedBy, {
  title: "تمت الموافقة على مقالك",
  body: `تم نشر مقالك "${post.title}" في المدونة`,
});

// PATCH - عند الرفض
await sendPushNotification(post.submittedBy, {
  title: "تم رفض مقالك",
  body: body.rejectReason ?? "يرجى التواصل مع الإدارة لمعرفة السبب",
});
```

## الملفات الرئيسية

### قاعدة البيانات
- [prisma/schema.prisma](prisma/schema.prisma) - النموذج
- [prisma/migrations/20260722205747_add_blog_pending_post/migration.sql](prisma/migrations/20260722205747_add_blog_pending_post/migration.sql) - Migration

### Backend
- [src/app/api/admin/blog-pending/route.ts](src/app/api/admin/blog-pending/route.ts) - API endpoints

### Frontend
- [src/app/admin/sections/PagesContent.tsx](src/app/admin/sections/PagesContent.tsx) - واجهة مدير التعاقدات
- [src/app/admin/sections/BlogPending.tsx](src/app/admin/sections/BlogPending.tsx) - واجهة الأدمن

### النظام
- [src/app/admin/AdminPanel.tsx](src/app/admin/AdminPanel.tsx) - تسجيل القسم
- [src/app/admin/types.ts](src/app/admin/types.ts) - Types
- [src/lib/admin-permissions.ts](src/lib/admin-permissions.ts) - Permissions

## التشغيل والاختبار

### تطبيق الـ Migration:

```bash
# إذا MySQL يعمل بدون مشاكل
npx prisma migrate deploy

# أو تطبيق SQL يدوياً
mysql -u fitzone -p fitzone_prod < prisma/migrations/20260722205747_add_blog_pending_post/migration.sql
```

### سيناريوهات الاختبار:

#### 1. كمدير تعاقدات:
```
1. سجل دخول كـ contracts_manager
2. افتح Admin Panel → الصفحات والمحتوى
3. تأكد إنك تشوف تبويب "المدونة" فقط (مش باقي التبويبات)
4. تأكد من ظهور رسالة التحذير الصفراء في الأعلى
5. املأ بيانات مقال جديد
6. اضغط "إرسال للمراجعة"
7. تأكد من ظهور رسالة النجاح
```

#### 2. كأدمن:
```
1. سجل دخول كـ admin
2. افتح Admin Panel → طلبات نشر المدونة
3. تأكد من ظهور المقال المعلق
4. اضغط "عرض" لقراءة التفاصيل
5. اضغط "موافقة ونشر"
6. تأكد من ظهور رسالة النجاح
7. افتح الصفحات والمحتوى → المدونة
8. تأكد من ظهور المقال في القائمة
9. افتح الموقع وتأكد من ظهور المقال في المدونة
```

#### 3. سيناريو الرفض:
```
1. كأدمن، اضغط "رفض" على مقال
2. اكتب سبب: "الصورة غير مناسبة"
3. ارجع للقائمة وفلتر بـ "مرفوض"
4. تأكد من ظهور المقال مع سبب الرفض
```

## الأمان

- ✅ التحقق من الصلاحيات على مستوى API
- ✅ مدير التعاقدات يشوف مقالاته فقط
- ✅ الأدمن/staff فقط يقدر يوافق/يرفض
- ✅ Audit logging لكل العمليات
- ✅ التحقق من ملكية المقال قبل التعديل/الحذف

## ملاحظات مهمة

1. **مدير التعاقدات ما يقدر يعدل المقالات المنشورة مباشرة** - لازم يرسل طلب جديد
2. **المقالات المعلقة ما تظهر في الموقع** - فقط بعد الموافقة
3. **يمكن تعديل مقال معلق** قبل المراجعة من نفس المُرسِل
4. **بعد الموافقة/الرفض** المقال يبقى في الجدول للسجلات
5. **الفلترة متاحة** لسهولة الوصول للطلبات المعلقة

## الميزات المستقبلية المقترحة

- [ ] إشعارات push تلقائية
- [ ] نظام تعليقات على المقالات المعلقة (للمراجعة)
- [ ] سجل التعديلات (versioning)
- [ ] إمكانية جدولة النشر (تحديد تاريخ ووقت)
- [ ] إحصائيات عن المقالات (عدد المعلق/المنشور/المرفوض)
- [ ] تصنيف المقالات تلقائياً بناءً على المحتوى
