-- 0028: citizen "start this transaction" registration (kiosk + app). Additive and non-destructive.
-- A registration is an INITIAL request recorded for the municipality to follow up. It is not a final filing of the
-- transaction: required documents, fees and the legal effect of electronic intake remain subject to legal review.

alter table public.citizen_request
  add column if not exists service_slug text,
  add column if not exists service_title text,
  add column if not exists applicant_name text,
  add column if not exists channel text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'citizen_request_channel_chk') then
    alter table public.citizen_request add constraint citizen_request_channel_chk check (channel is null or channel in ('kiosk','app'));
  end if;
end $$;

create or replace function public.submit_service_request(
  p_slug text, p_service_slug text, p_service_title text, p_name text, p_phone text, p_note text default null, p_channel text default 'app'
) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  m municipality%rowtype; code text := ''; bytes bytea; alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i int; rid uuid; nm text := btrim(coalesce(p_name, '')); ph text := btrim(coalesce(p_phone, '')); ttl text := btrim(coalesce(p_service_title, ''));
  note text := nullif(left(btrim(coalesce(p_note, '')), 1000), '');
begin
  select * into m from municipality where slug = p_slug;
  if not found then raise exception 'unknown_municipality' using errcode = 'P0002'; end if;
  if p_channel is null or p_channel not in ('kiosk','app') then raise exception 'invalid_channel' using errcode = '22023'; end if;
  if p_service_slug is null or p_service_slug !~ '^[A-Za-z0-9._-]{1,120}$' or char_length(ttl) < 1 or char_length(ttl) > 300 then raise exception 'invalid_service' using errcode = '22023'; end if;
  if char_length(nm) < 2 or char_length(nm) > 120 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if ph !~ '^[0-9+ ()-]{6,20}$' then raise exception 'invalid_phone' using errcode = '22023'; end if;
  if (select count(*) from citizen_request where municipality_id = m.id and kind = 'service_request' and created_at > now() - interval '1 hour') >= 200
     or (select count(*) from citizen_request where contact_phone = ph and created_at > now() - interval '1 hour') >= 5
  then raise exception 'rate_limited' using errcode = '54000'; end if;
  bytes := extensions.gen_random_bytes(12);
  for i in 0..11 loop code := code || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1); end loop;
  insert into citizen_request (municipality_id, kind, service_slug, service_title, applicant_name, description, contact_phone, channel, token_hash, is_demo)
  values (m.id, 'service_request', p_service_slug, ttl, nm, note, ph, p_channel, public._track_hash(code), m.is_demo)
  returning id into rid;
  insert into request_status_history (request_id, from_status, to_status, internal) values (rid, null, 'received', false);
  insert into audit_event (municipality_id, action, entity, entity_id, detail) values (m.id, 'service_request.submitted', 'citizen_request', rid::text, jsonb_build_object('channel', p_channel));
  return code;
end $$;

-- Tracking for both reports and service requests (track_report is left unchanged).
create or replace function public.track_request(p_code text)
returns table (kind text, status request_status, report_type text, service_title text, created_at timestamptz, updated_at timestamptz, updates jsonb)
language sql stable security definer set search_path = public, extensions as $$
  select r.kind, r.status, r.report_type, r.service_title, r.created_at, r.updated_at,
         coalesce((select jsonb_agg(jsonb_build_object('status', h.to_status, 'note', h.note, 'at', h.created_at) order by h.created_at)
                   from request_status_history h where h.request_id = r.id and h.internal = false), '[]'::jsonb)
  from citizen_request r
  where char_length(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g')) = 12
    and r.token_hash = public._track_hash(p_code) $$;

revoke all on function public.submit_service_request(text,text,text,text,text,text,text), public.track_request(text) from public, anon, authenticated;
grant execute on function public.submit_service_request(text,text,text,text,text,text,text), public.track_request(text) to anon, authenticated;
