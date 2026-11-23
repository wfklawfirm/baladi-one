insert into municipality (slug,name_ar,name_en,is_demo) values ('demo','بلدية تجريبية','Demo Municipality',true) on conflict (slug) do nothing;
