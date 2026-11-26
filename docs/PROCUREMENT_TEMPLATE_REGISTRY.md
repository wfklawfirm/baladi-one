# سجل قوالب مستندات الشراء العام

> **الحالة:** الترحيل `0045_procurement_documents.sql` **مسودة غير مطبَّق على الإنتاج** (تحقق SELECT 2026-11-27: لا وجود لجدول `procurement_document` ولا `procurement_plan_decision`).
> **المصادر:** `lib/procurementDocs/{generate,types,load,html,docx,xlsx}.ts` و`supabase/migrations/0045*` و`0031–0035` و`docs/DECISION_BUILDER.md` و`data/municipal_decision_templates.json`.
> كل مستند مولَّد **مسودة بعلامة مائية «مسودة — لم تُعتمد»** ولا يُعدّ معتمدًا. لا شيء هنا «Legally Verified & Approved». كل مضمون قانوني: غير متحقق منه / يتطلب مراجعة قانونية.

## 1) المبادئ المشتركة (من `generate.ts`)

- كل قيمة تأتي من سجل ممرَّر مع مصدره؛ لا اختراع. الحقل الإلزامي الناقص → **رفض** (`Refusal`) برسالة عربية، لا مستند جزئي.
- الحيثيات تُبنى من السجلات فقط وكل حيثية تحمل سجلها المصدر.
- لا سقف ولا مهلة ولا نسبة قانونية تُكتب في القوالب.
- الأسلوب المخطط يُعرض «كما في الخطة» مع تنبيه أن مطابقته للأسلوب الواجب «يتطلب تحققًا قانونيًا».
- كل تصدير يُسجَّل عبر RPC `procurement_document_record` (القالب، الإصدار، الصيغة، المصادر، الحقول المعبّأة، بصمة SHA-256 للمحتوى، المستخدم) مع `audit_event`. الجدول إلحاق فقط، يقرؤه رئيس/مسؤول.
- صلاحية التوليد: رئيس/مسؤول فقط (مسارات docx/xlsx تتحقق من `staff_member.role`). نسخة القوالب كلها `1`.
- التحميل (`load.ts`) عبر عميل المستخدم الخاضع لـ RLS: العروض المختومة لا تُحمَّل قبل حلول `bids_open_on` (`bidsOpened`).

## 2) الصيغ المتاحة

| الصيغة | التوفر |
|---|---|
| HTML / طباعة A4 (و PDF عبر طباعة المتصفح) | لكل المستندات السبعة؛ `renderHtml` مع علامة مائية وملحق «الحقول المعبّأة آليًا ومصادرها» |
| Word `.docx` | لكل المستندات السبعة (POST، RTL، رأس وتذييل بعلامة «مسودة») |
| Excel `.xlsx` | **`bid_comparison` فقط** (غيره: خطأ 400 «xlsx only for bid_comparison»)؛ ورقة «مقارنة العروض» وورقة «المصادر»؛ حماية من حقن الصيغ `safeCell` |
| لم يُجرَّب فعليًا | فتح ملفات Word ولا مراجعة الطباعة بصريًا (تقرير التنفيذ) |

## 3) المستندات السبعة

