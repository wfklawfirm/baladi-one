# مصفوفة مسارات الشراء العام (State Machine) — حسب الطريقة

> **الحالة:** الترحيل `0044_procurement_workflow.sql` **مسودة غير مطبَّقة على الإنتاج** (تحقق SELECT على المشروع `sdpemqqozovxmoaerspq` بتاريخ 2026-11-27: لا وجود لجدول `procurement_workflow` ولا `procurement_file_state`).
> **المصدر الوحيد لهذه الوثيقة:** `supabase/migrations/0044_procurement_workflow.sql` و`lib/procurementWorkflow.ts` و`docs/PROCUREMENT_IMPLEMENTATION_REPORT.md`.
> **التصنيف:** كل المراحل `pending_review`. لا شيء هنا مصنَّف «Legally Verified & Approved». التسلسل **بنيوي/إجرائي مقترح** وليس نصًا قانونيًا؛ مطابقته للقانون: غير متحقق منه / يتطلب مراجعة قانونية.

## 1) البنية العامة

| العنصر | القيمة (من 0044) |
|---|---|
| الطرق السبع (`method`) | `open_tender` مناقصة عامة · `two_stage` مناقصة على مرحلتين · `quotations` استدراج عروض أسعار · `proposals` طلب عروض (استشارات) · `negotiated` اتفاق رضائي · `invoice` شراء بالفاتورة · `framework` اتفاقية إطارية |
| مراحل البداية المشتركة (1–5) | `need` تحديد الحاجة · `estimate` التقدير · `funding_check` التحقق من التمويل · `method_decision` قرار أسلوب الشراء · `documents_prepared` إعداد المستندات |
| مراحل النهاية المشتركة (آخر 6) | `award_decision` قرار الترسية/الاختيار · `contract` العقد · `execution` التنفيذ · `acceptance` الاستلام · `payment` الدفع · `closing` الإقفال |
| `review_status` لكل طريقة ولكل مرحلة | `pending_review` (القيم الممكنة: `pending_review` / `verified` / `rejected` / `superseded`) |
| `legal_source_id` / `provision_id` | NULL في كل الصفوف (لا ربط بمصدر أو مادة) |
| `required` | `true` لكل المراحل عدا `invoice_review` (`false`، شرطها: «عند الحاجة وفق تقدير المصلحة المختصة») |

كل المراحل المشتركة `required=1` بلا شرط. الأعمدة `who_ar/why_ar/document_ar` نصوص إجرائية لسؤال «ما الإجراء التالي؟».

## 2) المراحل المزروعة لكل طريقة (بالترتيب `ord`)

المراحل 1–5 = البداية المشتركة، ثم المراحل الوسطى الخاصة بالطريقة، ثم النهاية المشتركة الست. الجدول يعرض الوسطى فقط مع ترتيبها الفعلي.

| الطريقة | عدد المراحل | المراحل الوسطى (ord: key — label — required) |
|---|---|---|
| `open_tender` | 15 | 6 `tender_notice` إعلان المناقصة — نعم · 7 `bids_receipt` استلام العروض — نعم · 8 `bids_opening` فتح العروض — نعم · 9 `evaluation` تقييم العروض — نعم |
| `two_stage` | 17 | 6 `stage_one_notice` إعلان المرحلة الأولى · 7 `stage_one_receipt` استلام العروض الفنية · 8 `stage_one_review` مراجعة العروض الفنية · 9 `stage_two_invitation` دعوة المرحلة الثانية · 10 `stage_two_receipt` استلام العروض المالية · 11 `evaluation` تقييم العروض — كلها نعم |
| `quotations` | 14 | 6 `quotation_request` طلب عروض الأسعار · 7 `quotation_receipt` استلام العروض · 8 `quotation_comparison` مقارنة العروض — كلها نعم |
| `proposals` | 14 | 6 `proposals_request` طلب العروض · 7 `proposals_receipt` استلام العروض · 8 `proposals_evaluation` تقييم العروض — كلها نعم |
| `negotiated` | 14 | 6 `supplier_invitation` دعوة الطرف المتعاقد · 7 `negotiation` التفاوض · 8 `negotiation_record` توثيق نتيجة التفاوض — كلها نعم |
| `invoice` | 13 | 6 `invoice_obtained` الحصول على الفاتورة/العرض — نعم · 7 `invoice_review` مراجعة الفاتورة — **لا (شرطية)** |
| `framework` | 13 | 6 `framework_setup` إعداد الاتفاقية الإطارية · 7 `call_off` طلب التنفيذ ضمن الاتفاقية — نعم |

