# عقود واجهة برمجة التطبيقات (API Contracts) - Baseer

يحتوي هذا المجلد على العقود الرسمية المشتركة (Contracts) والإعدادات الموحدة بين فرق التطوير (Backend, AI, Mobile) لتطبيق **بصير (Baseer)**. تم تصميم هذا المجلد ليتطابق في البنية والتسميات مع مجلد `contracts` لدى فريق الـ AI لضمان التوافق والتكامل السلس.

---

## محتويات المجلد

- **`contract-version.txt`**: رقم الإصدار الحالي للعقود (`1.0.0`).
- **`enums.json`**: التعدادات المشتركة المعتمدة عبر النظام (`VoiceIntent`, `MobileAction`, `FacialExpression`, `HapticPattern`).
- **`error-codes.json`**: قائمة الـ 20 كود خطأ القياسية مع تفاصيل الـ HTTP status، والجهة المسؤولة (`owner`)، واستراتيجية إعادة المحاولة (`retry`)، ومفاتيح الرسائل والرسائل البديلة.
- **`messages.ar.json`**: نصوص الرسائل الرسمية باللغة العربية المعتمدة للمستخدم لكل كود خطأ. *(إضافة خاصة بالباك إند)*
- **`fixtures/error/`**: ملفات JSON تمثل الاستجابة الفعلية للخادم (Envelope كامل) عند حدوث كل خطأ من الـ 20 كود خطأ.
- **`fixtures/success/`**: ملفات JSON تمثل الاستجابة الفعلية الناجحة (Envelope كامل) لكل خدمة:
  - خدمات الرؤية و OCR والصوت: `color_detection.json`, `currency_recognition.json`, `face_expression.json`, `obstacle_detection.json`, `ocr.json`, `scene_description.json`, `traffic_sign_recognition.json`, `voice_command.json`.
  - خدمات الملاحة الداخلية: `navigation_destinations.json`, `navigation_route.json`. *(إضافة خاصة بالباك إند)*
- **`CHANGELOG.md`**: سجل التغييرات والإصدارات للعقود.

> **ملاحظة حول الـ Envelope:**
> كافة نماذج الـ Fixtures (أخطاء ونجاح) تم توليدها بالهيكل الفعلي لاستجابة الـ API (`success`, `statusCode`, `data`/`details`, `timestamp`) لتمكين فريقي الـ Mobile والـ AI من استخدامها كـ Mocks واختبارات تكامل مطابقة للواقع.

---

## المرجع الكامل للعقد (OpenAPI)

الملف [openapi.json](../openapi.json) الموجود في جذر مستودع الباك إند عند نفس الـ Tag يمثل مواصفات الـ OpenAPI (Swagger) الكاملة لكافة الـ Endpoints والـ Schemas.

---

## كيفية سحب العقود واستخدامها (عبر الـ Tag contracts-v1.0.0)

يمكن لفرق التطوير الوصول للملفات والعقود المعتمدة مباشرة عبر الرابط الثابت للإصدار المنشور:

1. **تصفح مجلد العقود كاملاً على GitHub:**
   [https://github.com/basseer-backend/Baseer/tree/contracts-v1.0.0/contracts](https://github.com/basseer-backend/Baseer/tree/contracts-v1.0.0/contracts)

2. **تحميل ملف فردي مباشر (Raw URL - مثال: `error-codes.json`):**
   [https://raw.githubusercontent.com/basseer-backend/Baseer/contracts-v1.0.0/contracts/error-codes.json](https://raw.githubusercontent.com/basseer-backend/Baseer/contracts-v1.0.0/contracts/error-codes.json)

3. **تحميل أرشيف ZIP للمستودع كاملاً عند الـ Tag:**
   [https://github.com/basseer-backend/Baseer/archive/refs/tags/contracts-v1.0.0.zip](https://github.com/basseer-backend/Baseer/archive/refs/tags/contracts-v1.0.0.zip)

---

## سياسة الإصدارات (Versioning Policy)

يتبع نظام العقود نظام الترقيم الدلالي (Semantic Versioning `MAJOR.MINOR.PATCH`) وفق القواعد التالية:

- **PATCH (`1.0.x`)**: لتعديل نصوص الرسائل، أو تصحيح الأخطاء المطبعية، أو تحديث ملفات الـ Fixtures دون أي تغيير في بنية أو مسميات الحقول.
- **MINOR (`1.x.0`)**: عند إضافة كود خطأ جديد، أو إضافة قيمة جديدة لأحد الـ Enums، أو إضافة endpoint دون كسر التوافق العكسي (Backward Compatible).
- **MAJOR (`x.0.0`)**: عند حذف كود خطأ، أو حذف/تعديل معنى حقل قائم، أو تغيير بنية الـ Envelope بما يكسر التوافق مع الإصدارات السابقة (Breaking Change).

### القواعد الإلزامية:
1. **المصدر الوحيد للحقيقة (Single Source of Truth):** مستودع الباك إند هو المرجع المعتمد لتوليد ونشر العقود.
2. **عدم تعديل الـ Tags المنشورة (Immutability):** أي Tag يتم نشره (مثل `contracts-v1.0.0`) يُعتبر نهائياً وغير قابل للتعديل أبداً؛ أي تعديل يتطلب إصدار Tag جديد برقم أعلى.
3. **التوليد الآلي:** يتم توليد ملفات العقود برمجياً عبر سكربت `npm run contracts:build`، ويُمنع تعديل ملفات JSON المولدة يدوياً.
