-- Municipal Decision Builder: versioned template library, legal-review lifecycle, builder drafts linked to the existing decision register.
-- Nothing here marks any template or legal reference as verified: every imported template starts as "pending_legal_review",
-- and a decision cannot be adopted through the builder unless its template version is approved by a person (four-eyes) and every
-- selected legal reference matches a legal_rule row whose review_status is 'verified'.

-- 1) Municipality legal profile (nothing is assumed; empty until entered and verified by the municipality)
alter table public.municipality
  add column if not exists governorate_ar text,
  add column if not exists district_ar text,
  add column if not exists legal_profile_verified_on date,
  add column if not exists legal_profile_note text;

-- 2) Reference sources of the library (global catalogue)
create table if not exists public.decision_source (
  source_id text primary key,
  title text not null,
  url text,
  kind text not null default 'legal_text',
  instrument_no text,
  law_id text,
  effective_from date,
  updated_at timestamptz not null default now());

-- 3) Template versions (global catalogue). One row per version of a template.
create table if not exists public.decision_template_version (
  id uuid primary key default gen_random_uuid(),
  template_id text not null check (template_id ~ '^[A-Z][A-Z0-9_]{1,23}$'),
  seq int not null default 1 check (seq >= 1),
  version text not null check (length(version) between 1 and 20),
  status text not null default 'draft' check (status in ('draft','pending_legal_review','approved','superseded','archived')),
  title_ar text not null check (length(btrim(title_ar)) > 0),
  category_ar text,
  issuer text not null check (issuer in ('municipal_council','executive_authority','resolve_competent_authority')),
  document_kind text not null default 'decision_draft' check (document_kind in ('decision_draft','notice','letter','official_form_mapping')),
  domain text not null default 'other' check (domain in ('finance','procurement','property','personnel','projects','other')),
  nature text not null default 'administrative' check (nature in ('regulatory','individual','administrative')),
  risk text not null default 'standard' check (risk in ('standard','high')),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  effective_from date,
  effective_to date,
  review_note text,
  submitted_by uuid,
  submitted_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, seq),
  unique (template_id, version));
create unique index if not exists dtv_one_approved on public.decision_template_version (template_id) where status = 'approved';
create index if not exists dtv_status on public.decision_template_version (status, domain);

alter table public.decision_source enable row level security;
alter table public.decision_template_version enable row level security;
drop policy if exists decision_source_staff_read on public.decision_source;
drop policy if exists dtv_staff_read on public.decision_template_version;
create policy decision_source_staff_read on public.decision_source for select to authenticated using (exists (select 1 from staff_member s where s.user_id = auth.uid()));
create policy dtv_staff_read on public.decision_template_version for select to authenticated using (exists (select 1 from staff_member s where s.user_id = auth.uid()));

-- 4) Builder columns on the existing register (no duplicate decisions system)
alter table public.municipal_decision
  add column if not exists template_version_id uuid references public.decision_template_version(id) on delete restrict,
  add column if not exists template_snapshot jsonb,
  add column if not exists draft_data jsonb not null default '{}'::jsonb,
  add column if not exists published_on date,
  add column if not exists notified_on date;

create table if not exists public.decision_revision (
  id bigint generated always as identity primary key,
  decision_id uuid not null references public.municipal_decision(id) on delete cascade,
  municipality_id uuid not null references public.municipality(id),
  rev int not null,
  title text,
  body text,
  draft_data jsonb,
  actor uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (decision_id, rev));
alter table public.decision_revision enable row level security;
drop policy if exists decision_revision_staff_read on public.decision_revision;
create policy decision_revision_staff_read on public.decision_revision for select to authenticated
  using (exists (select 1 from municipal_decision d where d.id = decision_id and is_staff(d.municipality_id) and (d.is_demo or not is_demo_staff())));

-- 5) Helpers ------------------------------------------------------------------------------------------------------------------
create or replace function public._dt_admin() returns staff_member language plpgsql stable security definer set search_path to 'public' as $$
declare me staff_member%rowtype;
begin
  select * into me from staff_member where user_id = auth.uid() and role = 'admin' order by created_at limit 1;
  if auth.uid() is null or not found then raise exception 'forbidden' using errcode = '42501'; end if;
  return me;
end $$;
revoke all on function public._dt_admin() from public, anon, authenticated;

-- Required fields (required_for_finalization) with no usable value.
create or replace function public._dt_missing(p_snapshot jsonb, p_data jsonb) returns text[] language plpgsql immutable set search_path to 'public' as $$
declare f jsonb; k text; v jsonb; out text[] := '{}';
begin
  for f in select * from jsonb_array_elements(coalesce(p_snapshot->'fields','[]'::jsonb)) loop
    if coalesce((f->>'required_for_finalization')::boolean, false) then
      k := f->>'key'; v := p_data->k;
      if v is null or v = 'null'::jsonb
         or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '')
         or (jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 0) then out := out || k; end if;
    end if;
  end loop;
  return out;
