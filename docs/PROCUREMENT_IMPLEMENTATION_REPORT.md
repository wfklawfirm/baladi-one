# تقرير تنفيذ الشراء العام — حالة 2026-11-26

التصنيف المعتمد: Implemented & Tested · Legally Verified & Approved · Implemented — Pending Legal Review · Partially Implemented · Blocked by Missing Evidence · Not Implemented.
نجاح الاختبار البرمجي لا يعني اعتماد المطابقة القانونية؛ لا وظيفة هنا مصنَّفة «Legally Verified & Approved».

| الوظيفة | الموقع | التصنيف | ملاحظات |
|---|---|---|---|
| صفحة «إدارة الشراء العام» بأربعة أقسام | `/staff/procurement` | Implemented & Tested (عرض محلي) | للرئيس والمسؤول فقط |
| معالج «شراء جديد» (4 خطوات، حفظ تلقائي بالمتصفح) | `/staff/procurement/new` | Partially Implemented | ينشئ بند خطة فقط؛ لا مسار قانوني نهائي لغياب سقوف متحقَّقة |
| سجل المصادر القانونية (17 مصدرًا) وأحكام المواد | جداول 0040/0041 | Implemented — Pending Legal Review | بيانات وصفية فقط؛ لا نص مواد محمَّل |
| فصل أنواع السقوف الأربعة | `procurement_threshold.threshold_kind` | Implemented — Pending Legal Review | الجدول فارغ |
| تحميل السقوف (المرسوم 14063 والقانون 21/2025) | — | Blocked by Missing Evidence | ملف المرسوم على موقع الهيئة يحوي ترويسة الجريدة فقط |
| خطة الشراء السنوية، موصي الطريقة، كشف التجزئة | 0024 / `/staff/projects/procurement` | Implemented — Pending Legal Review | الموصي يعيد «لا بيانات» دون سقوف |
| الموردون | `/staff/procurement/suppliers` | Implemented (لم يُختبر بالكتابة على الإنتاج) | |
| العروض المختومة ومقارنتها وتقييم المطابقة الفنية | `/staff/procurement/bids/[id]` · 0042 | Implemented (لم يُختبر ختم RLS عمليًا) | سجل الاطلاع بعد الفتح غير مبني |
| لجان التلزيم والاستلام وتصاريح تعارض المصالح | 0024 · `CommitteeSection` | Partially Implemented | مرتبطة بالعقد؛ غير مربوطة بصفحة العروض |
| سجل النشر الرسمي | 0024 | Implemented — Pending Legal Review | الحفظ داخل التطبيق ليس نشرًا |
| فترة التجميد (10 أيام عمل) والعطل | 0020 | Blocked by Missing Evidence | جدول العطل فارغ؛ القاعدة بانتظار المراجعة |
| الاعتراضات (سجل مستقل) | — | Not Implemented | |
| مسارات مستقلة لكل طريقة (State Machine) | — | Not Implemented | الملف الحالي 16 مرحلة خطية |
| مصنع المستندات والنماذج الرسمية وتصدير Word/PDF/Excel | — | Not Implemented | |
| ربط الشراء بمولّد القرارات | — | Partially Implemented | ربط عقد↔قرار فقط |
| ملحقات العقد والقيمة التراكمية | — | Partially Implemented | |
| الربط المالي الكامل لدورة النفقة بالشراء | 0021 | Partially Implemented | |
| الملف الرقابي الكامل (Audit Pack) | — | Not Implemented | |
| لوحة الشراء التنفيذية | — | Not Implemented | |
| مساعد الشراء السياقي والتعلم الموجّه | — | Not Implemented | |
| مصفوفة صلاحيات الشراء التفصيلية (وحدة الشراء/اللجان/المدقق) | — | Not Implemented | الحالي: رئيس/مسؤول فقط |

## الاختبارات
- 184 اختبارًا قائمًا ناجحة (vitest) وفحص الأنواع ناجح.
- فُحصت الصفحات الجديدة بعرض محلي عبر وكيل يمنع الكتابة؛ لم تُنفَّذ اختبارات كتابية على الإنتاج.
- لم تُنجَز: اختبارات أمنية (عزل البلديات، الوصول المبكر للعروض)، واختبارات المستندات، وقياس الأداء.
