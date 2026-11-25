-- 0026: council voting engine + minutes (محضر), legal-update management, rule review workflow.
-- Idempotent and non-destructive: only CREATE ... IF NOT EXISTS / CREATE OR REPLACE / ADD COLUMN IF NOT EXISTS. Nothing is dropped, nothing existing is rewritten.
-- Requires 0015 (council), 0019 (attendance columns) and 0020 (legal_rule). NO legal majority/threshold is invented here:
-- required majority per decision type is stored as NULL + verification = 'needs_verification' (يلزم تحقق) until a lawyer fills it.
-- Approving a legal_update NEVER changes legal_rule; only legal_rule_review (admin) changes a rule's review_status, always with a history row.

do $$ begin
  if to_regclass('public.legal_rule') is null or to_regclass('public.council_session') is null then
    raise exception '0026 requires 0015, 0019 and 0020 (legal_rule, council_session) to be applied first';
  end if;
end $$;

-- Roles allowed to read the council voting/minutes data
create or replace function public._council_reader(p_muni uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select is_staff(p_muni, array['mayor','admin']::staff_role[]); $$;
grant execute on function public._council_reader(uuid) to authenticated;

-- ============ A1) Required majority per decision type (stored, flagged for verification) ============
create table if not exists public.council_majority_rule (
  category text primary key check (category in ('general','budget','accounts','planning','loan','transfer','tax','contract','property','other')),
  majority_kind text check (majority_kind is null or majority_kind in ('simple','absolute','two_thirds','other')),
  majority_note text,
  verification text not null default 'needs_verification' check (verification in ('needs_verification','verified')),
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
  check (verification <> 'verified' or majority_kind is not null));
alter table public.council_majority_rule enable row level security;
drop policy if exists council_majority_rule_read on public.council_majority_rule;
create policy council_majority_rule_read on public.council_majority_rule for select to authenticated using (true);
insert into public.council_majority_rule (category) values ('general'),('budget'),('accounts'),('planning'),('loan'),('transfer'),('tax'),('contract'),('property'),('other')
  on conflict (category) do nothing;

create or replace function public.council_set_majority_rule(p_category text, p_kind text, p_note text default null, p_verified boolean default false)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  if not is_any_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_kind is not null and p_kind not in ('simple','absolute','two_thirds','other') then raise exception 'bad_input' using errcode = '22023'; end if;
  if coalesce(p_verified,false) and p_kind is null then raise exception 'bad_input' using errcode = '22023'; end if;
  update council_majority_rule set majority_kind = p_kind, majority_note = nullif(left(btrim(coalesce(p_note,'')),1000),''),
    verification = case when coalesce(p_verified,false) then 'verified' else 'needs_verification' end, updated_by = auth.uid(), updated_at = now() where category = p_category;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'council.majority_rule_set', 'council_majority_rule', p_category, jsonb_build_object('kind', p_kind, 'verified', coalesce(p_verified,false)));
end $$;

-- ============ A2) Votes per agenda item ============
create table if not exists public.council_agenda_result (
  agenda_item_id uuid primary key references public.agenda_item(id) on delete cascade,
  session_id uuid not null references public.council_session(id) on delete cascade,
  municipality_id uuid not null references public.municipality(id),
  decision_category text references public.council_majority_rule(category),
  required_majority text,                       -- snapshot of the stored rule at recording time; NULL = unknown
  majority_verification text not null default 'needs_verification' check (majority_verification in ('needs_verification','verified')),
  total_members int not null check (total_members between 1 and 100),
  present_count int not null check (present_count >= 0),
  votes_for int not null default 0 check (votes_for >= 0),
  votes_against int not null default 0 check (votes_against >= 0),
  votes_abstain int not null default 0 check (votes_abstain >= 0),
  votes_recused int not null default 0 check (votes_recused >= 0),
  votes_absent int not null default 0 check (votes_absent >= 0),
  result text not null default 'unverified' check (result in ('carried','not_carried','tie','unverified')),
  tie_break_by_chair boolean not null default false,   -- tie resolved by the chair's side (see tie note in lib/council.ts, art.42; pending legal review)
  result_note text,
  recorded_by uuid references auth.users(id), recorded_at timestamptz not null default now(),
  constraint present_within_total check (present_count <= total_members),
  constraint votes_within_present check (votes_for + votes_against + votes_abstain + votes_recused <= present_count),
  constraint absent_within_total check (present_count + votes_absent <= total_members),
  constraint tie_break_needs_tie check (not tie_break_by_chair or (votes_for = votes_against and votes_for > 0)),
  constraint result_matches_counts check (
    result = 'unverified'
    or (result = 'carried' and (votes_for > votes_against or (votes_for = votes_against and votes_for > 0 and tie_break_by_chair)))
    or (result = 'not_carried' and (votes_for < votes_against or (votes_for = votes_against and votes_for > 0 and tie_break_by_chair)))
    or (result = 'tie' and votes_for = votes_against and votes_for > 0 and not tie_break_by_chair)));