| المفتاح | العنوان | الحقول الإلزامية (رفض إن نقصت) | الحقول المعبّأة آليًا ومصدرها | حقول يدوية متروكة فارغة |
|---|---|---|---|---|
| `purchase_request` | طلب شراء | اسم البلدية، عنوان البند، وصف الحاجة، القيمة التقديرية، التمويل (بند موازنة أو `funding_note`)، المسؤول/الجهة الطالبة | البلدية: ترويسة `municipality` عبر `loadLetterhead`؛ العنوان والحاجة والقيمة والعملة والمسؤول والسنة المالية والأسلوب المخطط وتواريخ النشر/الترسية/البدء المخططة: `procurement_plan_item`؛ التمويل: `budget_line` (code + title_ar) أو `procurement_plan_item.funding_note` | — |
| `need_definition` | تحديد الحاجة | اسم البلدية، العنوان، وصف الحاجة، المسؤول | `municipality`، `procurement_plan_item` | المواصفات الفنية، الكميات، مكان التسليم/التنفيذ، مدة التنفيذ، مبرر الحاجة والمنفعة العامة |
| `estimate_sheet` | جدول التقدير (الكلفة التقديرية) | اسم البلدية، العنوان، **عملة التقدير**، القيمة التقديرية | `municipality`، `procurement_plan_item` | تفصيل البنود (6 أسطر)، أساس التقدير؛ المجموع يجب أن يطابق التقدير الإجمالي أو يُبرَّر |
| `bid_register` | سجل استلام العروض | موعد فتح العروض (`bids_open_on`) محدد، حلول موعد الفتح، عرض واحد على الأقل | `procurement_plan_item` (الموعد)، `procurement_bid` (تاريخ الاستلام، السعر، العملة، مدة التسليم، الضمان)، `procurement_supplier` (الاسم) | — |
| `bid_comparison` | جدول مقارنة العروض | كما `bid_register` | `procurement_bid` (السعر، العملة، مدة التسليم، الضمان، `technical_compliant`، `evaluation_note`)، `procurement_supplier`، `procurement_plan_item` (القيمة التقديرية والموعد) | — |
| `committee_minutes` | محضر لجنة التلزيم (مسودة) | لجنة من نوع `award` مرتبطة بالبند، `formed_on`، عضو واحد على الأقل، حلول موعد الفتح، عرض واحد على الأقل؛ وإن ارتبطت اللجنة بقرار تشكيل غير مقروء → رفض | `procurement_committee` (تاريخ التشكيل، `report_text`, `report_on`)، `procurement_committee_member` (الاسم، الصفة، `has_conflict`, `declaration_on`)، `municipal_decision` (رقم/سنة/عنوان/تاريخ قرار التشكيل)، `procurement_bid` | نتيجة اللجنة وتوصيتها إن لم يُسجَّل `report_text` («تُدوَّن بقرار اللجنة نفسها») |
| `bidder_notification` | كتاب إلى العارض (مسودة) | حلول موعد الفتح، تحديد العارض (`bid` معرَّف)، اسم العارض، تاريخ استلام العرض، قيمة العرض | `procurement_bid`، `procurement_supplier` (الاسم وجهة الاتصال)، `municipality`، التاريخ: اليوم بتوقيت بيروت | نتيجة اللجنة بشأن العرض؛ مهلة الاعتراض وفترة التجميد وسبل الطعن: «يتطلب تحققًا قانونيًا قبل إدراجها» |

### سلوكيات خاصة

| المستند | السلوك |
|---|---|
| `bid_comparison` | الترتيب بالسعر «للاستئناس فقط وليس ترجيحًا» عند عملة واحدة؛ عند عملات مختلفة لا ترتيب (ترتيب أبجدي). اختيار الفائز واعتماد التقييم من اختصاص اللجنة، لا النظام ولا الذكاء الاصطناعي |
| `committee_minutes` | إقرار تعارض مصالح مصرَّح يُعرض «يلزم التحقق من استبعاده»؛ غياب الإقرار يُعرض «لم يُصرَّح بعد»؛ لا يمنع التوليد |
| `bid_register` / `bid_comparison` / `committee_minutes` / `bidder_notification` | العروض المختومة قبل موعد الفتح لا تُحمَّل أصلًا |

## 4) شروط الرفض (ملخص)

| الشرط | المستندات |
|---|---|
| حقل إلزامي فارغ/غير متاح في السجل المصدر | جميعها |
| `bids_open_on` غير محدد أو لم يحل بعد | bid_register، bid_comparison، committee_minutes، bidder_notification |
| لا عروض مستلمة | bid_register، bid_comparison، committee_minutes |
| لا لجنة تلزيم (`kind='award'`) أو بلا تاريخ تشكيل أو بلا أعضاء | committee_minutes |
| قرار تشكيل مرتبط لكن غير مقروء | committee_minutes |
| العارض غير محدد | bidder_notification |
| عملة التقدير فارغة | estimate_sheet |
| صيغة xlsx لغير `bid_comparison` | كل ما عداه |
| مستخدم غير رئيس/مسؤول | مسارات docx/xlsx (403) |

