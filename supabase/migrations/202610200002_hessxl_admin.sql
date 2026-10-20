create or replace function public.claim_hessxl_admin()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  matched_x_identity boolean;
begin
  if current_user_id is null then return false; end if;
  select exists (
    select 1
    from auth.identities i
    where i.user_id = current_user_id
      and i.provider in ('twitter', 'x')
      and lower(ltrim(coalesce(
        i.identity_data ->> 'user_name',
        i.identity_data ->> 'username',
        i.identity_data ->> 'screen_name',
        i.identity_data ->> 'preferred_username',
        ''
      ), '@')) = 'hessxl_'
  ) into matched_x_identity;
  if not matched_x_identity then return false; end if;
  insert into public.admin_members (user_id) values (current_user_id) on conflict (user_id) do nothing;
  return true;
end;
$$;
revoke all on function public.claim_hessxl_admin() from public, anon;
grant execute on function public.claim_hessxl_admin() to authenticated;

create or replace function public.is_archive_admin_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_members m
    join auth.identities i on i.user_id = m.user_id
    where m.user_id = p_user_id
      and i.provider in ('twitter', 'x')
      and lower(ltrim(coalesce(
        i.identity_data ->> 'user_name',
        i.identity_data ->> 'username',
        i.identity_data ->> 'screen_name',
        i.identity_data ->> 'preferred_username',
        ''
      ), '@')) = 'hessxl_'
  );
$$;
revoke all on function public.is_archive_admin_user(uuid) from public, anon, authenticated;
grant execute on function public.is_archive_admin_user(uuid) to service_role;

create or replace function public.is_current_archive_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.is_archive_admin_user(auth.uid()), false);
$$;
revoke all on function public.is_current_archive_admin() from public, anon;
grant execute on function public.is_current_archive_admin() to authenticated;
