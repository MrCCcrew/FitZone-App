# FitZone Server Hardening Guide

هذا الدليل مخصص لسيرفر Linux يشغل `Nginx + PM2 + Node.js`.

الهدف هنا ليس ادعاء "منع الاختراق بالكامل"، بل تقليل سطح الهجوم ورفع صعوبة الاستغلال مع الحفاظ على استقرار الموقع.

## 1. النظام والحزم

حدّث النظام أولًا:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt autoremove -y
```

## 2. مستخدم الإدارة و SSH

- أنشئ مستخدم إدارة عادي، ولا تعمل يوميًا بحساب `root`
- فعّل الدخول بالمفاتيح فقط
- عطّل `root login`
- غيّر منفذ SSH فقط إذا كنت تدير ذلك فعليًا وتعرف أثره

ملف مثال:
- [`ops/ssh/sshd_config.hardening.example`](/c:/Fitzone/ops/ssh/sshd_config.hardening.example)

بعد التعديل:

```bash
sudo sshd -t
sudo systemctl restart ssh
```

لا تعيد تشغيل SSH قبل التأكد أن جلسة SSH ثانية تعمل بالفعل.

## 3. الجدار الناري

فعّل `UFW` وافتح أقل عدد منافذ ممكن:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

إذا كنت تستخدم منفذ SSH مختلفًا، افتحه بدل `22`.

## 4. Nginx

استخدم Nginx أمام التطبيق، ولا تعرض `Next.js` مباشرة على الإنترنت.

ملف مثال:
- [`ops/nginx/fitzone.conf`](/c:/Fitzone/ops/nginx/fitzone.conf)

النقاط التي يغطيها:
- إعادة توجيه `HTTP -> HTTPS`
- `proxy_pass` إلى `127.0.0.1:3000`
- حدود طلبات على `/api/`
- حدود اتصال عامة
- تعطيل إظهار إصدار Nginx
- رؤوس أمان إضافية

بعد نسخ الملف:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 5. fail2ban

ركّب `fail2ban` لحظر محاولات brute force والطلبات الشاذة:

```bash
sudo apt install fail2ban -y
```

ملف مثال:
- [`ops/fail2ban/jail.local.example`](/c:/Fitzone/ops/fail2ban/jail.local.example)

بعد التفعيل:

```bash
sudo systemctl enable fail2ban
sudo systemctl restart fail2ban
sudo fail2ban-client status
```

## 6. PM2

- شغّل التطبيق بمستخدم غير root
- فعّل الاستعادة التلقائية:

```bash
pm2 save
pm2 startup
```

- راقب الاستهلاك واللوجات:

```bash
pm2 status
pm2 logs fitzone --lines 100
```

## 7. قاعدة البيانات

- استخدم مستخدم قاعدة بيانات خاصًا بالتطبيق فقط
- لا تمنح صلاحيات `SUPER` أو صلاحيات إدارية غير لازمة
- اجعل الوصول إلى قاعدة البيانات من `localhost` أو من IP محدد فقط
- خذ نسخًا احتياطية يومية

## 8. البيئة والأسرار

- لا تترك `SETUP_TOKEN` مفعّلًا بعد تجهيز أول أدمن
- استخدم `AUTH_SECRET` طويل وعشوائي
- راقب أي مفاتيح قديمة ودوّرها إذا لزم
- لا تحتفظ بالأسرار داخل المستودع

## 9. المراقبة

افحص دوريًا:

```bash
sudo journalctl -u nginx --since "24 hours ago"
sudo journalctl -u fail2ban --since "24 hours ago"
pm2 logs fitzone --lines 200
```

## 10. طبقة حماية خارجية

إذا أردت رفع الثقة وتقليل الهجمات العشوائية:
- استخدم `Cloudflare`
- فعّل `WAF`
- فعّل `Bot Fight Mode`
- راقب `DNS`, `SPF`, `DKIM`, `DMARC`

## ملاحظات مهمة

- لا تنسخ ملفات الأمثلة كما هي بدون مراجعة الدومين والمنفذ والمسارات
- لا تطبق `SSH hardening` أو `UFW` على سيرفر إنتاج بدون جلسة احتياطية مفتوحة
- بعد كل خطوة، اختبر الموقع ثم انتقل للخطوة التالية
