-- Display settings (conference mode): idle screensaver on/off and idle timeout. Public read (non-sensitive), mayor/admin write via RPC with audit.
create table if not exists public.display_setting (
  municipality_id uuid primary key references municipality(id),
  screensaver_enabled boolean not null default true,
  idle_seconds int not null default 60 check (idle_seconds in (30, 60, 120, 300)),
  updated_at timestamptz not null default now());
alter table public.display_setting enable row level security;
drop policy if exists display_setting_public_read on public.display_setting;
create policy display_setting_public_read on public.display_setting for select to anon, authenticated using (true);
revoke all on public.display_setting from public, anon, authenticated;
grant select on public.display_setting to anon, authenticated;

create or replace function public.adm_display_set(p_enabled boolean, p_idle int) returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  if p_enabled is null or p_idle is null or p_idle not in (30, 60, 120, 300) then raise exception 'bad_input' using errcode = '22023'; end if;
  insert into display_setting (municipality_id, screensaver_enabled, idle_seconds, updated_at) values (m, p_enabled, p_idle, now())
  on conflict (municipality_id) do update set screensaver_enabled = excluded.screensaver_enabled, idle_seconds = excluded.idle_seconds, updated_at = now();
  perform _adm_audit(m, 'display.setting_set', 'display_setting', m::text, jsonb_build_object('enabled', p_enabled, 'idle_seconds', p_idle));
end $$;
revoke all on function public.adm_display_set(boolean, int) from public, anon, authenticated;
grant execute on function public.adm_display_set(boolean, int) to authenticated;
