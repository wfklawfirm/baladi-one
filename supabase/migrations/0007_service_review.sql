-- Service version review workflow: draft -> in_review -> approved -> archived (+ reject back to draft).
-- Authoring stays admin-only (existing *_admin_all policies). Mayors may read unapproved versions and approve.
-- Four-eyes: whoever submitted a version for review cannot approve it.
create policy ver_review_read on service_version for select to authenticated
  using (exists (select 1 from staff_member s where s.user_id = auth.uid() and s.role in ('mayor','admin')));
create policy svc_review_read on municipal_service for select to authenticated
  using (exists (select 1 from staff_member s where s.user_id = auth.uid() and s.role in ('mayor','admin')));
create policy src_review_read on service_source for select to authenticated
  using (exists (select 1 from staff_member s where s.user_id = auth.uid() and s.role in ('mayor','admin')));

create or replace function public.review_service_version(p_id uuid, p_to version_status, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v service_version%rowtype; me staff_member%rowtype; n text := nullif(left(btrim(coalesce(p_note,'')),500),'');
        submitter uuid;
begin
  select * into me from staff_member where user_id = auth.uid() order by (role='admin') desc limit 1;
  if auth.uid() is null or not found or me.role not in ('mayor','admin') then raise exception 'forbidden' using errcode='42501'; end if;
  select * into v from service_version where id = p_id for update;
  if not found then raise exception 'not_found' using errcode='P0002'; end if;

  if v.status='draft' and p_to='in_review' then
    if me.role <> 'admin' then raise exception 'forbidden' using errcode='42501'; end if;
  elsif v.status='in_review' and p_to in ('approved','draft') then
    if p_to='approved' then
      select actor into submitter from audit_event
        where entity='service_version' and entity_id=p_id::text and action='service_version.in_review' order by id desc limit 1;
      if submitter is not distinct from auth.uid() then raise exception 'four_eyes' using errcode='42501'; end if;
    end if;
  elsif v.status='approved' and p_to='archived' then null;
  else raise exception 'bad_transition' using errcode='22023'; end if;

  if p_to='approved' then
    update service_version set status='archived' where service_id=v.service_id and status='approved' and id<>p_id;
    update service_version set status='approved', approved_by=auth.uid(), approved_at=now() where id=p_id;
  else
    update service_version set status=p_to, approved_by=null, approved_at=null where id=p_id;
  end if;
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail)
  values (me.municipality_id, auth.uid(), 'service_version.'||p_to, 'service_version', p_id::text,
          jsonb_build_object('from', v.status, 'to', p_to, 'service_id', v.service_id, 'note', n));
end $$;
revoke all on function public.review_service_version(uuid, version_status, text) from public, anon;
grant execute on function public.review_service_version(uuid, version_status, text) to authenticated;