create table if not exists public.council_vote (
  id uuid primary key default gen_random_uuid(),
  agenda_item_id uuid not null references public.agenda_item(id) on delete cascade,
  municipality_id uuid not null references public.municipality(id),
  member_name text not null check (btrim(member_name) <> '' and length(member_name) <= 200),
  vote text not null check (vote in ('for','against','abstain','absent','recused')),
  recusal_reason text,
  recorded_by uuid references auth.users(id), recorded_at timestamptz not null default now(),
  constraint recusal_needs_reason check (vote <> 'recused' or btrim(coalesce(recusal_reason,'')) <> ''));
create unique index if not exists council_vote_member_uq on public.council_vote (agenda_item_id, lower(btrim(member_name)));

alter table public.council_agenda_result enable row level security;
alter table public.council_vote enable row level security;
drop policy if exists council_agenda_result_read on public.council_agenda_result;
create policy council_agenda_result_read on public.council_agenda_result for select to authenticated
  using (exists (select 1 from council_session s where s.id = session_id and _council_reader(s.municipality_id) and (s.is_demo or not is_demo_staff())));
drop policy if exists council_vote_read on public.council_vote;
create policy council_vote_read on public.council_vote for select to authenticated
  using (exists (select 1 from agenda_item a join council_session s on s.id = a.session_id where a.id = agenda_item_id and _council_reader(s.municipality_id) and (s.is_demo or not is_demo_staff())));

-- p_votes: jsonb array of {"member": text, "vote": for|against|abstain|absent|recused, "reason": text?}. Replaces the item's votes atomically.
create or replace function public.council_record_votes(p_agenda uuid, p_votes jsonb, p_category text default null, p_result text default null, p_tie_break boolean default false, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); a agenda_item%rowtype; s council_session%rowtype; v jsonb; nm text; vt text; rs text;
  c_for int := 0; c_against int := 0; c_abstain int := 0; c_recused int := 0; c_absent int := 0; present int; n int; cat text := p_category; k text; ver text := 'needs_verification'; res text;
