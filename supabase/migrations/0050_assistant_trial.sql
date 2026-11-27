-- 0050: public 3-day trial of the AI assistant only (QR on the AIJUR screen). Visitors register a phone number; the tokens are hashed
-- (the app generates a random token, stores only its SHA-256 here). The registry is readable ONLY by the platform owner (WFK account).
-- No table is exposed to anon/authenticated: everything goes through SECURITY DEFINER RPCs.

create table if not exists public.platform_owner (user_id uuid primary key);
alter table public.platform_owner enable row level security;
revoke all on public.platform_owner from public, anon, authenticated;

create table if not exists public.assistant_trial (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique check (phone ~ '^[0-9]{7,15}$'),
  full_name text check (full_name is null or char_length(full_name) <= 120),
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '3 days',
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  question_count integer not null default 0,
  day_date date, day_count integer not null default 0,
  last_used_at timestamptz,
  source text not null default 'qr'
);
alter table public.assistant_trial enable row level security;
revoke all on public.assistant_trial from public, anon, authenticated;

-- the platform owner = the WFK admin account (looked up by e-mail at migration time; nothing is hard-coded in code)
do $$ begin
  if to_regclass('auth.users') is not null then
    execute $q$insert into public.platform_owner(user_id) select id from auth.users where lower(email) = 'wfklawfirm@gmail.com' on conflict do nothing$q$;
  end if;
end $$;

create or replace function public.is_platform_owner() returns boolean language sql stable security definer set search_path to 'public' as
$$ select exists (select 1 from public.platform_owner where user_id = auth.uid()) $$;

create or replace function public.trial_register(p_phone text, p_name text, p_consent boolean, p_token_hash text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_phone text := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g'); r public.assistant_trial;
begin
  if p_consent is not true then raise exception 'consent_required' using errcode = '22023'; end if;
  if v_phone !~ '^[0-9]{7,15}$' then raise exception 'bad_phone' using errcode = '22023'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'bad_input' using errcode = '22023'; end if;
  -- crude global brake against bulk spam (anon endpoint)
  if (select count(*) from public.assistant_trial where created_at > now() - interval '1 hour') >= 300 then raise exception 'busy' using errcode = '22023'; end if;
  select * into r from public.assistant_trial where phone = v_phone for update;
  if found then
    if r.expires_at <= now() then return jsonb_build_object('status','expired'); end if;
    update public.assistant_trial set token_hash = p_token_hash, full_name = coalesce(nullif(btrim(p_name),''), full_name) where id = r.id;
    return jsonb_build_object('status','ok','expires_at', r.expires_at);
  end if;
  insert into public.assistant_trial(phone, full_name, token_hash) values (v_phone, nullif(left(btrim(coalesce(p_name,'')),120),''), p_token_hash) returning * into r;
  return jsonb_build_object('status','ok','expires_at', r.expires_at);
end $$;

create or replace function public.trial_status(p_token_hash text) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r public.assistant_trial;
begin
  select * into r from public.assistant_trial where token_hash = p_token_hash;
  if not found then return jsonb_build_object('status','invalid'); end if;
  if r.expires_at <= now() then return jsonb_build_object('status','expired'); end if;
  return jsonb_build_object('status','ok','expires_at', r.expires_at);
end $$;

-- one question: returns ok | invalid | expired | limit (25 questions per trial day, Asia/Beirut)
create or replace function public.trial_use(p_token_hash text) returns text language plpgsql security definer set search_path to 'public' as $$
declare r public.assistant_trial; today date := (now() at time zone 'Asia/Beirut')::date;
begin
  select * into r from public.assistant_trial where token_hash = p_token_hash for update;
  if not found then return 'invalid'; end if;
  if r.expires_at <= now() then return 'expired'; end if;
  if r.day_date is distinct from today then r.day_date := today; r.day_count := 0; end if;
  if r.day_count >= 25 then return 'limit'; end if;
  update public.assistant_trial set day_date = today, day_count = r.day_count + 1, question_count = question_count + 1, last_used_at = now() where id = r.id;
  return 'ok';
end $$;

create or replace function public.trial_leads() returns table (id uuid, full_name text, phone text, created_at timestamptz, expires_at timestamptz, question_count integer, last_used_at timestamptz, status text)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.is_platform_owner() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select t.id, t.full_name, t.phone, t.created_at, t.expires_at, t.question_count, t.last_used_at, case when t.expires_at > now() then 'active' else 'expired' end
    from public.assistant_trial t order by t.created_at desc limit 5000;
end $$;

revoke all on function public.trial_register(text,text,boolean,text), public.trial_status(text), public.trial_use(text), public.trial_leads(), public.is_platform_owner() from public, anon, authenticated;
grant execute on function public.trial_register(text,text,boolean,text), public.trial_status(text), public.trial_use(text) to anon, authenticated;
grant execute on function public.trial_leads(), public.is_platform_owner() to authenticated;