بعد المرحلة الوسطى الأخيرة تأتي (بالترتيب): `award_decision` → `contract` → `execution` → `acceptance` → `payment` → `closing` (المرحلة النهائية الوحيدة في كل طريقة).

> ملاحظة: عدد المراحل أعلاه محسوب من منطق الزرع (5 + وسطى + 6)؛ لم يُتحقق منه من بيانات مطبَّقة لأن الترحيل غير مطبَّق.

## 3) الانتقالات المسموحة (`procurement_workflow_transition`)

| النوع | القاعدة كما زُرعت | الـ guard |
|---|---|---|
| `forward` | من كل مرحلة إلى التي تليها مباشرة (`ord+1`) | `current_complete` |
| `forward` (تجاوز) | من المرحلة `a` إلى `ord+2` فقط إذا كانت المرحلة `ord+1` غير إلزامية (`required=false`). فعليًا: طريقة `invoice` فقط، من `invoice_obtained` إلى `award_decision` | `current_complete` (يُشترط إكمال المرحلة **الحالية** `a`، لا المتجاوَزة) |
| `return` | من كل مرحلة إلى السابقة لها مباشرة (خطوة واحدة) | `reason_required` |
| إنهاء | `procurement_file_finish`: متاح فقط من مرحلة لا انتقال `forward` يخرج منها (`closing`) | يتطلب فحصًا مكتملًا/غير منطبقًا للمرحلة |
| إلغاء | `procurement_file_cancel`: من أي حالة `active`، السبب مطلوب | — |
| إعادة تشغيل | `procurement_file_restart`: فقط من `cancelled`، السبب مطلوب؛ `cycle+1`، العودة لأول مرحلة، يُحفظ السجل وفحوص الدورة القديمة | — |
| بدء | `procurement_file_start(item, method?)`: الطريقة من المعامل أو `planned_method` لبند الخطة؛ مرة واحدة لكل بند؛ أول مرحلة `need` | — |

أي انتقال غير مسجَّل في الجدول يُرفض بالخطأ `transition_not_allowed`. حالات الملف: `active` / `cancelled` / `completed`. الكتابة حصرًا عبر RPC من نوع SECURITY DEFINER تستخدم `_council_muni()` (بلدية المستخدم) وتسجّل في `procurement_file_history` (إلحاق فقط) وفي `audit_event`. لا سياسات insert/update/delete للموظفين على الجداول.

## 4) قواعد الإثبات (Evidence)

| القاعدة | التنفيذ |
|---|---|
| الحالة `complete` تتطلب `evidence_ref` غير فارغ | قيد CHECK في الجدول + RPC (`evidence_required`) + `validateCheck`/`checkSatisfied` في TS |
| الحالة `not_applicable` تتطلب `note` تعليلًا | قيد CHECK + RPC |
| `not_applicable` مرفوضة لمرحلة `required=true` بلا `conditional_on` | RPC (`not_applicable_refused`)؛ عمليًا مسموحة فقط لـ `invoice_review` |
| الانتقال `forward` بحارس `current_complete` | يتطلب أن فحص المرحلة الحالية (للدورة الحالية) حالته `complete` أو `not_applicable` وإلا `stage_incomplete` |
| طبيعة الإثبات | **نص حر** (اسم مستند/رقم/رابط، حتى 1000 حرف). لا يتحقق النظام من وجود المستند أو من صحته أو من مطابقته لمتطلب قانوني |
| الدورات | الفحوص مفتاحها (`plan_item_id, cycle, stage_key`)؛ إعادة التشغيل تبدأ دورة جديدة |

## 5) حالات قائمة التحقق السبع وكيف تُشتق

الحالات: `complete`، `needs_completion`، `awaiting_approval`، `not_yet_due`، `overdue`، `not_applicable`، `needs_legal_review` (تسمياتها: مكتمل، يحتاج إلى استكمال، ينتظر موافقة، لم يستحق بعد، متأخر، غير منطبق، يحتاج إلى مراجعة قانونية). الاشتقاق في `effectiveStatus`:

