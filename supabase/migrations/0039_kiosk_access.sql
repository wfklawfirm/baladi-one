-- 0039: بوابة دخول للكشك. الدخول لمن هو مدير (admin) في أي بلدية أو مسجَّل في قائمة kiosk_viewer بالبريد. حساب المشاهدة لا يحمل أي صف staff_member، فلا يصل إلى بيانات الإدارة.
create table if not exists public.kiosk_viewer (
  email text primary key check (email = lower(email)),
  note text,
  added_at timestamptz not null default now()
);
alter table public.kiosk_viewer enable row level security; -- بلا سياسات: لا قراءة ولا كتابة من العميل
revoke all on public.kiosk_viewer from anon, authenticated;

create or replace function public.kiosk_access_allowed() returns boolean
language sql stable security definer set search_path to 'public','auth' as $$
  select auth.uid() is not null and (
    exists (select 1 from public.staff_member s where s.user_id = auth.uid() and s.role = 'admin')
    or exists (select 1 from auth.users u join public.kiosk_viewer v on v.email = lower(u.email) where u.id = auth.uid())
  ); $$;
revoke all on function public.kiosk_access_allowed() from public, anon;
grant execute on function public.kiosk_access_allowed() to authenticated;

insert into public.kiosk_viewer (email, note) values ('mahmoud.merheb.365@gmail.com', 'عرض الكشك في المعرض — مشاهدة فقط') on conflict do nothing;
