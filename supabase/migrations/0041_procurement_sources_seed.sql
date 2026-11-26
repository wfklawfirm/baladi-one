-- 0041 (APPLIED 2026-11-26): seed of procurement legal SOURCE METADATA only, read on 2026-11-26 from the PPA site listings
-- (https://www.ppa.gov.lb/ar/pages/details/11 and /ar/listing-pages/president-memos). NO article text, NO threshold, NO deadline is loaded.
-- All rows stay 'pending_review': a lawyer must read the instrument itself before anything here is relied on. Depends on 0040.
insert into public.procurement_legal_source (instrument_type, instrument_number, instrument_date, official_title, official_source_url, applicable_entities, verification_status, note) values
 ('law','244',  '2021-07-19','قانون الشراء العام', 'https://www.ppa.gov.lb/ar/pages/details/11', '{}', 'pending_review', 'الصفحة تعرض أيضًا تاريخ 2023-07-18 يتعارض مع التاريخ أعلاه؛ النشر في الجريدة الرسمية العدد 30 تاريخ 2021-07-29 كما تعرضه الصفحة. النسخة المجمّعة بتعديل السقوف (تشرين الأول 2024) مرفقة على الصفحة ولم تُقرأ بعد.'),
 ('decree','14063','2024-10-03','مرسوم تعديل السقوف المالية', 'https://www.ppa.gov.lb/ar/pages/details/53', '{}', 'pending_review', 'ملف PDF على مضيف الهيئة لا يعرض نص المرسوم (ترويسة الجريدة الرسمية فقط)؛ لا تُحمَّل أي سقوف قبل الحصول على النص.'),
 ('law','21',   '2025-07-17','قانون تفعيل عمل البلديات وصلاحيات المحافظين والقائمقامين', 'https://www.ppa.gov.lb/ar/breaking-news/details/8', '{municipality}', 'pending_review', 'تعرضه الهيئة كجدول توضيحي؛ النص الرسمي في الجريدة الرسمية لم يُراجع بعد.'),
 ('memo','2/2022','2022-08-11','تطبيق قانون الشراء العام في البلديات واتحادات البلديات', 'https://www.ppa.gov.lb/ar/pages/details/18', '{municipality,union_of_municipalities}', 'pending_review', null),
 ('memo','1/2026','2026-01-14','الخطة السنوية الموحدة للشراء لعام 2026', 'https://www.ppa.gov.lb/ar/pages/details/138', '{}', 'pending_review', null),
 ('memo','2/2026','2026-01-21','تطبيق المادة 46 الفقرة 4 (الاتفاقات الرضائية السرية)', 'https://www.ppa.gov.lb/ar/pages/details/139', '{}', 'pending_review', 'عنوان المذكرة كما يظهر في فهرس الهيئة.'),
 ('memo','3/2026','2026-01-21','الإفصاح عن أصحاب الحقوق الاقتصادية من قبل العارضين', 'https://www.ppa.gov.lb/ar/pages/details/140', '{}', 'pending_review', null),
 ('memo','4/2026','2026-01-27','العروض المرتفعة الأسعار بصورة غير اعتيادية', 'https://www.ppa.gov.lb/ar/pages/details/141', '{}', 'pending_review', 'الفهرس يعرض تاريخين (27 و28 كانون الثاني)؛ يُحسم من الوثيقة.'),
 ('memo','5/2026','2026-01-27','سجل الشراء', 'https://www.ppa.gov.lb/ar/pages/details/142', '{}', 'pending_review', null),
 ('memo','6/2026','2026-01-27','العقد بين الجهة الشارية والمتعهد المؤقت', 'https://www.ppa.gov.lb/ar/pages/details/143', '{}', 'pending_review', null),
 ('memo','7/2026','2026-03-06','تلبية الحاجات الأساسية والملحّة في الظروف الاستثنائية', 'https://www.ppa.gov.lb/ar/pages/details/144', '{}', 'pending_review', null),
 ('memo','8/2026','2026-09-24','الإفادات والمستندات الواجب إدراجها في دفاتر الشروط الخاصة', 'https://www.ppa.gov.lb/ar/pages/details/146', '{}', 'pending_review', null),
 ('memo','9/2026',null,'رأي الهيئة في دفاتر الشروط', 'https://www.ppa.gov.lb/ar/pages/details/150', '{}', 'pending_review', 'تظهر في صفحة القانون ولا تظهر في فهرس المذكرات؛ يلزم التحقق من تصنيفها وتاريخها.'),
 ('memo','10/2026',null,'الإلزام باستعمال دفتر الشروط النموذجي لشراء اللوازم', 'https://www.ppa.gov.lb/ar/pages/details/151', '{}', 'pending_review', 'تظهر في صفحة القانون ولا تظهر في فهرس المذكرات؛ يلزم التحقق من تصنيفها وتاريخها.'),
 ('decision','79/هـ.ش.ع./2025',null,'مدونة السلوك والأخلاقيات المهنية للشراء العام', 'https://www.ppa.gov.lb/ar/pages/details/127', '{}', 'pending_review', null),
 ('memo','2022/5','2022-08-19','تجزئة بعض النفقات', 'https://www.ppa.gov.lb/ar/pages/details/21', '{}', 'pending_review', 'مرتبطة بمنع التجزئة؛ لم يُقرأ نصها.'),
 ('memo','3/2025','2025-10-29','مهلة الإعلان وفق المادة 12', 'https://www.ppa.gov.lb/ar/pages/details/134', '{}', 'pending_review', 'تعلن الهيئة أن 21 يومًا حدّ أدنى لا يشمل يومي الإعلان وفتح العروض (إعلان الهيئة 2025-07-23)؛ لا يُعتمد قبل قراءة النص.')
on conflict (instrument_type, instrument_number, instrument_date) do nothing;
