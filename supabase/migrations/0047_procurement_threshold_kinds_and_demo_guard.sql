-- 0047: (1) procurement_threshold_add accepts the threshold kind and the legal source/provision links (0040 columns), so competence / approval / financial-control
--          values can be loaded WITH their source instead of being forced into the 'method' kind; every new row still starts pending_review.
--       (2) procurement_threshold_set_review records who reviewed and when (0040 columns reviewed_by / last_reviewed_at).
--       (3) F-3 (docs/PROCUREMENT_SECURITY_AUDIT.md): demo staff attached to a REAL (non-demo) municipality can no longer act through _council_muni().
-- No legal value is stored or assumed. Production check before applying: the only municipality is a demo one, so (3) changes nothing today.

-- (1) -----------------------------------------------------------------------------------------------------------------------------
drop function if exists public.procurement_threshold_add(text, numeric, numeric, text, date, date, text);
create or replace function public.procurement_threshold_add(
  p_method text, p_min numeric, p_max numeric, p_currency text, p_from date, p_to date, p_source text,
  p_kind text default 'method', p_legal_source uuid default null, p_provision uuid default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid;
begin
  if p_kind is null or p_kind not in ('method','competence','admin_approval','financial_control') then raise exception 'bad_input' using errcode = '22023'; end if;
  if (p_kind = 'method' and (p_method is null or p_method not in ('open_tender','two_stage','quotations','proposals','negotiated','invoice','framework')))
     or (p_kind <> 'method' and p_method is not null and p_method not in ('open_tender','two_stage','quotations','proposals','negotiated','invoice','framework'))
     or p_currency not in ('LBP','USD')
     or p_min is null or p_min < 0 or (p_max is not null and p_max < p_min) or p_from is null or (p_to is not null and p_to < p_from) or p_min >= 1e13 or (p_max is not null and p_max >= 1e13) then raise exception 'bad_input' using errcode = '22023'; end if;
  if btrim(coalesce(p_source,'')) = '' then raise exception 'source_required' using errcode = '22023'; end if;
  if p_legal_source is not null and not exists (select 1 from procurement_legal_source where id = p_legal_source) then raise exception 'bad_input' using errcode = '22023'; end if;
  if p_provision is not null and not exists (select 1 from procurement_provision where id = p_provision) then raise exception 'bad_input' using errcode = '22023'; end if;
  insert into procurement_threshold (municipality_id, method, min_value, max_value, currency, effective_from, effective_to, source, threshold_kind, legal_source_id, provision_id, created_by)
  values (m, p_method, round(p_min,2), round(p_max,2), p_currency, p_from, p_to, left(btrim(p_source),1000), p_kind, p_legal_source, p_provision, auth.uid()) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail)
  values (m, auth.uid(), 'procurement.threshold_added', 'procurement_threshold', i::text, jsonb_build_object('kind', p_kind, 'method', p_method, 'currency', p_currency));
  return i;
end $$;
revoke all on function public.procurement_threshold_add(text,numeric,numeric,text,date,date,text,text,uuid,uuid) from public, anon;
grant execute on function public.procurement_threshold_add(text,numeric,numeric,text,date,date,text,text,uuid,uuid) to authenticated;

-- (2) -----------------------------------------------------------------------------------------------------------------------------
create or replace function public.procurement_threshold_set_review(p_id uuid, p_status text, p_effective_to date default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni();
begin
  if p_status is null or p_status not in ('pending_review','verified','rejected','superseded') then raise exception 'bad_input' using errcode = '22023'; end if;
  update procurement_threshold set review_status = p_status, effective_to = coalesce(p_effective_to, effective_to), reviewed_by = auth.uid(), last_reviewed_at = now()
   where id = p_id and municipality_id = m and (p_effective_to is null or p_effective_to >= effective_from);
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.threshold_review', 'procurement_threshold', p_id::text, jsonb_build_object('status', p_status, 'effective_to', p_effective_to));
end $$;
revoke all on function public.procurement_threshold_set_review(uuid,text,date) from public, anon;
grant execute on function public.procurement_threshold_set_review(uuid,text,date) to authenticated;

-- (3) F-3 -------------------------------------------------------------------------------------------------------------------------
create or replace function public._council_muni() returns uuid language plpgsql stable security definer set search_path to 'public' as $f$
declare m uuid;
begin
  select s.municipality_id into m from staff_member s join municipality mu on mu.id = s.municipality_id
   where s.user_id = auth.uid() and s.role in ('mayor','admin') and (not s.is_demo or mu.is_demo) order by s.created_at limit 1;
  if m is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return m;
end $f$;
-- grants of _council_muni() are intentionally untouched (create or replace keeps them)