end $$;

-- Selected legal references that do not match a legal_rule row with review_status = 'verified' (conservative: exact article match only).
create or replace function public._dt_unverified(p_data jsonb) returns text[] language plpgsql stable security definer set search_path to 'public' as $$
declare r jsonb; out text[] := '{}'; ino text; ok boolean;
begin
  for r in select * from jsonb_array_elements(coalesce(p_data->'selected_refs','[]'::jsonb)) loop
    select instrument_no into ino from decision_source where source_id = r->>'source_id';
    select exists (select 1 from legal_rule x where x.review_status = 'verified' and ino is not null and x.instrument_no = ino and x.article = r->>'article') into ok;
    if not ok then out := out || ((r->>'source_id') || ':' || coalesce(r->>'article','')); end if;
  end loop;
  return out;
end $$;
revoke all on function public._dt_unverified(jsonb) from public, anon, authenticated;
revoke all on function public._dt_missing(jsonb, jsonb) from public, anon, authenticated;

-- 6) Template administration (admin writes; mayor/admin review) ------------------------------------------------------------------
create or replace function public._dt_cols(p_content jsonb) returns record language sql immutable as $$
  select p_content->>'title_ar', p_content->>'category_ar', p_content->>'issuer_candidate', coalesce(p_content->>'document_kind','decision_draft'),
         coalesce(p_content->'classification'->>'domain','other'), coalesce(p_content->'classification'->>'nature','administrative'), coalesce(p_content->>'risk','standard')
$$;

create or replace function public.dt_save(p_id uuid, p_template_id text, p_version text, p_content jsonb) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare me staff_member := _dt_admin(); v decision_template_version%rowtype; nid uuid; nseq int; t text; c record;
begin
  if p_content is null or jsonb_typeof(p_content) <> 'object' or coalesce(btrim(p_content->>'title_ar'),'') = '' or jsonb_typeof(coalesce(p_content->'fields','[]'::jsonb)) <> 'array' then raise exception 'bad_input' using errcode = '22023'; end if;
  if length(p_content::text) > 400000 then raise exception 'too_large' using errcode = '22023'; end if;
  select * into c from _dt_cols(p_content) as (t text, c text, i text, k text, d text, n text, r text);
  if p_id is not null then
    select * into v from decision_template_version where id = p_id for update;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    if v.status <> 'draft' then raise exception 'not_draft' using errcode = '22023'; end if;
    update decision_template_version set content = p_content, title_ar = c.t, category_ar = c.c, issuer = c.i, document_kind = c.k, domain = c.d, nature = c.n, risk = c.r,
      version = coalesce(nullif(btrim(p_version),''), version), updated_at = now() where id = p_id;
    nid := p_id; t := v.template_id;
  else
    t := upper(btrim(coalesce(p_template_id,'')));
    if t !~ '^[A-Z][A-Z0-9_]{1,23}$' or btrim(coalesce(p_version,'')) = '' then raise exception 'bad_input' using errcode = '22023'; end if;
    select coalesce(max(seq),0)+1 into nseq from decision_template_version where template_id = t;
    insert into decision_template_version (template_id, seq, version, status, title_ar, category_ar, issuer, document_kind, domain, nature, risk, content, created_by)
    values (t, nseq, left(btrim(p_version),20), 'draft', c.t, c.c, c.i, c.k, c.d, c.n, c.r, p_content, auth.uid()) returning id into nid;
  end if;
  perform _adm_audit(me.municipality_id, 'decision_template.saved', 'decision_template_version', nid::text, jsonb_build_object('template', t));
  return nid;
end $$;