| الحالة | كيف تظهر |
|---|---|
| `complete` | مخزّنة يدويًا بإثبات. إن خُزّنت بلا إثبات تُعرض `needs_completion` (حماية دفاعية) |
| `needs_completion` | مخزّنة يدويًا؛ أو **افتراضية** لمرحلة بلا فحص عندما `ord` المرحلة ≤ مرحلة الملف الحالية؛ أو بدل `complete`/`not_applicable` ناقصة الإثبات/الملاحظة |
| `awaiting_approval` | مخزّنة يدويًا فقط؛ لا اشتقاق ولا جهة موافقة معرَّفة في النظام |
| `not_yet_due` | مخزّنة يدويًا؛ أو **افتراضية** لمرحلة بلا فحص عندما `ord` أكبر من مرحلة الملف الحالية |
| `overdue` | تُشتق فقط إذا كانت المخزّنة `needs_completion` أو `awaiting_approval` أو `not_yet_due` ولها `due_on` **أدخله الموظف** أقدم من تاريخ اليوم؛ أو تُخزَّن يدويًا. لا تُحسب أبدًا من مهلة قانونية |
| `not_applicable` | مخزّنة يدويًا بملاحظة (وبشرط المرحلة الشرطية)؛ بلا ملاحظة تُعرض `needs_completion` |
| `needs_legal_review` | مخزّنة يدويًا فقط. (مؤشر منفصل `needsLegalReview` في `buildChecklist` يظهر لكل مرحلة `review_status` فيها ليس `verified`، أي كل المراحل حاليًا) |

التقدم (`progress`) = عدد `complete` ÷ المراحل غير `not_applicable`؛ تعريف تشغيلي لا قانوني.

## 6) ما لم يُشفَّر عمدًا (لا يُستنتج ولا يُحسب)

| البند | الوضع |
|---|---|
| مهل الإعلان، مهلة فتح العروض، فترة التجميد (Standstill)، مهل الاعتراض | غير مشفَّرة؛ `due_on` يدخلها الموظف. القيمة القانونية: غير متحقق منه / يتطلب مراجعة قانونية |
| السقوف المالية وحدود كل طريقة، وأي ربط بين القيمة والطريقة الواجبة | غير مشفَّرة (جدول السقوف فارغ؛ المرسوم 14063 والقانون 21/2025 «Blocked by Missing Evidence» حسب تقرير التنفيذ) |
| الحد الأدنى لعدد العروض/العارضين، نصاب اللجان | غير مشفَّرة |
| أرقام المواد والمراجع القانونية (`legal_source_id`, `provision_id`) | NULL |
| صلاحية الجهة المخوّلة بكل مرحلة، والتصديق/الرقابة المسبقة (ديوان المحاسبة وغيره) | غير مشفَّرة؛ `who_ar` نص إرشادي |
| تقويم العطل والأيام العاملة | غير مشفَّر (جدول العطل فارغ) |
| تحقق من أن الطريقة المختارة مطابقة للقيمة أو للمسموح قانونًا | لا يوجد |
| تحقق من وجود/صحة مستند الإثبات | لا يوجد (نص حر) |
| أثر الاعتراض على المسار | غير مربوط بالمسار (الاعتراضات سجل مستقل 0043 مسودة) |
| تفريعات لا يعرّفها المسار (مثل مناقصة غير مثمرة وإعادة إعلان، تمديد، شروط الاتفاق الرضائي، سحب العروض) | لا انتقالات لها؛ المتاح فقط إلغاء/إعادة تشغيل بدورة جديدة |
| مصفوفة صلاحيات تفصيلية (وحدة الشراء/اللجان/المدقق) | غير منفَّذة؛ الحالي رئيس/مسؤول |
| دقة تسلسل المراحل ومسمياتها لكل طريقة | مقترحة بنيويًا؛ الواجهة تعرض «تسلسل المراحل مقترح بانتظار المراجعة القانونية» (`WF_PENDING_NOTE`) |

## 7) ثغرات وملاحظات عن المسودة

1. الترحيل 0044 غير مطبَّق؛ لا بيانات مسار حية للتحقق منها.
2. الخطأ `evidence_required` يُفرض على `complete` فقط؛ لا يُفرض إثبات على حالات `awaiting_approval` وغيرها.
3. لا فحص في `procurement_file_advance` لمراحل سابقة (يكفي إكمال الحالية)، فيمكن أن تبقى مراحل سابقة غير مكتملة بعد العودة والتقدم.
4. `procurement_file_return` يرجع خطوة واحدة فقط ولا يلغي فحوص المراحل اللاحقة.
5. اسم مرحلة `evaluation` مشترك بين `open_tender` و`two_stage`؛ و`BID_STAGE_KEYS` في الواجهة بنيوي لتبويب العروض.
6. ملاحظة تعارض في الوثائق: تقرير التنفيذ يقول 0044 «Implemented — Draft, Not Applied; Pending Legal Review»؛ هذه الوثيقة متسقة معه.
