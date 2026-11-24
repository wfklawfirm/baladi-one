-- BALADI ONE: voice dictation. The transcription route is public (citizens dictate reports and searches),
-- so each call is counted here first. Only a salted hash of the caller is kept; no audio and no text is stored.
create table if not exists public.voice_usage (
  id bigint generated always as identity primary key,
  caller text not null,
  created_at timestamptz not null default now()
);
create index if not exists voice_usage_caller_time on public.voice_usage (caller, created_at desc);
create index if not exists voice_usage_time on public.voice_usage (created_at desc);
alter table public.voice_usage enable row level security;   -- no policies: reachable only through voice_allow()

create or replace function public.voice_allow(p_caller text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_caller is null or p_caller !~ '^[0-9a-f]{64}$' then return false; end if;
  delete from voice_usage where created_at < now() - interval '2 days';
  if (select count(*) from voice_usage where caller = p_caller and created_at > now() - interval '10 minutes') >= 15 then return false; end if;
  if (select count(*) from voice_usage where created_at > now() - interval '1 day') >= 1500 then return false; end if;   -- ceiling on the daily transcription spend
  insert into voice_usage (caller) values (p_caller);
  return true;
end $$;
revoke all on function public.voice_allow(text) from public;
grant execute on function public.voice_allow(text) to anon, authenticated;
