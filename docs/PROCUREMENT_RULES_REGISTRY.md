# سجل قواعد الشراء العام (`legal_rule`)

التاريخ: 2026-11-27 · المصدر: ترحيلات `0020` و`0024` و`0023` + تحقق SELECT من الإنتاج (قيم `review_status` و`original_text_loaded` و`version` مطابقة للمذكور).

> **كل القواعد أدناه `pending_review` و`original_text_loaded = false`.** لا قاعدة موسومة «Legally Verified & Approved». لا ترقية إلى `verified` إلا عبر `legal_rule_review` (0026) بعد مراجعة محامٍ. المستخلص أدناه ملخصات النظام وليست نصوصًا رسمية.

مستويات الإنفاذ: BLOCK يمنع الإجراء · WARNING تنبيه (يتطلب إقرارًا أحيانًا) · INFORMATION معلومة.

## 1) قواعد الشراء (workflow = procurement)

| معرّف القاعدة | المرجع | ملخص النص | الإنفاذ | review_status | مصدر الإدراج | موضع الاستعمال في الشيفرة |
|---|---|---|---|---|---|---|
| PPL-244-STANDSTILL | ق.244/2021 (مادة: «فترة التجميد» — رقم المادة غير محدد) | عشرة أيام عمل من نشر قبول العرض الفائز؛ لا توقيع قبل انتهائها ولا قبل البت في اعتراض مقدَّم. دليل معهد باسل فليحان يذكر أحيانًا بدايتها من تبليغ الفائز: غير محسوم قانونيًا | BLOCK | pending_review | 0020 (مصدر ثانوي: دليل المعهد) | `contract_set_status` في 0020 (رفع `standstill`، للأساليب التنافسية: open_tender, two_stage, proposals, framework, quotations)؛ `lib/council.ts` (`STANDSTILL_WORKING_DAYS`, `addWorkingDays`)؛ `lib/procurementDocs/load.ts` و`generate.ts` (مرجع في مستند إخطار المتقدمين، يظهر فقط إذا كانت القاعدة `verified`) |
| PPL-244-OBJ | ق.244/2021 (مادة: «الاعتراضات») | حق الاعتراض لكل ذي صفة ومصلحة أمام هيئة الاعتراضات؛ تبتّ خلال 20 يوم عمل كحد أقصى ويمكنها تجميد الإجراءات | INFORMATION | pending_review | 0020 | `lib/procurementDocs/load.ts` / `generate.ts` (إخطار المتقدمين، يُستشهد بها فقط عند `verified`)؛ منع التوقيع عند اعتراض معلّق يتم عبر `contract.objection_pending` في `contract_set_status` (0020) — لا يستند برمجيًا إلى هذه القاعدة بل إلى نص عام في القاعدة STANDSTILL |
| PPL-244-29 | ق.244/2021 م.29 | البدلات ثابتة مبدئيًا؛ تعديل القيمة استثناءً بضوابط ونسب في م.29؛ النسبة غير محمّلة | WARNING | pending_review | 0020 | `procurement_setting.art29_limit_pct` (NULL = غير محمّل)؛ لا موضع استعمال مباشر آخر ظاهر في الملفات المقروءة |
| PPL-244-ACCEPT | ق.244/2021 (مادة: «يلزم تحقق») | قاعدة تشغيلية مقترحة (غير موثّقة بنص): وجود محضر لجنة استلام بنتيجة إيجابية قبل اعتبار العقد منتهيًا | WARNING (يصبح BLOCK إن رُقّيت إلى `verified`) | pending_review | 0024 | `procurement_complete_contract` (0024): بدون محضر استلام → استثناء `acceptance_warning` ما لم يُمرَّر `p_ack`، ويُسجَّل حدث تدقيق `procurement.completed_without_acceptance` |
| PPL-244-THRESH | ق.244/2021 (مادة: «يلزم تحقق») | السقوف غير محمّلة عمدًا؛ تُحمَّل بعد المراجعة في `procurement_threshold`؛ لا يمنع محرك التوصية أي إجراء | INFORMATION | pending_review | 0024 | `lib/procurement.ts` (`recommendMethod` يعيد «لا بيانات» عند غياب السقوف)؛ جدول `procurement_threshold` (فارغ) |
| PPL-244-SPLIT | ق.244/2021 (مادة: «يلزم تحقق») | كشف استرشادي للتجزئة (تشابه الموضوع/المورّد ضمن نافذة زمنية قابلة للضبط)؛ النتيجة «احتمال تجزئة يستلزم التحقق» وليست إثباتًا | WARNING | pending_review | 0024 | `lib/procurement.ts` (كشف التجزئة)؛ `procurement_setting.split_window_days` / `split_min_similarity` (معاملات استدلالية لا قانونية) |
| PPL-244-PUBLISH | ق.244/2021 (مادة: «يلزم تحقق») | حفظ مستند داخل النظام ليس نشرًا رسميًا؛ يُسجَّل رابط المنصة الرسمية والرقم المرجعي وتاريخ النشر وإثباته | INFORMATION | pending_review | 0024 | جدول `procurement_publication` وRPC `procurement_publication_add` |

