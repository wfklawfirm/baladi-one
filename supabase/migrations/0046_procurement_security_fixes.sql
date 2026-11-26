-- 0046 (DRAFT — NOT APPLIED): procurement security fixes proposed by docs/PROCUREMENT_SECURITY_AUDIT.md (findings F-1, F-2, F-3).
-- Status: validated only on a local throw-away PGlite database (lib/procurementDb.security.test.ts, group 9). NOT applied to any Supabase project.
-- Apply only after owner review, as a numbered migration, in a window with a backup. Idempotent (create or replace / drop if exists). Depends on 0024, 0040, 0042.

-- F-1  Sealed-bid integrity: once bids exist, the opening time may be postponed but never brought forward; the audit row now records the previous value.
--      Row lock added so a concurrent bid_add / set_bids_open cannot interleave.
create or replace function public.procurement_set_bids_open(p_item uuid, p_open timestamptz)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); cur timestamptz;
begin
  select bids_open_on into cur from procurement_plan_item where id = p_item and municipality_id = m for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if cur is not null and cur <= now() then raise exception 'bids_already_open' using errcode = '22023'; end if;
  if p_open is null or p_open <= now() then raise exception 'bad_input' using errcode = '22023'; end if;
  if cur is not null and p_open < cur and exists (select 1 from procurement_bid where plan_item_id = p_item) then raise exception 'seal_cannot_shorten' using errcode = '22023'; end if;
  update procurement_plan_item set bids_open_on = p_open, updated_at = now() where id = p_item;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.bids_open_set', 'procurement_plan_item', p_item::text,
    jsonb_build_object('open_on', p_open, 'previous_open_on', cur, 'bids_at_change', (select count(*) from procurement_bid where plan_item_id = p_item)));
end $$;

create or replace function public.procurement_bid_add(p_item uuid, p_supplier uuid, p_received date, p_currency text, p_total numeric, p_days int default null, p_warranty text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); i uuid; op timestamptz;
begin
  select bids_open_on into op from procurement_plan_item where id = p_item and municipality_id = m for share;
  if not found or not exists (select 1 from procurement_supplier where id = p_supplier and municipality_id = m) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if op is not null and op <= now() then raise exception 'bids_closed' using errcode = '22023'; end if;
  if p_received is null or p_currency not in ('LBP','USD') or p_total is null or p_total < 0 or p_total >= 1e13 or (p_days is not null and p_days < 0) then raise exception 'bad_input' using errcode = '22023'; end if;
  insert into procurement_bid (municipality_id, plan_item_id, supplier_id, received_on, currency, total_value, delivery_days, warranty_note, bid_note, is_demo, created_by)
  values (m, p_item, p_supplier, p_received, p_currency, round(p_total,2), p_days, nullif(left(btrim(coalesce(p_warranty,'')),500),''), nullif(left(btrim(coalesce(p_note,'')),1000),''), is_demo_staff(), auth.uid()) returning id into i;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.bid_received', 'procurement_bid', i::text, jsonb_build_object('item', p_item));
  return i;
end $$;

-- F-1b Evaluation overwrite trail: the audit row records the previous assessment (re-evaluation was already possible; it is now traceable).
create or replace function public.procurement_bid_evaluate(p_bid uuid, p_compliant boolean, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m uuid := _council_muni(); op timestamptz; prev_c boolean; prev_n text;
begin
  select p.bids_open_on, b.technical_compliant, b.evaluation_note into op, prev_c, prev_n from procurement_bid b join procurement_plan_item p on p.id = b.plan_item_id where b.id = p_bid and b.municipality_id = m;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if op is null or op > now() then raise exception 'bids_sealed' using errcode = '22023'; end if;
  update procurement_bid set technical_compliant = p_compliant, evaluation_note = nullif(left(btrim(coalesce(p_note,'')),1000),'') where id = p_bid;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail) values (m, auth.uid(), 'procurement.bid_evaluated', 'procurement_bid', p_bid::text,
    jsonb_build_object('compliant', p_compliant, 'previous_compliant', prev_c, 'previous_note', prev_n));
end $$;

-- F-2  The legal-source register and provisions were readable by ANY authenticated Auth user (using (true)). Restrict to users who have a staff row.
drop policy if exists procurement_legal_source_read on public.procurement_legal_source;
drop policy if exists procurement_provision_read on public.procurement_provision;
create policy procurement_legal_source_read on public.procurement_legal_source for select to authenticated using (exists (select 1 from public.staff_member s where s.user_id = auth.uid()));
create policy procurement_provision_read on public.procurement_provision for select to authenticated using (exists (select 1 from public.staff_member s where s.user_id = auth.uid()));

-- F-3  (OPTIONAL — needs an owner decision, affects every module that uses _council_muni(); therefore left commented out)
--      Demo staff attached to a real municipality can write to it. Smallest fix: refuse demo staff rows for any real (non-demo) municipality.
-- create or replace function public._council_muni() returns uuid language plpgsql stable security definer set search_path to 'public' as $f$
-- declare m uuid;
-- begin
--   select s.municipality_id into m from staff_member s join municipality mu on mu.id = s.municipality_id
--    where s.user_id = auth.uid() and s.role in ('mayor','admin') and (not s.is_demo or mu.is_demo) order by s.created_at limit 1;
--   if m is null then raise exception 'forbidden' using errcode = '42501'; end if;
--   return m;
-- end $f$;
-- revoke all on function public._council_muni() from public, anon, authenticated;

-- grants are unchanged by create or replace; re-assert for safety
revoke all on function public.procurement_set_bids_open(uuid,timestamptz), public.procurement_bid_add(uuid,uuid,date,text,numeric,int,text,text), public.procurement_bid_evaluate(uuid,boolean,text) from public, anon;
grant execute on function public.procurement_set_bids_open(uuid,timestamptz), public.procurement_bid_add(uuid,uuid,date,text,numeric,int,text,text), public.procurement_bid_evaluate(uuid,boolean,text) to authenticated;