الرسالة: «لا يمكن إنشاء «…»: حقول إلزامية ناقصة أو غير متاحة: …».

## 5) التعامل مع المراجع القانونية

| الجانب | التنفيذ |
|---|---|
| مصدر المراجع | `procurement_provision` (حالة `verified` ومصدرها `verified`) و`legal_rule` (قاعدتان فقط: `PPL-244-STANDSTILL` و`PPL-244-OBJ`، حالة `verified`) |
| إن لم يوجد مرجع متحقق | السطر: «يتطلب تحققًا قانونيًا» لكل موضوع |
| المواضيع لكل مستند | purchase_request/need_definition: التخطيط (`planning`) · estimate_sheet: التقدير (`estimation`) · bid_register: العروض (`bids`) · bid_comparison: التقييم (`evaluation`) والترسية (`award`) · committee_minutes: اللجان (`committees`) وتعارض المصالح (`conflict_of_interest`) والتقييم · bidder_notification: الاعتراضات (`objections`) وفترة التجميد (`standstill`) + القاعدتان أعلاه |
| الوضع الراهن | كل `legal_rule` (33 قاعدة) `pending_review` وبنود الأحكام بلا نص مواد محمَّل (تقرير التنفيذ، `PROCUREMENT_PENDING_LEGAL_REVIEW.md`)؛ لذا **المتوقع أن تظهر «يتطلب تحققًا قانونيًا» في كل المستندات** (لم يُتحقق من محتوى الإنتاج للأحكام) |

## 6) قوالب مولّد القرارات في مجال `procurement`

- المجال يُشتق من بادئة المعرّف `PROC` (`lib/decisions/model.ts: suggestClassification`)، والقالب يحمل `status: draft_pending_legal_review` و`production_enabled:false` و`risk:high` و`issuer_candidate: resolve_competent_authority`؛ ملف البذرة `draft_seed_not_approved_for_production` (as_of 2026-11-25، 80 قالبًا، منها 11 في «الشراء العام والعقود»).
- الربط من الشراء: RPC `procurement_plan_create_decision` (0045) تستدعي `decision_builder_create` الموجودة، وترفض بـ`no_matching_template` إن لم يكن القالب في مجال `procurement`، وتربط المسودة بالبند في `procurement_plan_decision`.

| المعرّف | العنوان | الحقول الإضافية الإلزامية للإنهاء (فوق الحقول العامة*) | مراجع مرشَّحة (source_id) |
|---|---|---|---|
| PROC01 | اعتماد خطة الشراء السنوية | `fiscal_year` | PPA، PPA_MEMO، PPA_LAW |
| PROC02 | إقرار دفتر شروط خاص | `procurement_ref`، `purpose` | MUN، PPA، PPA_LAW |
| PROC03 | إطلاق مناقصة عمومية | `procurement_ref`، `purpose` | PPA، MUN، PPA_LAW |
| PROC04 | اعتماد طلب عروض أسعار | `procurement_ref`، `purpose`، `applicable_rule` | PPA، PPA_LAW |
| PROC05 | اعتماد اتفاق رضائي | `justification_ref`، `purpose`، `applicable_rule` | PPA، PPA_MEMO، PPA_LAW |
| PROC06 | تأليف لجنة تلزيم | `procurement_ref`، `committee_members` | PPA_COM، PPA_MEMO، PPA_LAW |
| PROC07 | تأليف لجنة استلام | `contract_ref`، `committee_members` | PPA_COM، PPA_MEMO، PPA_LAW |
| PROC08 | قبول العرض الفائز وتحديد فترة التجميد | `evaluation_ref`، `procurement_ref`، `supplier`، `amount`، `currency` | PPA، PPA_LAW |
| PROC09 | إلغاء عملية شراء | `justification_ref`، `procurement_ref`، `reason` | PPA، PPA_MEMO، PPA_LAW |
| PROC10 | الموافقة على ملحق تعديل عقد | `contract_ref`، `justification_ref`، `scope`، `amount`، `currency` | PPA، PPA_LAW |
| PROC11 | اتخاذ إجراء بشأن نواقص الاستلام | `acceptance_ref`، `remedy`، `contract_ref` | PPA، PPA_LAW |