-- draft -> pending_legal_review (admin) | pending_legal_review -> approved (mayor/admin, different person, effective date required) | pending -> draft (reject)
-- approved -> superseded (automatic when a newer version is approved) | approved/superseded/draft -> archived
create or replace function public.dt_review(p_id uuid, p_to text, p_note text default null, p_effective date default null) returns void language plpgsql security definer set search_path to 'public' as $$
declare v decision_template_version%rowtype; me staff_member%rowtype; n text := nullif(left(btrim(coalesce(p_note,'')),500),'');
begin
  select * into me from staff_member where user_id = auth.uid() order by (role = 'admin') desc limit 1;
  if auth.uid() is null or not found or me.role not in ('mayor','admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v from decision_template_version where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v.status = 'draft' and p_to = 'pending_legal_review' then
    if me.role <> 'admin' then raise exception 'forbidden' using errcode = '42501'; end if;
    update decision_template_version set status = p_to, submitted_by = auth.uid(), submitted_at = now(), review_note = n, updated_at = now() where id = p_id;
  elsif v.status = 'pending_legal_review' and p_to = 'approved' then
    if p_effective is null then raise exception 'effective_date_required' using errcode = '22023'; end if;
    if n is null then raise exception 'review_note_required' using errcode = '22023'; end if;
    if v.submitted_by is not null and v.submitted_by = auth.uid() then raise exception 'four_eyes' using errcode = '42501'; end if;
    update decision_template_version set status = 'superseded', effective_to = coalesce(effective_to, p_effective), updated_at = now() where template_id = v.template_id and status = 'approved' and id <> p_id;
    update decision_template_version set status = 'approved', approved_by = auth.uid(), approved_at = now(), effective_from = p_effective, review_note = n, updated_at = now() where id = p_id;
  elsif v.status = 'pending_legal_review' and p_to = 'draft' then
    update decision_template_version set status = 'draft', review_note = n, updated_at = now() where id = p_id;
  elsif p_to = 'archived' and v.status in ('draft','approved','superseded','pending_legal_review') then
    if me.role <> 'admin' then raise exception 'forbidden' using errcode = '42501'; end if;
    update decision_template_version set status = 'archived', review_note = coalesce(n, review_note), updated_at = now() where id = p_id;
  else raise exception 'bad_transition' using errcode = '22023'; end if;
  perform _adm_audit(me.municipality_id, 'decision_template.' || p_to, 'decision_template_version', p_id::text, jsonb_build_object('template', v.template_id, 'from', v.status, 'to', p_to, 'note', n));
end $$;

-- Idempotent import of the seed library (skips versions that already exist). Imported rows are pending_legal_review, never approved.
create or replace function public.dt_import(p_sources jsonb, p_items jsonb) returns int language plpgsql security definer set search_path to 'public' as $$
declare me staff_member := _dt_admin(); s jsonb; it jsonb; cnt int := 0; nid uuid; c record; t text; nseq int;
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
  perform _adm_audit(me.municipality_id, 'decision_template.imported', 'decision_template_version', 'seed', jsonb_build_object('count', cnt));
  return cnt;
end $$;

create or replace function public.dt_set_source_date(p_source text, p_effective date) returns void language plpgsql security definer set search_path to 'public' as $$
declare me staff_member := _dt_admin();
begin
  update decision_source set effective_from = p_effective, updated_at = now() where source_id = p_source;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform _adm_audit(me.municipality_id, 'decision_source.date_set', 'decision_source', p_source, jsonb_build_object('effective_from', p_effective));
end $$;

-- Municipality legal profile (mayor/admin of that municipality). "verified" is a statement by the caller, recorded with date and audit.
create or replace function public.muni_set_legal_profile(p_governorate text, p_district text, p_note text default null, p_verified boolean default false) returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  update municipality set governorate_ar = nullif(left(btrim(coalesce(p_governorate,'')),80),''), district_ar = nullif(left(btrim(coalesce(p_district,'')),80),''),
    legal_profile_note = nullif(left(btrim(coalesce(p_note,'')),500),''),
    legal_profile_verified_on = case when coalesce(p_verified,false) then (now() at time zone 'Asia/Beirut')::date else null end where id = m;
  perform _adm_audit(m, 'municipality.legal_profile_set', 'municipality', m::text, jsonb_build_object('verified', coalesce(p_verified,false)));
end $$;

-- 7) Builder drafts (mayor/admin of the municipality) ---------------------------------------------------------------------------------
create or replace function public.decision_builder_create(p_version uuid, p_session uuid default null, p_title text default null, p_data jsonb default '{}'::jsonb) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); v decision_template_version%rowtype; i uuid; yr int := extract(year from (now() at time zone 'Asia/Beirut'))::int; nxt int; cat text; ttl text; snap jsonb;
begin
  select * into v from decision_template_version where id = p_version;
  if not found or v.status not in ('approved','pending_legal_review') then raise exception 'template_unavailable' using errcode = '22023'; end if;
  if p_session is not null and not exists (select 1 from council_session where id = p_session and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select coalesce(max(decision_no::int), 0) + 1 into nxt from municipal_decision where municipality_id = m and year = yr and decision_no ~ '^[0-9]{1,9}$';
  cat := coalesce(v.content->'classification'->>'category', 'general');
  if cat not in ('general','budget','accounts','planning','loan','tax','contract','property','other') then cat := 'general'; end if;
  ttl := left(coalesce(nullif(btrim(coalesce(p_title,'')),''), v.title_ar), 300);
  snap := v.content || jsonb_build_object('_meta', jsonb_build_object('template_id', v.template_id, 'version', v.version, 'status_at_creation', v.status, 'effective_from', v.effective_from));
  insert into municipal_decision (municipality_id, session_id, decision_no, year, title, legal_status, category, template_version_id, template_snapshot, draft_data, created_by, is_demo)
  values (m, p_session, nxt::text, yr, ttl, 'draft', cat, v.id, snap, coalesce(p_data,'{}'::jsonb), auth.uid(), coalesce((select is_demo from municipality where id = m), false)) returning id into i;
  insert into decision_event (decision_id, municipality_id, kind, to_value, note, actor) values (i, m, 'created', 'draft', 'أُنشئ من قالب ' || v.template_id || ' نسخة ' || v.version, auth.uid());
  insert into decision_revision (decision_id, municipality_id, rev, title, body, draft_data, actor) values (i, m, 1, ttl, null, coalesce(p_data,'{}'::jsonb), auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'decision.builder_created', 'municipal_decision', i::text, jsonb_build_object('template', v.template_id, 'version', v.version));
  return i;
end $$;

create or replace function public.decision_builder_save(p_id uuid, p_title text, p_body text, p_data jsonb, p_legal_basis text default null) returns int language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); d municipal_decision%rowtype; r int;
begin
  select * into d from municipal_decision where id = p_id and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if d.template_snapshot is null then raise exception 'not_builder' using errcode = '22023'; end if;
  if d.legal_status <> 'draft' then raise exception 'not_draft' using errcode = '22023'; end if;
  if btrim(coalesce(p_title,'')) = '' or p_data is null or jsonb_typeof(p_data) <> 'object' or length(p_data::text) > 200000 then raise exception 'bad_input' using errcode = '22023'; end if;
  update municipal_decision set title = left(btrim(p_title),300), body = left(p_body, 60000), draft_data = p_data, legal_basis = left(p_legal_basis, 2000), updated_at = now() where id = p_id;
  select coalesce(max(rev),0) + 1 into r from decision_revision where decision_id = p_id;
  insert into decision_revision (decision_id, municipality_id, rev, title, body, draft_data, actor) values (p_id, m, r, left(btrim(p_title),300), left(p_body, 60000), p_data, auth.uid());
  return r;