begin
  select * into a from agenda_item where id = p_agenda and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into s from council_session where id = a.session_id and municipality_id = m;
  if s.status in ('minutes_approved','cancelled') then raise exception 'session_locked' using errcode = '22023'; end if;
  if s.members_total is null or s.members_present is null then raise exception 'attendance_required' using errcode = '22023'; end if;
  if p_votes is null or jsonb_typeof(p_votes) <> 'array' or jsonb_array_length(p_votes) = 0 then raise exception 'bad_input' using errcode = '22023'; end if;
  n := jsonb_array_length(p_votes);
  if n > s.members_total then raise exception 'too_many_members' using errcode = '22023'; end if;
  delete from council_vote where agenda_item_id = p_agenda;
  for v in select * from jsonb_array_elements(p_votes) loop
    nm := btrim(coalesce(v->>'member','')); vt := v->>'vote'; rs := nullif(left(btrim(coalesce(v->>'reason','')),500),'');
    if nm = '' or vt is null or vt not in ('for','against','abstain','absent','recused') then raise exception 'bad_input' using errcode = '22023'; end if;
    if vt = 'recused' and rs is null then raise exception 'recusal_reason_required' using errcode = '22023'; end if;
    insert into council_vote (agenda_item_id, municipality_id, member_name, vote, recusal_reason, recorded_by) values (p_agenda, m, left(nm,200), vt, case when vt = 'recused' then rs end, auth.uid());
    if vt = 'for' then c_for := c_for + 1; elsif vt = 'against' then c_against := c_against + 1; elsif vt = 'abstain' then c_abstain := c_abstain + 1; elsif vt = 'recused' then c_recused := c_recused + 1; else c_absent := c_absent + 1; end if;
  end loop;
  present := n - c_absent;
  if present > s.members_present then raise exception 'present_exceeds_session' using errcode = '22023'; end if;
  if cat is null then select category into cat from municipal_decision where agenda_item_id = p_agenda and municipality_id = m order by created_at limit 1; end if;
  if cat is not null then
    select majority_kind, verification into k, ver from council_majority_rule where category = cat;
    if not found then raise exception 'bad_input' using errcode = '22023'; end if;
  end if;
  res := coalesce(p_result, case when c_for = c_against and c_for > 0 and not coalesce(p_tie_break,false) then 'tie' else 'unverified' end);
  if res not in ('carried','not_carried','tie','unverified') then raise exception 'bad_input' using errcode = '22023'; end if;
  insert into council_agenda_result (agenda_item_id, session_id, municipality_id, decision_category, required_majority, majority_verification, total_members, present_count,
      votes_for, votes_against, votes_abstain, votes_recused, votes_absent, result, tie_break_by_chair, result_note, recorded_by, recorded_at)
  values (p_agenda, s.id, m, cat, k, coalesce(ver,'needs_verification'), s.members_total, present, c_for, c_against, c_abstain, c_recused, c_absent, res, coalesce(p_tie_break,false), nullif(left(btrim(coalesce(p_note,'')),1000),''), auth.uid(), now())
  on conflict (agenda_item_id) do update set decision_category = excluded.decision_category, required_majority = excluded.required_majority, majority_verification = excluded.majority_verification,
      total_members = excluded.total_members, present_count = excluded.present_count, votes_for = excluded.votes_for, votes_against = excluded.votes_against, votes_abstain = excluded.votes_abstain,
      votes_recused = excluded.votes_recused, votes_absent = excluded.votes_absent, result = excluded.result, tie_break_by_chair = excluded.tie_break_by_chair, result_note = excluded.result_note,
      recorded_by = excluded.recorded_by, recorded_at = excluded.recorded_at;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'council.votes_recorded', 'agenda_item', p_agenda::text,
    jsonb_build_object('for', c_for, 'against', c_against, 'abstain', c_abstain, 'recused', c_recused, 'absent', c_absent, 'result', res));
end $$;

-- ============ A3) Minutes (محضر): versioned draft -> approved -> signed-copy reference; append-only corrections ============
create table if not exists public.council_minutes (
  session_id uuid primary key references public.council_session(id),
  municipality_id uuid not null references public.municipality(id),
  status text not null default 'draft' check (status in ('draft','approved','signed')),
  confidential boolean not null default false,
  current_version int not null default 0,
  approved_version int, approved_by uuid references auth.users(id), approved_at timestamptz,
  signed_copy_ref text,                              -- reference to the signed paper/scanned copy (archive no., link); no file is stored here
  signed_ref_by uuid references auth.users(id), signed_ref_at timestamptz,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  constraint approved_has_version check (status = 'draft' or approved_version is not null),
  constraint signed_has_ref check (status <> 'signed' or btrim(coalesce(signed_copy_ref,'')) <> ''));
create table if not exists public.council_minutes_version (
  session_id uuid not null references public.council_minutes(session_id),
  version int not null check (version >= 1),
  body text not null check (btrim(body) <> '' and length(body) <= 60000),
  saved_by uuid references auth.users(id), saved_at timestamptz not null default now(),
  primary key (session_id, version));
create table if not exists public.council_minutes_correction (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.council_minutes(session_id),
  seq int not null check (seq >= 1),
  version_ref int not null,                          -- the approved version being corrected
  section_ref text, original_text text,
  corrected_text text not null check (btrim(corrected_text) <> ''),
  reason text not null check (btrim(reason) <> ''),
  authority_ref text,                                -- who/what decided the correction (council decision, session): يلزم تحقق من الإجراء القانوني
  entered_by uuid references auth.users(id), entered_at timestamptz not null default now(),
  unique (session_id, seq));

