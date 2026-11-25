# مصفوفة التتبع القانوني

| الوظيفة | الوحدة | القانون/المادة | الملف | RPC / قيد | اختبار | الحالة |
|---|---|---|---|---|---|---|
| نصاب الجلسة | المجلس | 118/1977 م.34 | lib/council.ts `quorumState` | council_set_attendance | lib/council.test.ts | Implemented & Tested (حساب فقط؛ لا منع) — Pending Legal Review |
| مهلة الدعوة | المجلس | م.33 | `summonsOk` | council_set_attendance | council.test.ts | Implemented & Tested — Pending Legal Review |
| إرسال القرار خلال 8 أيام | القرارات | م.58 | `decisionAlerts` | decision_set_review | council.test.ts | Implemented — Pending Legal Review |
| منع النفاذ قبل التصديق | القرارات | م.63 | — | decision_set_status | e2e يدوي (Playwright) | **Partially Implemented**: القاعدة المنشورة (0019) تحتاج تصحيحًا عبر 0020 (غير مُطبَّق) |
| تعديل الموازنة بقرار | المالية | قانون المحاسبة/نظام البلديات (لم يُراجَع) | financeData، finance_amend | finance_amend / finance_amend_validate | e2e يدوي | Partially Implemented — Blocked by Missing Legal Evidence |
| التزام لا يتجاوز الاعتماد | المالية | 5595/1982 (لم يُراجَع) | finance_commit | RPC | lib/finance.test.ts | Implemented & Tested (حسابيًا) — الأساس القانوني غير متحقق |
| دورة النفقة (تصفية/أمر صرف) | المالية | 5595/1982 | — | — | — | Not Implemented |
| فترة التجميد 10 أيام عمل | الشراء | 244/2021 | مستخدمة 14 يومًا حاليًا | contract_set_status | e2e يدوي | **Partially Implemented** (الإصلاح في 0020 غير مُطبَّق) |
| منع التوقيع عند اعتراض | الشراء | 244/2021 | — | contract_set_objection (0020) | — | Not Implemented (بانتظار 0020) |
| ملحق العقد | الشراء | م.29 | contract_amend | RPC | e2e جزئي | Partially Implemented — الحد/النسبة غير مُحمَّل |
| لجان التلزيم/الاستلام، خطة الشراء، النشر | الشراء | 244/2021 | — | — | — | Not Implemented |
| الرسوم والتكليف | التحصيل | 60/1988 | collections، receivables | receivable_* | e2e يدوي | Partially Implemented (دون سجل معدلات/أوامر قبض/اعتراضات) |
| لوحة المرجع القانوني | كل الصفحات | — | — | legal_rule (0020) | — | Not Implemented |
