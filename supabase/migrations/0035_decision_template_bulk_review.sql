-- Bulk approval of templates by the responsible mayor/admin (see dt_review_bulk in production).
create or replace function public.dt_review_bulk(p_ids uuid[], p_note text, p_effective date) returns int language plpgsql security definer set search_path to 'public' as $$
declare me staff_member%rowtype; i uuid; cnt int := 0;
begin
  select * into me from staff_member where user_id = auth.uid() order by (role = 'admin') desc limit 1;
  if auth.uid() is null or not found or me.role not in ('mayor','admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_ids is null or coalesce(array_length(p_ids,1),0) = 0 or array_length(p_ids,1) > 200 then raise exception 'bad_input' using errcode = '22023'; end if;
  foreach i in array p_ids loop
    if exists (select 1 from decision_template_version where id = i and status = 'pending_legal_review') then
      perform public.dt_review(i, 'approved', p_note, p_effective);
      cnt := cnt + 1;
    end if;
  end loop;
  perform _adm_audit(me.municipality_id, 'decision_template.bulk_approved', 'decision_template_version', 'bulk', jsonb_build_object('count', cnt, 'note', left(coalesce(p_note,''),500), 'effective', p_effective));
  return cnt;
end $$;
revoke all on function public.dt_review_bulk(uuid[], text, date) from public, anon;
grant execute on function public.dt_review_bulk(uuid[], text, date) to authenticated;