create or replace function public._council_append_only() returns trigger language plpgsql as $$
begin raise exception 'append_only' using errcode = '22023'; end $$;
drop trigger if exists council_minutes_version_ro on public.council_minutes_version;
create trigger council_minutes_version_ro before update or delete on public.council_minutes_version for each row execute function public._council_append_only();
drop trigger if exists council_minutes_correction_ro on public.council_minutes_correction;
create trigger council_minutes_correction_ro before update or delete on public.council_minutes_correction for each row execute function public._council_append_only();

create or replace function public._council_minutes_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'append_only' using errcode = '22023'; end if;
  if old.status in ('approved','signed') and new.status = 'draft' then raise exception 'minutes_locked' using errcode = '22023'; end if;
  if old.status = 'signed' and new.status <> 'signed' then raise exception 'minutes_locked' using errcode = '22023'; end if;
  if old.approved_version is not null and new.approved_version is distinct from old.approved_version then raise exception 'minutes_locked' using errcode = '22023'; end if;
  if old.signed_copy_ref is not null and new.signed_copy_ref is distinct from old.signed_copy_ref then raise exception 'minutes_locked' using errcode = '22023'; end if;
  if old.status <> 'draft' and new.current_version is distinct from old.current_version then raise exception 'minutes_locked' using errcode = '22023'; end if;
  return new;
end $$;
drop trigger if exists council_minutes_guard on public.council_minutes;
create trigger council_minutes_guard before update or delete on public.council_minutes for each row execute function public._council_minutes_guard();

create or replace function public._council_minutes_version_guard() returns trigger language plpgsql as $$
begin
  if (select status from council_minutes where session_id = new.session_id) <> 'draft' then raise exception 'minutes_locked' using errcode = '22023'; end if;
  return new;
end $$;
drop trigger if exists council_minutes_version_guard on public.council_minutes_version;
create trigger council_minutes_version_guard before insert on public.council_minutes_version for each row execute function public._council_minutes_version_guard();

alter table public.council_minutes enable row level security;
alter table public.council_minutes_version enable row level security;
alter table public.council_minutes_correction enable row level security;
drop policy if exists council_minutes_read on public.council_minutes;
create policy council_minutes_read on public.council_minutes for select to authenticated
  using (exists (select 1 from council_session s where s.id = council_minutes.session_id and is_staff(s.municipality_id) and (not council_minutes.confidential or _council_reader(s.municipality_id)) and (s.is_demo or not is_demo_staff())));
drop policy if exists council_minutes_version_read on public.council_minutes_version;
create policy council_minutes_version_read on public.council_minutes_version for select to authenticated
  using (exists (select 1 from council_minutes h join council_session s on s.id = h.session_id where h.session_id = council_minutes_version.session_id and is_staff(s.municipality_id) and (not h.confidential or _council_reader(s.municipality_id)) and (s.is_demo or not is_demo_staff())));
drop policy if exists council_minutes_correction_read on public.council_minutes_correction;
create policy council_minutes_correction_read on public.council_minutes_correction for select to authenticated
  using (exists (select 1 from council_minutes h join council_session s on s.id = h.session_id where h.session_id = council_minutes_correction.session_id and is_staff(s.municipality_id) and (not h.confidential or _council_reader(s.municipality_id)) and (s.is_demo or not is_demo_staff())));

-- Save a new draft version (only while the minute is a draft). Returns the new version number.
create or replace function public.council_minutes_save(p_session uuid, p_body text, p_confidential boolean default null)
returns int language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); s council_session%rowtype; h council_minutes%rowtype; v int;
begin
  select * into s from council_session where id = p_session and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if s.status = 'cancelled' then raise exception 'session_locked' using errcode = '22023'; end if;
  if btrim(coalesce(p_body,'')) = '' or length(p_body) > 60000 then raise exception 'bad_input' using errcode = '22023'; end if;
  insert into council_minutes (session_id, municipality_id, created_by) values (p_session, m, auth.uid()) on conflict (session_id) do nothing;
  select * into h from council_minutes where session_id = p_session for update;
  if h.status <> 'draft' then raise exception 'minutes_locked' using errcode = '22023'; end if;
  v := h.current_version + 1;
  insert into council_minutes_version (session_id, version, body, saved_by) values (p_session, v, p_body, auth.uid());
  update council_minutes set current_version = v, confidential = coalesce(p_confidential, confidential) where session_id = p_session;
  if s.status in ('planned','held') then update council_session set status = 'minutes_draft' where id = p_session; end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'council.minutes_saved', 'council_session', p_session::text, jsonb_build_object('version', v));
  return v;