## 2) قواعد ذات صلة غير موسومة `procurement` (تؤثر على القرارات/العقود)

| معرّف القاعدة | المرجع | ملخص | الإنفاذ | review_status | workflow | الاستعمال |
|---|---|---|---|---|---|---|
| MUN-118-58 | م.ع. 118/1977 م.58 | إرسال قرارات المجلس إلى سلطة الرقابة خلال 8 أيام من صدورها | WARNING | pending_review | decisions | مولّد القرارات/الامتثال (`lib/compliance.ts`, `lib/decisions/engine.ts`) |
| MUN-118-59-62 | م.ع. 118/1977 م.59–62 | القرارات الخاضعة للتصديق وسلطته (قائمقام/محافظ/وزير)؛ السقوف المالية تحتاج تحققًا من النص النافذ (المواد 59–61 معدّلة بقانون 25/4/1999 بحسب الملخص) | INFORMATION | pending_review | decisions | `municipal_decision.validation_level` |
| MUN-118-63 | م.ع. 118/1977 م.63 | التصديق الحكمي بعد شهر من التسجيل، ولا ينطبق على التخطيط والموازنة ونقل الاعتمادات والقروض | BLOCK | pending_review | decisions | `decision_set_status` (0020) |
| MUN-118-64 | م.ع. 118/1977 م.64 | التصديق خطي ويجوز الطعن أمام مجلس شورى الدولة | INFORMATION | pending_review | decisions | معلوماتي |
| BUD-CYCLE-EXEC | ضابط داخلي | لا إنفاق على سنة قبل قرار اعتماد الموازنة وتصديقها | BLOCK | pending_review | finance | 0023 (دورة الموازنة) |
| BUD-CYCLE-SUPP | ضابط داخلي | مدة المدة المتممة قابلة للضبط وغير مدرجة | WARNING | pending_review | finance | 0023 |
| BUD-CYCLE-CLOSE | ضابط داخلي | شروط إقفال السنة وقطع الحساب | BLOCK | pending_review | finance | 0023 |

(قواعد MUN-118-32/33/34 تخص اجتماعات المجلس وليست للشراء، وقواعد النفايات في 0037/0038 خارج النطاق.)

## 3) ملاحظات على استعمال القواعد

- `lib/legalContext.ts`: يختار قواعد من `legal_rule` للمساعد الذكي بحسب كلمات مفتاحية؛ تُرسل مع «حالة المراجعة» و«النص الأصلي: غير محمَّل» ويُلزَم النموذج بعدم اختراع رقم مادة أو مهلة أو سقف. كلمات workflow=procurement: عقد، مناقصة، شراء، تلزيم، تجميد، اعتراض، 244، تعديل قيمة، إلخ.
- `lib/procurementDocs/load.ts` يجلب `PPL-244-STANDSTILL` و`PPL-244-OBJ` بشرط `review_status = verified` فقط؛ الحالة الراهنة: لا ترجع شيئًا، فتظهر المستندات بعبارة «يتطلب تحققًا قانونيًا».
- `lib/decisions/engine.ts` (`ruleOk`) يشترط `verified` لفتح بوابة الاعتماد؛ لا قاعدة شراء `verified` اليوم.
- `PPL-244-STANDSTILL` هي القاعدة الوحيدة من القواعد التي تمنع إجراءً فعليًا (توقيع العقد) رغم حالتها `pending_review`؛ الرقم 10 وحدة «أيام عمل» ثابت في `lib/council.ts` ودالة SQL `_add_working_days` (السبت والأحد عطلة: افتراض غير متحقق منه؛ جدول العطل فارغ).
- كشف أيضًا من الاستعلام: لا توجد قاعدة مسجّلة للسقوف أو للنشر المسبق أو لمهلة الإعلان (21 يومًا) — لم تُدرج عمدًا.
