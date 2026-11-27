-- 0049: tutelage-approval matrix from the North Lebanon Governor's circular of 14/08/2025 (Arts. 60-61 of Decree-Law 118/1977 as amended by Art. 6 of Law 21/2025).
-- Read visually from the scanned circular. Region-specific (North Lebanon). Everything pending_review; boundaries (strict/inclusive) are not stated precisely in the table.
insert into procurement_legal_source (instrument_type, instrument_number, instrument_date, official_title, applicable_entities, effective_from, verification_status, note)
select 'circular','بلا رقم (محافظ لبنان الشمالي)',date '2025-08-14','تعميم محافظ لبنان الشمالي حول الالتزام بتعديلات القانون 21/2025 — جدول تصديق القائمقام/المحافظ',array['municipality'],date '2025-08-14','pending_review','مقروء من نسخة ممسوحة ضوئيًا؛ خاص بمحافظة لبنان الشمالي؛ يستند إلى المادتين 60 و61 من المرسوم الاشتراعي 118/1977 المعطوفتين على المادة 6 من القانون 21/2025.'
where not exists (select 1 from procurement_legal_source where instrument_type='circular' and instrument_number='بلا رقم (محافظ لبنان الشمالي)');

insert into procurement_provision (source_id, article_number, topic, amendments, verification_status)
select s.id,'6','oversight','المادة 6 من القانون 21/2025 (معطوفة عليها المادتان 60 و61 من م.إ.118/1977): قيم النفقات الخاضعة لتصديق القائمقام/المحافظ — كما وردت في التعميم؛ النص الأصلي غير محمّل','pending_review'
from procurement_legal_source s where s.instrument_type='law' and s.instrument_number='21'
  and not exists (select 1 from procurement_provision p where p.source_id=s.id and p.article_number='6');

insert into procurement_threshold (municipality_id, threshold_kind, method, min_value, max_value, currency, comparison_operator, effective_from, source, review_status, legal_source_id, provision_id, applies_to, conditions)
select m.id,'admin_approval',null,t.minv,t.maxv,'LBP',t.op,date '2025-08-14','تعميم محافظ لبنان الشمالي 14/08/2025 (م.60-61 م.إ.118/1977 / م.6 ق.21/2025)','pending_review',s.id,
  (select p.id from procurement_provision p where p.source_id=(select id from procurement_legal_source where instrument_type='law' and instrument_number='21') and p.article_number='6' limit 1),
  t.applies,t.cond
from municipality m
join procurement_legal_source s on s.instrument_type='circular' and s.instrument_number='بلا رقم (محافظ لبنان الشمالي)'
cross join (values
('تصديق القائمقام — شراء/بيع العقارات ودفاتر شروطها',0,2000000000,'lte','لا تزيد قيمتها عن 2 مليار ل.ل.'),
('تصديق المحافظ — شراء/بيع العقارات ودفاتر شروطها',2000000000,null::numeric,'gt','تزيد قيمتها عن 2 مليار ل.ل.'),
('تصديق القائمقام — عقود الإيجار (بلديات خاضعة لديوان المحاسبة)',400000000,800000000,'between_inclusive','عندما تزيد البدلات السنوية عن 400 مليون على ألا تتعدى 800 مليون ل.ل.؛ حدّية الحدود تُتحقق من النص'),
('تصديق القائمقام — عقود الإيجار (البلديات الأخرى)',200000000,800000000,'between_inclusive','عندما تزيد البدلات السنوية عن 200 مليون على ألا تتعدى 800 مليون ل.ل.؛ حدّية الحدود تُتحقق من النص'),
('تصديق المحافظ — عقود الإيجار',800000000,null::numeric,'gt','عندما تزيد البدلات السنوية عن 800 مليون ل.ل.'),
('تصديق القائمقام — إسعاف المعاقين والمساعدات',200000000,null::numeric,'gt','عندما تزيد القيمة الإجمالية للمساعدات في السنة عن 200 مليون ل.ل.'),
('تصديق المحافظ — إسعاف المعاقين والمساعدات (قضاء مركز المحافظة)',200000000,null::numeric,'gt','عندما تزيد القيمة الإجمالية للمساعدات في السنة عن 200 مليون ل.ل.؛ صلاحية المحافظ محصورة في قضاء مركز المحافظة'),
('تصديق القائمقام — صفقات اللوازم والأشغال والخدمات ودفاتر شروطها',600000000,1600000000,'between_inclusive','عندما تزيد قيمتها عن 600 مليون ولا تتجاوز 1.6 مليار ل.ل.'),
('تصديق المحافظ — صفقات اللوازم والأشغال والخدمات ودفاتر شروطها',1600000000,null::numeric,'gt','عندما تزيد قيمتها عن 1.6 مليار ل.ل.'),
('تصديق القائمقام — الأشغال بالأمانة وشراء اللوازم بالفاتورة',400000000,1000000000,'between_inclusive','عندما تزيد قيمتها عن 400 مليون ولا تتجاوز مليار ل.ل.'),
('تصديق المحافظ — الأشغال بالأمانة وشراء اللوازم بالفاتورة',1000000000,null::numeric,'gt','عندما تزيد قيمتها عن مليار ل.ل.')
) as t(applies,minv,maxv,op,cond)
where m.is_demo
  and not exists (select 1 from procurement_threshold x where x.municipality_id=m.id and x.legal_source_id=s.id and x.applies_to=t.applies);
