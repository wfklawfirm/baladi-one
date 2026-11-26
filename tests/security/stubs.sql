-- Throwaway stubs for the local PGlite harness (NOT a Supabase project; never applied anywhere else).
-- Real definitions of is_staff / is_demo_staff / _council_muni are extracted from the repo migrations by harness.ts.
create schema if not exists auth;
create role anon nologin; create role authenticated nologin; create role service_role nologin;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
-- Supabase default privileges: table grants are wide open, RLS is the only gate; functions are executable by default.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated, service_role;

create type public.staff_role as enum ('staff','mayor','admin');
create table public.municipality (
  id uuid primary key default gen_random_uuid(), slug text not null unique, name_ar text not null,
  is_demo boolean not null default false, created_at timestamptz not null default now());
create table public.staff_member (
  user_id uuid not null references auth.users(id) on delete cascade,
  municipality_id uuid not null references public.municipality(id) on delete cascade,
  role public.staff_role not null default 'staff', display_name text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(), primary key (user_id, municipality_id));
create table public.audit_event (
  id bigint generated always as identity primary key,
  municipality_id uuid references public.municipality(id), actor uuid,
  action text not null, entity text not null, entity_id text, detail jsonb,
  created_at timestamptz not null default now());
create table public.budget_line (
  id uuid primary key default gen_random_uuid(), municipality_id uuid not null references public.municipality(id),
  code text, title_ar text, kind text);
create table public.municipal_decision (
  id uuid primary key default gen_random_uuid(), municipality_id uuid not null references public.municipality(id),
  decided_on date, legal_status text, effective_on date);
create table public.contract (
  id uuid primary key default gen_random_uuid(), municipality_id uuid not null references public.municipality(id),
  contractor text not null default 'x', subject text not null default 'x', value numeric(14,2) not null default 0,
  currency text not null default 'USD', status text not null default 'draft', signed_on date,
  decision_id uuid references public.municipal_decision(id), is_demo boolean not null default false,
  updated_at timestamptz not null default now());
-- Same RLS posture as migration 0001: audit read for mayor/admin only, no write policies.
alter table public.municipality enable row level security;
alter table public.staff_member enable row level security;
alter table public.audit_event enable row level security;
alter table public.budget_line enable row level security;
alter table public.municipal_decision enable row level security;
alter table public.contract enable row level security;
