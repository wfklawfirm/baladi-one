-- The mayor (or admin) of the municipality may import the founding library. Imported rows stay pending_legal_review; approval rules are unchanged.
create or replace function public.dt_import(p_sources jsonb, p_items jsonb) returns int language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); s jsonb; it jsonb; cnt int := 0; nid uuid; c record; t text; nseq int;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 200 then raise exception 'bad_input' using errcode = '22023'; end if;
  for s in select * from jsonb_array_elements(coalesce(p_sources,'[]'::jsonb)) loop
    insert into decision_source (source_id, title, url, kind, instrument_no, law_id, effective_from)
    values (s->>'source_id', s->>'title', s->>'url', coalesce(s->>'kind','legal_text'), s->>'instrument_no', s->>'law_id', nullif(s->>'effective_from','')::date)
    on conflict (source_id) do update set title = excluded.title, url = excluded.url, kind = excluded.kind, instrument_no = coalesce(excluded.instrument_no, decision_source.instrument_no), law_id = coalesce(excluded.law_id, decision_source.law_id), updated_at = now();
  end loop;
  for it in select * from jsonb_array_elements(p_items) loop
    t := it->>'id';
    if t is null or t !~ '^[A-Z][A-Z0-9_]{1,23}$' or coalesce(btrim(it->>'title_ar'),'') = '' then raise exception 'bad_input' using errcode = '22023'; end if;
    if exists (select 1 from decision_template_version where template_id = t and version = coalesce(it->>'version','1.0')) then continue; end if;
    select * into c from _dt_cols(it || jsonb_build_object('issuer_candidate', it->>'issuer_candidate')) as (t text, c text, i text, k text, d text, n text, r text);
    select coalesce(max(seq),0)+1 into nseq from decision_template_version where template_id = t;
    insert into decision_template_version (template_id, seq, version, status, title_ar, category_ar, issuer, document_kind, domain, nature, risk, content, review_note, created_by)
    values (t, nseq, coalesce(it->>'version','1.0'), 'pending_legal_review', c.t, c.c, c.i, c.k, c.d, c.n, c.r, it, 'مستورد من المكتبة التأسيسية: لم تتم مراجعته قانونيًا بعد', auth.uid()) returning id into nid;
    cnt := cnt + 1;
  end loop;
  perform _adm_audit(m, 'decision_template.imported', 'decision_template_version', 'seed', jsonb_build_object('count', cnt));
  return cnt;
end $$;