\* الحقول العامة الإلزامية للإنهاء في الكل: `municipality, district, governorate, decision_number, decision_date, issuer_name, verified_legal_recitals, effective_clause, notification_clause, verified_competent_authority`. المراجع «مرشَّحات تتطلب مراجعة انطباق حالي» (`candidate_requires_current_applicability_review`) لا مراجع متحقق منها؛ أرقام المواد في الملف لم تُنقل هنا لأنها غير متحقق منها.

**تحذير تعارض حالة:** تحقق SELECT على الإنتاج أظهر **11 نسخة قالب في المجال `procurement`، كلها بحالة `approved`**، بينما `DECISION_BUILDER.md` يقول إن أي قالب لم يُعتمد وإن الاعتماد الجماعي متاح عبر `dt_review_bulk` (0035). هذا الاعتماد داخلي في النظام ولا يعني تحققًا قانونيًا: غير متحقق منه / يتطلب مراجعة قانونية. ويُنصح بتوضيح من اعتمدها ومتى.

## 7) قائمة النماذج الرسمية الناقصة (لا نموذج رسمي مرفوع في المستودع)

لم أجد في الملفات المقروءة أي نموذج رسمي معتمد من هيئة الشراء العام؛ القوالب أعلاه داخلية. الناقص (غير مولَّد حاليًا) وكلها يتطلب تحديد النموذج الرسمي أولًا: غير متحقق منه / يتطلب مراجعة قانونية:

| المستند الناقص | ملاحظة |
|---|---|
| دفتر الشروط الخاص/العام (تُنتج منه فقط مسودة قرار PROC02) | لا قالب مستند |
| إعلان المناقصة / طلب عروض الأسعار / طلب العروض (استشارات) / دعوة اتفاق رضائي | لا قالب؛ المسار يذكر «نسخة الإعلان» كإثبات فقط |
| محضر فتح العروض | لا قالب (`bid_register` سجل استلام وليس محضر فتح) |
| تقرير تقييم العروض / محضر الاستلام الفني والمالي | لا قالب |
| قرار الترسية وكتاب إبلاغ الفائز | لا قالب مستند (PROC08 قرار فقط)؛ كتاب العارض الحالي لا يتضمن النتيجة |
| العقد والملاحق وكفالة حسن التنفيذ | لا قالب؛ الملحق PROC10 قرار فقط |
| محضر الاستلام المؤقت/النهائي | لا قالب (PROC07/PROC11 قراران) |
| تصريح تعارض المصالح كنموذج مستقل | يُسجَّل في بيانات الأعضاء فقط |
| نموذج الاعتراض وقرار البت فيه | سجل الاعتراضات 0043 (مسودة) بلا مستند |
| قالب الاتفاقية الإطارية وطلب التنفيذ ضمنها | لا قالب |
| مستندات الصرف وأوامر الدفع | خارج المصنع |
| مدة/نصوص الإعلان الرسمي والنشر | سجل النشر الرسمي فقط؛ لا نموذج |

## 8) ثغرات أخرى

1. 0045 غير مطبَّق؛ الربط مع المولّد لم يُجرَّب مع المخطط الحقيقي (تقرير التنفيذ).
2. مفاتيح القوالب السبعة مقيَّدة بقيد CHECK في قاعدة البيانات؛ إضافة قالب جديد تتطلب ترحيلًا جديدًا.
3. صلاحية التوليد رئيس/مسؤول فقط؛ لا صلاحية لوحدة الشراء أو اللجان.
4. المستندات لا تُحفَظ نسخة مخزَّنة؛ يُسجَّل فقط وصف التوليد والبصمة.
5. تقييم العروض الحر (`evaluation_note`) يدخل جدول المقارنة كما هو ويُراجَع قبل المشاركة.
