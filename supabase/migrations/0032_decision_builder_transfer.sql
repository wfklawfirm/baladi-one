-- Allow the 'transfer' category (credit transfer templates FIN02/FIN03) in decision_builder_create.
create or replace function public.decision_builder_create(p_version uuid, p_session uuid default null, p_title text default null, p_data jsonb default '{}'::jsonb) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); v decision_template_version%rowtype; i uuid; yr int := extract(year from (now() at time zone 'Asia/Beirut'))::int; nxt int; cat text; ttl text; snap jsonb;
begin
  select * into v from decision_template_version where id = p_version;
  if not found or v.status not in ('approved','pending_legal_review') then raise exception 'template_unavailable' using errcode = '22023'; end if;
  if p_session is not null and not exists (select 1 from council_session where id = p_session and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select coalesce(max(decision_no::int), 0) + 1 into nxt from municipal_decision where municipality_id = m and year = yr and decision_no ~ '^[0-9]{1,9}$';
  cat := coalesce(v.content->'classification'->>'category', 'general');
  if cat not in ('general','budget','accounts','planning','loan','transfer','tax','contract','property','other') then cat := 'general'; end if;
  ttl := left(coalesce(nullif(btrim(coalesce(p_title,'')),''), v.title_ar), 300);
  snap := v.content || jsonb_build_object('_meta', jsonb_build_object('template_id', v.template_id, 'version', v.version, 'status_at_creation', v.status, 'effective_from', v.effective_from));
  insert into municipal_decision (municipality_id, session_id, decision_no, year, title, legal_status, category, template_version_id, template_snapshot, draft_data, created_by, is_demo)
  values (m, p_session, nxt::text, yr, ttl, 'draft', cat, v.id, snap, coalesce(p_data,'{}'::jsonb), auth.uid(), coalesce((select is_demo from municipality where id = m), false)) returning id into i;
  insert into decision_event (decision_id, municipality_id, kind, to_value, note, actor) values (i, m, 'created', 'draft', 'أُنشئ من قالب ' || v.template_id || ' نسخة ' || v.version, auth.uid());
  insert into decision_revision (decision_id, municipality_id, rev, title, body, draft_data, actor) values (i, m, 1, ttl, null, coalesce(p_data,'{}'::jsonb), auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'decision.builder_created', 'municipal_decision', i::text, jsonb_build_object('template', v.template_id, 'version', v.version));
  return i;
end $$;