end $$;

create or replace function public.council_minutes_set_confidential(p_session uuid, p_flag boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  update council_minutes set confidential = coalesce(p_flag,false) where session_id = p_session and municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'council.minutes_confidential', 'council_session', p_session::text, jsonb_build_object('confidential', coalesce(p_flag,false)));
end $$;

-- Approval records the human decision that the current draft is the approved text; it freezes the text (changes only via the correction log).
create or replace function public.council_minutes_approve(p_session uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); h council_minutes%rowtype;
begin
  select * into h from council_minutes where session_id = p_session and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if h.status <> 'draft' then raise exception 'minutes_locked' using errcode = '22023'; end if;
  if h.current_version < 1 then raise exception 'bad_input' using errcode = '22023'; end if;
  update council_minutes set status = 'approved', approved_version = h.current_version, approved_by = auth.uid(), approved_at = now() where session_id = p_session;
  update council_session set status = 'minutes_approved' where id = p_session and municipality_id = m;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'council.minutes_approved', 'council_session', p_session::text, jsonb_build_object('version', h.current_version));
end $$;

-- Registers a REFERENCE to the signed copy (archive number / link). The signature itself happens outside the system.
create or replace function public.council_minutes_attach_signed(p_session uuid, p_ref text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); h council_minutes%rowtype; r text := left(btrim(coalesce(p_ref,'')),500);
begin
  if r = '' then raise exception 'bad_input' using errcode = '22023'; end if;
  select * into h from council_minutes where session_id = p_session and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if h.status <> 'approved' then raise exception 'minutes_not_approved' using errcode = '22023'; end if;
  update council_minutes set status = 'signed', signed_copy_ref = r, signed_ref_by = auth.uid(), signed_ref_at = now() where session_id = p_session;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'council.minutes_signed_ref', 'council_session', p_session::text, '{}'::jsonb);
end $$;

-- Append-only correction entry for an approved/signed minute.
create or replace function public.council_minutes_correct(p_session uuid, p_section text, p_original text, p_corrected text, p_reason text, p_authority text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); h council_minutes%rowtype; i uuid; n int;
begin
  if btrim(coalesce(p_corrected,'')) = '' or btrim(coalesce(p_reason,'')) = '' then raise exception 'bad_input' using errcode = '22023'; end if;
  select * into h from council_minutes where session_id = p_session and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if h.status = 'draft' then raise exception 'minutes_still_draft' using errcode = '22023'; end if;
  select coalesce(max(seq),0) + 1 into n from council_minutes_correction where session_id = p_session;
  insert into council_minutes_correction (session_id, seq, version_ref, section_ref, original_text, corrected_text, reason, authority_ref, entered_by)
  values (p_session, n, h.approved_version, nullif(left(btrim(coalesce(p_section,'')),300),''), nullif(left(btrim(coalesce(p_original,'')),5000),''), left(btrim(p_corrected),5000), left(btrim(p_reason),1000), nullif(left(btrim(coalesce(p_authority,'')),500),''), auth.uid()) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'council.minutes_corrected', 'council_session', p_session::text, jsonb_build_object('seq', n));
  return i;
end $$;

-- ============ D) Rule review workflow + legal update management ============
alter table public.legal_rule add column if not exists reviewed_by uuid references auth.users(id), add column if not exists reviewed_at timestamptz, add column if not exists review_note text;

create table if not exists public.legal_rule_history (
  id bigint generated always as identity primary key,
  rule_id text not null references public.legal_rule(rule_id),
  from_status text, to_status text not null, note text not null,
  rule_version int, actor uuid references auth.users(id), created_at timestamptz not null default now());
alter table public.legal_rule_history enable row level security;
drop policy if exists legal_rule_history_read on public.legal_rule_history;
create policy legal_rule_history_read on public.legal_rule_history for select to authenticated using (true);
drop trigger if exists legal_rule_history_ro on public.legal_rule_history;
create trigger legal_rule_history_ro before update or delete on public.legal_rule_history for each row execute function public._council_append_only();

