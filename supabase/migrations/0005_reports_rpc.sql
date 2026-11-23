-- BALADI ONE Sprint 2: citizen reports + secure tracking via SECURITY DEFINER RPCs (no service-role key in the app).
-- Tracking code = 12 chars from an unambiguous 31-character alphabet (~59 bits); only its SHA-256 is stored.
create or replace function public._track_hash(p_code text) returns text
language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex') $$;

create or replace function public.submit_report(
  p_slug text, p_type text, p_description text, p_location text default null, p_phone text default null
) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  m municipality%rowtype; code text := ''; bytes bytea; alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i int; rid uuid; ph text := nullif(btrim(p_phone), '');
begin
  select * into m from municipality where slug = p_slug;
  if not found then raise exception 'unknown_municipality' using errcode = 'P0002'; end if;
  if p_type not in ('lighting','waste','roads','water','noise','other') then raise exception 'invalid_type' using errcode = '22023'; end if;
  p_description := btrim(coalesce(p_description, ''));
  if char_length(p_description) < 10 or char_length(p_description) > 1000 then raise exception 'invalid_description' using errcode = '22023'; end if;
  p_location := left(btrim(coalesce(p_location, '')), 300);
  if ph is not null and ph !~ '^[0-9+ ()-]{6,20}$' then raise exception 'invalid_phone' using errcode = '22023'; end if;
  -- crude abuse limits (per municipality and per phone)
  if (select count(*) from citizen_request where municipality_id = m.id and kind = 'report' and created_at > now() - interval '1 hour') >= 200
     or (ph is not null and (select count(*) from citizen_request where contact_phone = ph and created_at > now() - interval '1 hour') >= 5)
  then raise exception 'rate_limited' using errcode = '54000'; end if;
  bytes := extensions.gen_random_bytes(12);
  for i in 0..11 loop code := code || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1); end loop;
  insert into citizen_request (municipality_id, kind, report_type, description, location_text, contact_phone, token_hash, is_demo)
  values (m.id, 'report', p_type, p_description, nullif(p_location, ''), ph, public._track_hash(code), m.is_demo)
  returning id into rid;
  insert into request_status_history (request_id, from_status, to_status, internal) values (rid, null, 'received', false);
  insert into audit_event (municipality_id, action, entity, entity_id) values (m.id, 'report.submitted', 'citizen_request', rid::text);
  return code;
end $$;

create or replace function public.track_report(p_code text)
returns table (status request_status, report_type text, created_at timestamptz, updated_at timestamptz, updates jsonb)
language sql stable security definer set search_path = public, extensions as $$
  select r.status, r.report_type, r.created_at, r.updated_at,
         coalesce((select jsonb_agg(jsonb_build_object('status', h.to_status, 'note', h.note, 'at', h.created_at) order by h.created_at)
                   from request_status_history h where h.request_id = r.id and h.internal = false), '[]'::jsonb)
  from citizen_request r
  where char_length(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g')) = 12
    and r.token_hash = public._track_hash(p_code) $$;

revoke all on function public._track_hash(text), public.submit_report(text,text,text,text,text), public.track_report(text) from public, anon, authenticated;
grant execute on function public.submit_report(text,text,text,text,text), public.track_report(text) to anon, authenticated;
