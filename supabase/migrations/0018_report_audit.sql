-- Reporting Center: audit trail for report exports (mayor/admin only). NOT applied automatically.
-- p_kind: report kind, optionally with the format suffix ("executive.xlsx", "requests.print").
create or replace function public.report_export_log(p_kind text, p_period text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid; k text := split_part(coalesce(p_kind, ''), '.', 1); f text := nullif(split_part(coalesce(p_kind, ''), '.', 2), '');
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select municipality_id into m from staff_member where user_id = auth.uid() and role in ('mayor','admin') order by created_at limit 1;
  if m is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if k not in ('executive','requests','collections','decisions','staff') then raise exception 'bad_kind' using errcode = '22023'; end if;
  if f is not null and f not in ('xlsx','print') then raise exception 'bad_kind' using errcode = '22023'; end if;
  if p_period is null or p_period !~ '^(month|quarter|year|custom:\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2})$' then raise exception 'bad_period' using errcode = '22023'; end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail)
  values (m, auth.uid(), 'report.exported', 'report', k, jsonb_build_object('period', p_period, 'format', coalesce(f, 'xlsx')));
end $$;
revoke all on function public.report_export_log(text, text) from public, anon;
grant execute on function public.report_export_log(text, text) to authenticated;
