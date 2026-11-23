-- Staff status change: SECURITY DEFINER, staff of the request's municipality only; writes history + audit.
create or replace function public.staff_set_status(p_id uuid, p_status request_status, p_note text default null, p_public boolean default false)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r citizen_request%rowtype; n text := nullif(left(btrim(coalesce(p_note,'')), 500), '');
begin
  select * into r from citizen_request where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if auth.uid() is null or not is_staff(r.municipality_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.status = p_status and n is null then return; end if;
  update citizen_request set status = p_status, updated_at = now() where id = p_id;
  insert into request_status_history (request_id, from_status, to_status, note, internal, actor)
  values (p_id, r.status, p_status, n, not p_public, auth.uid());
  insert into audit_event (municipality_id, actor, action, entity, entity_id, detail)
  values (r.municipality_id, auth.uid(), 'request.status_changed', 'citizen_request', p_id::text,
          jsonb_build_object('from', r.status, 'to', p_status, 'public_note', p_public and n is not null));
end $$;
revoke all on function public.staff_set_status(uuid, request_status, text, boolean) from public, anon;
grant execute on function public.staff_set_status(uuid, request_status, text, boolean) to authenticated;
