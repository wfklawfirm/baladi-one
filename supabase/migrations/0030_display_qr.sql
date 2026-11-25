-- Screensaver QR code (to the AIJUR site) can be switched off from the conference-mode settings; default on.
alter table public.display_setting add column if not exists screensaver_qr boolean not null default true;

drop function if exists public.adm_display_set(boolean, int);
create or replace function public.adm_display_set(p_enabled boolean, p_idle int, p_qr boolean default true) returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  if p_enabled is null or p_idle is null or p_qr is null or p_idle not in (30, 60, 120, 300) then raise exception 'bad_input' using errcode = '22023'; end if;
  insert into display_setting (municipality_id, screensaver_enabled, idle_seconds, screensaver_qr, updated_at) values (m, p_enabled, p_idle, p_qr, now())
  on conflict (municipality_id) do update set screensaver_enabled = excluded.screensaver_enabled, idle_seconds = excluded.idle_seconds, screensaver_qr = excluded.screensaver_qr, updated_at = now();
  perform _adm_audit(m, 'display.setting_set', 'display_setting', m::text, jsonb_build_object('enabled', p_enabled, 'idle_seconds', p_idle, 'qr', p_qr));
end $$;
revoke all on function public.adm_display_set(boolean, int, boolean) from public, anon, authenticated;
grant execute on function public.adm_display_set(boolean, int, boolean) to authenticated;