-- The "legal approver" workflow: admin only. A rule cannot become 'verified' while its original text is not loaded.
create or replace function public.legal_rule_review(p_rule_id text, p_status text, p_note text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r legal_rule%rowtype; m uuid; n text := nullif(left(btrim(coalesce(p_note,'')),1000),'');
begin
  if not is_any_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('verified','pending_review','superseded','repealed','not_applicable') then raise exception 'bad_input' using errcode = '22023'; end if;
  if n is null then raise exception 'note_required' using errcode = '22023'; end if;
  select * into r from legal_rule where rule_id = p_rule_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.review_status = p_status then raise exception 'no_change' using errcode = '22023'; end if;
  if p_status = 'verified' and not r.original_text_loaded then raise exception 'original_text_required' using errcode = '22023'; end if;
  select municipality_id into m from staff_member where user_id = auth.uid() and role = 'admin' order by created_at limit 1;
  update legal_rule set review_status = p_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = n, last_checked_on = current_date where rule_id = p_rule_id;
  insert into legal_rule_history (rule_id, from_status, to_status, note, rule_version, actor) values (p_rule_id, r.review_status, p_status, n, r.version, auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'legal.rule_reviewed', 'legal_rule', p_rule_id, jsonb_build_object('from', r.review_status, 'to', p_status));
end $$;

create table if not exists public.legal_update (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipality(id),
  source text not null check (btrim(source) <> ''),
  received_on date not null,
  summary text not null check (btrim(summary) <> ''),
  affected_rules text[] not null default '{}',
  status text not null default 'received' check (status in ('received','under_review','approved','rejected')),
  reviewer_note text, reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  constraint decided_has_review check (status in ('received','under_review') or (reviewed_by is not null and reviewed_at is not null and btrim(coalesce(reviewer_note,'')) <> '')));
alter table public.legal_update enable row level security;
drop policy if exists legal_update_staff_read on public.legal_update;
create policy legal_update_staff_read on public.legal_update for select to authenticated using (is_staff(municipality_id));

create or replace function public.legal_update_add(p_source text, p_received_on date, p_summary text, p_affected text[] default '{}')
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid; aff text[] := coalesce(p_affected, '{}');
begin
  if btrim(coalesce(p_source,'')) = '' or btrim(coalesce(p_summary,'')) = '' or p_received_on is null or p_received_on > current_date + 1 or cardinality(aff) > 50 then raise exception 'bad_input' using errcode = '22023'; end if;
  if exists (select 1 from unnest(aff) a where not exists (select 1 from legal_rule r where r.rule_id = a)) then raise exception 'unknown_rule' using errcode = '22023'; end if;
  insert into legal_update (municipality_id, source, received_on, summary, affected_rules, created_by)
  values (m, left(btrim(p_source),500), p_received_on, left(btrim(p_summary),5000), aff, auth.uid()) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'legal.update_received', 'legal_update', i::text, jsonb_build_object('affected', aff));
  return i;
end $$;

-- Records the decision on an update. It NEVER touches legal_rule: rule changes go through a reviewed migration / legal_rule_review.
create or replace function public.legal_update_review(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); u legal_update%rowtype; n text := nullif(left(btrim(coalesce(p_note,'')),1000),'');
begin
  if not is_any_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('under_review','approved','rejected') then raise exception 'bad_input' using errcode = '22023'; end if;
  select * into u from legal_update where id = p_id and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if u.status in ('approved','rejected') then raise exception 'already_decided' using errcode = '22023'; end if;
  if p_status <> 'under_review' and n is null then raise exception 'note_required' using errcode = '22023'; end if;
  update legal_update set status = p_status, reviewer_note = coalesce(n, reviewer_note), reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'legal.update_reviewed', 'legal_update', p_id::text, jsonb_build_object('from', u.status, 'to', p_status));
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'council_set_majority_rule(text,text,text,boolean)','council_record_votes(uuid,jsonb,text,text,boolean,text)',
    'council_minutes_save(uuid,text,boolean)','council_minutes_set_confidential(uuid,boolean)','council_minutes_approve(uuid)',
    'council_minutes_attach_signed(uuid,text)','council_minutes_correct(uuid,text,text,text,text,text)',
    'legal_rule_review(text,text,text)','legal_update_add(text,date,text,text[])','legal_update_review(uuid,text,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
