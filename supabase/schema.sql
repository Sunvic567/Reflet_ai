-- Run in Supabase SQL Editor. Unrelated tables are not changed.
begin;
create schema if not exists reflect_private;
revoke all on schema reflect_private from public, anon;
create or replace function reflect_private.can_access()
returns boolean language sql stable security definer set search_path = '' as $$
 select exists (select 1 from auth.users u
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null
  and lower(u.email) ~ '^[a-z0-9][a-z0-9.+_-]*@gmail[.]com$');
$$;
revoke all on function reflect_private.can_access() from public, anon;
grant usage on schema reflect_private to authenticated;
grant execute on function reflect_private.can_access() to authenticated;
create table if not exists public.reflect_workspaces (
 user_id uuid primary key references auth.users(id) on delete cascade,
 state jsonb not null check (jsonb_typeof(state) = 'object'),
 revision integer not null default 1 check (revision > 0),
 updated_at timestamptz not null default now()
);
alter table public.reflect_workspaces enable row level security;
revoke all on public.reflect_workspaces from public, anon, authenticated;
grant select, insert, update on public.reflect_workspaces to authenticated;
drop policy if exists reflect_read_own on public.reflect_workspaces;
create policy reflect_read_own on public.reflect_workspaces for select to authenticated
 using ((select auth.uid()) = user_id and (select reflect_private.can_access()));
drop policy if exists reflect_insert_own on public.reflect_workspaces;
create policy reflect_insert_own on public.reflect_workspaces for insert to authenticated
 with check ((select auth.uid()) = user_id and (select reflect_private.can_access()));
drop policy if exists reflect_update_own on public.reflect_workspaces;
create policy reflect_update_own on public.reflect_workspaces for update to authenticated
 using ((select auth.uid()) = user_id and (select reflect_private.can_access()))
 with check ((select auth.uid()) = user_id and (select reflect_private.can_access()));
create or replace function reflect_private.stamp_workspace()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists reflect_workspace_timestamp on public.reflect_workspaces;
create trigger reflect_workspace_timestamp before update on public.reflect_workspaces
 for each row execute function reflect_private.stamp_workspace();
commit;
