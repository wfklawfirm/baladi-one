-- Editable letterhead name for the municipality + extended legal-profile RPC (applied in production).
alter table public.municipality add column if not exists letterhead_name_ar text check (letterhead_name_ar is null or length(letterhead_name_ar) <= 120);
drop function if exists public.muni_set_legal_profile(text, text, text, boolean);
create or replace function public.muni_set_legal_profile(p_governorate text, p_district text, p_note text default null, p_verified boolean default false, p_letterhead text default null) returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  update municipality set governorate_ar = nullif(left(btrim(coalesce(p_governorate,'')),80),''), district_ar = nullif(left(btrim(coalesce(p_district,'')),80),''),
    letterhead_name_ar = nullif(left(btrim(coalesce(p_letterhead,'')),120),''),
    legal_profile_note = nullif(left(btrim(coalesce(p_note,'')),500),''),
    legal_profile_verified_on = case when coalesce(p_verified,false) then (now() at time zone 'Asia/Beirut')::date else null end where id = m;
  perform _adm_audit(m, 'municipality.legal_profile_set', 'municipality', m::text, jsonb_build_object('verified', coalesce(p_verified,false)));
end $$;
revoke all on function public.muni_set_legal_profile(text, text, text, boolean, text) from public, anon;
grant execute on function public.muni_set_legal_profile(text, text, text, boolean, text) to authenticated;
