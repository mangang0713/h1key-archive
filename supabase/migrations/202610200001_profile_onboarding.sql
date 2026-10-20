-- Populate profiles for auth users created before the foundation migration.
insert into public.profiles (id, display_name)
select
  u.id,
  coalesce(
    nullif(left(btrim(u.raw_user_meta_data ->> 'user_name'), 40), ''),
    nullif(left(btrim(u.raw_user_meta_data ->> 'preferred_username'), 40), ''),
    nullif(left(btrim(u.raw_user_meta_data ->> 'nickname'), 40), ''),
    nullif(left(btrim(u.raw_user_meta_data ->> 'full_name'), 40), ''),
    nullif(left(btrim(u.raw_user_meta_data ->> 'name'), 40), ''),
    'H1-KEY 팬'
  )
from auth.users u
on conflict (id) do nothing;

create or replace function public.save_my_display_name(p_display_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_name text := btrim(coalesce(p_display_name, ''));
begin
  if current_user_id is null then raise exception '로그인 후 표시 이름을 저장할 수 있습니다.'; end if;
  if char_length(normalized_name) < 1 or char_length(normalized_name) > 40 then
    raise exception '표시 이름은 1~40자로 입력해 주세요.';
  end if;
  if not public.consume_community_rate_limit(current_user_id, 'update-profile', 10, 3600) then
    raise exception '표시 이름 변경 요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.';
  end if;
  insert into public.profiles (id, display_name, updated_at)
  values (current_user_id, normalized_name, now())
  on conflict (id) do update set display_name = excluded.display_name, updated_at = excluded.updated_at;
  return normalized_name;
end;
$$;
revoke all on function public.save_my_display_name(text) from public, anon;
grant execute on function public.save_my_display_name(text) to authenticated;
