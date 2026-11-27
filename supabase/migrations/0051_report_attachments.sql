-- 0051: photo / file attachments on citizen reports. Stored as bytea (no public bucket, no service key). Anonymous citizens may only add files
-- to the report they just filed, proving ownership with its tracking code (within 30 minutes of filing). Staff read through RLS.
create table if not exists public.report_attachment (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.citizen_request(id) on delete cascade,
  file_name text not null check (char_length(file_name) between 1 and 120),
  mime text not null check (mime in ('image/jpeg','image/png','image/webp','application/pdf')),
  size_bytes integer not null check (size_bytes between 1 and 2097152),
  data bytea not null,
  created_at timestamptz not null default now()
);
create index if not exists report_attachment_request_idx on public.report_attachment(request_id);
alter table public.report_attachment enable row level security;
revoke all on public.report_attachment from public, anon, authenticated;
grant select on public.report_attachment to authenticated;
drop policy if exists report_attachment_staff_read on public.report_attachment;
create policy report_attachment_staff_read on public.report_attachment for select to authenticated
  using (exists (select 1 from public.citizen_request r where r.id = request_id));   -- citizen_request RLS (staff of that municipality; demo rules) applies inside

create or replace function public.report_attach(p_code text, p_name text, p_mime text, p_data bytea)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare r citizen_request%rowtype; aid uuid; n int; nm text := left(regexp_replace(btrim(coalesce(p_name,'')), '[\\/\x00-\x1f]', '_', 'g'), 120);
        ok boolean;
begin
  if char_length(regexp_replace(coalesce(p_code,''), '[^A-Za-z0-9]', '', 'g')) <> 12 then raise exception 'invalid_code' using errcode = '22023'; end if;
  select * into r from citizen_request where kind = 'report' and token_hash = public._track_hash(p_code);
  if not found then raise exception 'invalid_code' using errcode = '22023'; end if;
  if r.created_at < now() - interval '30 minutes' then raise exception 'too_late' using errcode = '22023'; end if;
  if nm = '' then nm := 'attachment'; end if;
  if p_data is null or length(p_data) < 8 or length(p_data) > 2097152 then raise exception 'invalid_file' using errcode = '22023'; end if;
  ok := case p_mime
    when 'image/jpeg' then get_byte(p_data,0)=255 and get_byte(p_data,1)=216 and get_byte(p_data,2)=255
    when 'image/png' then substring(p_data from 1 for 4) = '\x89504e47'::bytea
    when 'image/webp' then substring(p_data from 1 for 4) = '\x52494646'::bytea and substring(p_data from 9 for 4) = '\x57454250'::bytea
    when 'application/pdf' then substring(p_data from 1 for 4) = '\x25504446'::bytea
    else false end;
  if not ok then raise exception 'invalid_file' using errcode = '22023'; end if;
  select count(*) into n from report_attachment where request_id = r.id;
  if n >= 3 then raise exception 'too_many' using errcode = '54000'; end if;
  insert into report_attachment(request_id, file_name, mime, size_bytes, data) values (r.id, nm, p_mime, length(p_data), p_data) returning id into aid;
  insert into audit_event (municipality_id, action, entity, entity_id, detail) values (r.municipality_id, 'report.attachment_added', 'citizen_request', r.id::text, jsonb_build_object('mime', p_mime, 'bytes', length(p_data)));
  return aid;
end $$;
revoke all on function public.report_attach(text,text,text,bytea) from public, anon, authenticated;
grant execute on function public.report_attach(text,text,text,bytea) to anon, authenticated;