end $$;

-- The official gate: template version approved + no missing required field + every selected legal reference verified in legal_rule.
create or replace function public.decision_builder_adopt(p_id uuid, p_date date) returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); d municipal_decision%rowtype; v decision_template_version%rowtype; miss text[]; unv text[];
begin
  select * into d from municipal_decision where id = p_id and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if d.template_snapshot is null or d.legal_status <> 'draft' or p_date is null then raise exception 'bad_input' using errcode = '22023'; end if;
  select * into v from decision_template_version where id = d.template_version_id;
  if not found or v.status <> 'approved' then raise exception 'template_not_approved' using errcode = '22023'; end if;
  miss := _dt_missing(d.template_snapshot, d.draft_data);
  if array_length(miss, 1) > 0 then raise exception 'missing_fields:%', array_to_string(miss, ',') using errcode = '22023'; end if;
  unv := _dt_unverified(d.draft_data);
  if array_length(unv, 1) > 0 then raise exception 'unverified_refs:%', array_to_string(unv, ',') using errcode = '22023'; end if;
  update municipal_decision set legal_status = 'adopted', decided_on = p_date, updated_at = now() where id = p_id;
  insert into decision_event (decision_id, municipality_id, kind, from_value, to_value, note, actor) values (p_id, m, 'legal_status', 'draft', 'adopted', 'اعتماد من صاحب الاختصاص عبر محرر القرارات', auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'decision.builder_adopted', 'municipal_decision', p_id::text, jsonb_build_object('template', v.template_id, 'version', v.version));
end $$;

create or replace function public.decision_set_register(p_id uuid, p_published date default null, p_notified date default null) returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  update municipal_decision set published_on = p_published, notified_on = p_notified, updated_at = now() where id = p_id and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into decision_event (decision_id, municipality_id, kind, to_value, note, actor) values (p_id, m, 'note', 'register', 'تحديث تاريخ النشر/التبليغ', auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'decision.register_updated', 'municipal_decision', p_id::text, '{}'::jsonb);
end $$;

do $$ declare f text; begin
  foreach f in array array['dt_save(uuid,text,text,jsonb)','dt_review(uuid,text,text,date)','dt_import(jsonb,jsonb)','dt_set_source_date(text,date)','muni_set_legal_profile(text,text,text,boolean)',
    'decision_builder_create(uuid,uuid,text,jsonb)','decision_builder_save(uuid,text,text,jsonb,text)','decision_builder_adopt(uuid,date)','decision_set_register(uuid,date,date)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
