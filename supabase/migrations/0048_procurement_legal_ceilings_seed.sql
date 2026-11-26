-- 0048: load the financial ceilings read from Decree 14063 (Gazette 41 of 10/10/2024, p.2539) and Law 21/2025 Art.3
-- (Gazette 31 of 17/07/2025, pp.2018-2022). EVERYTHING stays pending_review: nothing here is "verified", and no
-- threshold is activated for production municipalities beyond the two existing demo ones.
-- Caveats: decree text read visually from the gazette image; Law 21/2025 text from an unofficial machine-read copy.
-- Lower bounds of each method are NOT stated in the sources read -> recorded in conditions, to be confirmed.

update procurement_legal_source set
  gazette_reference = 'الجريدة الرسمية العدد 41 تاريخ 10/10/2024 ص.2539',
  note = coalesce(note || E'\n', '') || 'نُقلت السقوف من صورة الجريدة الرسمية؛ بانتظار مراجعة قانونية. تاريخ النفاذ المسجّل = تاريخ النشر (للتحقق).'
where instrument_type='decree' and instrument_number='14063' and (gazette_reference is null);

update procurement_legal_source set
  gazette_reference = 'الجريدة الرسمية العدد 31 تاريخ 17/07/2025 ص.2018-2022',
  note = coalesce(note || E'\n', '') || 'المادة 3 قُرئت من نسخة غير رسمية (قراءة آلية)؛ يلزم التحقق من النص الرسمي.'
where instrument_type='law' and instrument_number='21' and (gazette_reference is null);

insert into procurement_provision (source_id, article_number, paragraph_number, topic, original_arabic_text, amendments, verification_status)
select * from (values
 ((select id from procurement_legal_source where instrument_type='decree' and instrument_number='14063'), '11', null, 'planning', null, 'رُفع السقف من 5 إلى 10 مليارات ل.ل. (الخطة السنوية)', 'pending_review'),
 ((select id from procurement_legal_source where instrument_type='decree' and instrument_number='14063'), '34', '2', 'guarantees', null, 'رُفع السقف من 2.5 إلى 5 مليارات ل.ل. (ضمان العرض)', 'pending_review'),
 ((select id from procurement_legal_source where instrument_type='decree' and instrument_number='14063'), '37', '3/أ', 'payment', null, 'رُفع السقف من 5 إلى 15 مليار ل.ل. (دفع بموجب العقد)', 'pending_review'),
 ((select id from procurement_legal_source where instrument_type='decree' and instrument_number='14063'), '44', null, 'methods', null, 'رُفع سقف شروط الاستدراج من 5 إلى 15 مليار ل.ل.', 'pending_review'),
 ((select id from procurement_legal_source where instrument_type='decree' and instrument_number='14063'), '47', null, 'methods', null, 'رُفع سقف الفاتورة من 500 مليون إلى 1.5 مليار ل.ل.', 'pending_review'),
 ((select id from procurement_legal_source where instrument_type='law' and instrument_number='21'), '3', null, 'other', null, 'سقف عقد النفقة: رئيس البلدية/رئيس الجهاز التنفيذي 100,000,000 ل.ل.؛ المجلس البلدي 1,000,000,000 ل.ل. (نص غير رسمي)', 'pending_review')
) v(source_id, article_number, paragraph_number, topic, original_arabic_text, amendments, verification_status)
where v.source_id is not null and not exists (select 1 from procurement_provision p where p.source_id = v.source_id and p.article_number = v.article_number and coalesce(p.paragraph_number,'') = coalesce(v.paragraph_number,''));

-- thresholds for the existing demo municipalities only (idempotent)
insert into procurement_threshold (municipality_id, threshold_kind, method, min_value, max_value, currency, comparison_operator, effective_from, source, review_status, legal_source_id, provision_id, applies_to, conditions)
select m.id, t.kind, t.method, t.minv, t.maxv, 'LBP', t.op, t.eff, t.src, 'pending_review', t.sid,
       (select p.id from procurement_provision p where p.source_id = t.sid and p.article_number = t.art and coalesce(p.paragraph_number,'') = '' limit 1),
       t.applies, t.cond
from municipality m
cross join (values
 ('method','quotations',0::numeric,15000000000::numeric,'lte','2024-10-10'::date,'المرسوم 14063 م.44',(select id from procurement_legal_source where instrument_type='decree' and instrument_number='14063'),'44',null,'السقف الأعلى فقط (15 مليار ل.ل.)؛ الحد الأدنى غير وارد في المصدر المقروء ويُحدَّد عند المراجعة القانونية'),
 ('method','invoice',0,1500000000,'lte','2024-10-10','المرسوم 14063 م.47',(select id from procurement_legal_source where instrument_type='decree' and instrument_number='14063'),'47',null,'سقف الفاتورة 1.5 مليار ل.ل.؛ شروط إضافية غير محمّلة'),
 ('competence',null,0,100000000,'lte','2025-07-17','القانون 21/2025 م.3',(select id from procurement_legal_source where instrument_type='law' and instrument_number='21'),'3','رئيس البلدية / رئيس الجهاز التنفيذي','سقف عقد النفقة؛ شروط أخرى غير محمّلة'),
 ('competence',null,0,1000000000,'lte','2025-07-17','القانون 21/2025 م.3',(select id from procurement_legal_source where instrument_type='law' and instrument_number='21'),'3','المجلس البلدي','سقف عقد النفقة؛ شروط أخرى غير محمّلة')
) as t(kind, method, minv, maxv, op, eff, src, sid, art, applies, cond)
where m.is_demo and t.sid is not null
  and not exists (select 1 from procurement_threshold x where x.municipality_id = m.id and x.legal_source_id = t.sid and x.threshold_kind = t.kind and coalesce(x.method,'') = coalesce(t.method,'') and coalesce(x.applies_to,'') = coalesce(t.applies,''));
