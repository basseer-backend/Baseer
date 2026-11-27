# سجل التغييرات (CHANGELOG)

## [1.1.0] - 2026-11-26

إصدار فرعي (Minor Version) يضيف نقطة نهاية تحويل الصوت إلى نص (Voice Transcription) وأربعة أكواد أخطاء قياسية جديدة.

### الميزات والتغييرات الرئيسية:

#### 1. نقطة نهاية جديدة (Endpoint):
- إضافة مسار تحويل الصوت إلى نص `POST /api/v1/voice/transcribe` عبر `multipart/form-data` لإرسال التسجيل الصوتي واسترجاع النص المستخرج (`transcript`)، واللغة، ومستوى الثقة (`confidence`).

#### 2. أكواد أخطاء جديدة (4 أكواد):
- `ERR_CONSENT_REQUIRED` (403): يلزم الموافقة على استخدام خدمات الذكاء الاصطناعي السحابية لاستخدام الأوامر الصوتية (`owner: backend`).
- `ERR_UNSUPPORTED_AUDIO_FORMAT` (422): صيغة الملف الصوتي غير مدعومة، يرجى تسجيل الأمر مرة أخرى (`owner: backend, ai`).
- `ERR_AUDIO_TOO_LARGE` (413): حجم التسجيل الصوتي كبير جداً، يرجى تسجيل أمر أقصر (`owner: backend, ai`).
- `ERR_NO_SPEECH_DETECTED` (422): لم أسمع أي كلام واضح، يرجى المحاولة مرة أخرى بصوت أوضح (`owner: ai`).

#### 3. النماذج الجاهزة (Fixtures):
- إنشاء 4 نماذج لاختبارات الأخطاء (`fixtures/error/`) للأكواد الجديدة.
- إنشاء نموذج لاختبار النجاح `fixtures/success/voice_transcribe.json` بالهيكل القياسي للـ Envelope.

## [1.0.0] - 2026-11-21

الإصدار الأولي المستقر لعقود واجهة برمجة التطبيقات (API Contracts) الخاصة بنظام **بصير (Baseer)**.

### الميزات والتغييرات الرئيسية:

#### 1. أكواد الأخطاء الموحدة (Error Codes):
- توحيد والتحقق من 20 كود خطأ قياسي لكافة خدمات النظام (Backend و AI) وفق بنية الـ Envelope الموحدة:
  - `ERR_INTERNAL_SERVER_ERROR` (500)
  - `ERR_VALIDATION_FAILED` (400)
  - `ERR_BAD_REQUEST` (400)
  - `ERR_UNAUTHORIZED` (401)
  - `ERR_FORBIDDEN` (403)
  - `ERR_NOT_FOUND` (404)
  - `ERR_FILE_TOO_LARGE` (413)
  - `ERR_TOO_MANY_REQUESTS` (429)
  - `ERR_SERVICE_UNAVAILABLE` (503)
  - `ERR_REQUEST_TIMEOUT` (504 - جديد)
  - `ERR_IMAGE_BLURRY` (422)
  - `ERR_IMAGE_TOO_DARK` (422)
  - `ERR_NO_TEXT_DETECTED` (422)
  - `ERR_UNSUPPORTED_IMAGE_FORMAT` (422)
  - `ERR_INTENT_NOT_RECOGNIZED` (422)
  - `ERR_LOW_CONFIDENCE` (422 - جديد)
  - `ERR_QR_NOT_FOUND` (404)
  - `ERR_INVALID_QR_CODE` (400)
  - `ERR_DESTINATION_NOT_FOUND` (404)
  - `ERR_ROUTE_CALCULATION_FAILED` (422)
- إضافة كودين جديدين:
  - `ERR_LOW_CONFIDENCE`: في حال تعذر تأكيد النتيجة بدرجة ثقة كافية مع توجيه المستخدم للمحاولة بشكل أوضح.
  - `ERR_REQUEST_TIMEOUT`: في حال استغراق المعالجة وقتاً أطول من المعتاد.
- توثيق البيانات الوصفية الكاملة في `error-codes.json` بما يشمل: الجهة المسؤولة (`owner: backend | ai`)، استراتيجية إعادة المحاولة (`retry: same_request | new_capture | login | none`)، مفتاح الرسالة (`messageKey`)، والرسالة البديلة بالإنجليزية (`fallbackMessage`).
- توفير ملف الترجمة العربية المعتمد `messages.ar.json` لكافة أكواد الأخطاء الـ 20.

#### 2. توحيد الـ Enums المشتركة:
- تجميع كافة التعدادات المشتركة داخل `src/common/enums/` بملف منفصل لكل enum وتصدير موحد عبر `index.ts`:
  - `FacialExpression`: (`HAPPY`, `NEUTRAL`, `SAD`, `SURPRISED`, `ANGRY`)
  - `VoiceIntent`: (`READ_DOCUMENT`, `RECOGNIZE_CURRENCY`, `INDOOR_NAVIGATION`, `DESCRIBE_SCENE`, `DETECT_COLOR`, `READ_TRAFFIC_SIGN`, `DETECT_OBSTACLE`, `DETECT_EXPRESSION`)
  - `MobileAction`: (`OPEN_CAMERA_OCR`, `OPEN_CAMERA_CURRENCY`, `OPEN_CAMERA_QR`, `OPEN_CAMERA_DESCRIBE`, `OPEN_CAMERA_COLOR`, `OPEN_CAMERA_TRAFFIC_SIGN`, `OPEN_CAMERA_OBSTACLE`, `OPEN_CAMERA_EXPRESSION`)
  - `HapticPattern`: (`NONE`, `LIGHT_VIBRATION`, `STRONG_VIBRATION`)
- تصدير التعدادات تلقائياً في ملف `enums.json`.

#### 3. تحويل تعابير الوجه إلى FacialExpression Enum:
- تحديث `FaceExpressionResultDto` ليصبح حقل `expression` معتمداً على التعداد القياسي `FacialExpression` مع قيمة افتراضية `FacialExpression.HAPPY`.
- استبدال النص القديم (`'Smiling / Happy'`) في نتائج خدمة الرؤية الحاسوبية (`VisionController`) بالقيمة الموحدة `FacialExpression.HAPPY` مع الحفاظ على النص العربي الطبيعي في `spokenDescription`.

#### 4. النماذج الجاهزة (Fixtures):
- إنشاء 20 نموذجاً لاختبارات الأخطاء (`fixtures/error/*.json`) تمثل استجابة الخادم الفعلية لكل كود خطأ.
- إنشاء 10 نماذج لاختبارات النجاح (`fixtures/success/*.json`) لكافة مسارات الـ Vision و OCR والـ Voice والـ Navigation مبنية مباشرة على المخرجات الفعلية للمتحكمات (Controllers).
