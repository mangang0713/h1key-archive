create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'H1-KEY 팬' check (char_length(display_name) between 1 and 40),
  community_terms_accepted_at timestamptz,
  community_terms_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.community_settings (
  id boolean primary key default true check (id),
  community_enabled boolean not null default true,
  uploads_enabled boolean not null default true,
  media_views_enabled boolean not null default true,
  storage_limit_bytes bigint not null default 838860800 check (storage_limit_bytes between 1048576 and 1073741824),
  storage_used_bytes bigint not null default 0 check (storage_used_bytes >= 0),
  storage_reserved_bytes bigint not null default 0 check (storage_reserved_bytes >= 0),
  updated_at timestamptz not null default now()
);
insert into public.community_settings (id) values (true) on conflict do nothing;

create table public.user_media_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  image_count integer not null default 0 check (image_count >= 0),
  bytes_used bigint not null default 0 check (bytes_used >= 0),
  images_reserved integer not null default 0 check (images_reserved >= 0),
  bytes_reserved bigint not null default 0 check (bytes_reserved >= 0),
  updated_at timestamptz not null default now()
);

create table public.guestbook_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  author_name text not null default '익명 사용자' check (char_length(author_name) between 1 and 40),
  body text not null check (char_length(body) between 2 and 1200),
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index guestbook_posts_published_created_idx on public.guestbook_posts (created_at desc) where status = 'published';

create table public.schedule_likes (
  id uuid primary key default gen_random_uuid(),
  schedule_id text not null check (char_length(schedule_id) <= 100),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (schedule_id, user_id)
);
create index schedule_likes_schedule_idx on public.schedule_likes (schedule_id);

create table public.schedule_reviews (
  id uuid primary key default gen_random_uuid(),
  schedule_id text not null check (char_length(schedule_id) <= 100),
  user_id uuid references auth.users(id) on delete set null,
  author_name text not null default '익명 사용자' check (char_length(author_name) between 1 and 40),
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(body) between 2 and 1200),
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index schedule_reviews_one_per_user on public.schedule_reviews (schedule_id, user_id) where user_id is not null;
create index schedule_reviews_schedule_created_idx on public.schedule_reviews (schedule_id, created_at desc) where status = 'published';

create table public.community_media (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  guestbook_post_id uuid references public.guestbook_posts(id) on delete cascade,
  schedule_review_id uuid references public.schedule_reviews(id) on delete cascade,
  object_path text not null unique,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size between 1 and 1048576),
  created_at timestamptz not null default now(),
  constraint one_media_parent check ((guestbook_post_id is null) <> (schedule_review_id is null))
);
create index community_media_guestbook_idx on public.community_media (guestbook_post_id) where guestbook_post_id is not null;
create index community_media_review_idx on public.community_media (schedule_review_id) where schedule_review_id is not null;

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  content_type text not null check (content_type in ('guestbook', 'review')),
  content_id uuid not null,
  reason text not null check (char_length(reason) between 1 and 80),
  details text check (details is null or char_length(details) <= 500),
  target_excerpt text not null check (char_length(target_excerpt) <= 500),
  target_author text not null check (char_length(target_author) <= 40),
  status text not null default 'open' check (status in ('open', 'reviewed', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_id, content_type, content_id)
);
create index content_reports_open_idx on public.content_reports (created_at) where status = 'open';

create table public.media_quota_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  byte_size integer not null check (byte_size between 1 and 1048576),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes')
);

create table public.community_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (user_id, action, window_start)
);
create table public.community_public_rate_limits (
  ip_hash text not null,
  action text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (ip_hash, action, window_start)
);

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  candidate_name text;
begin
  candidate_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'user_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'preferred_username'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    'H1-KEY 팬'
  );
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(left(candidate_name, 40), ''), 'H1-KEY 팬'))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created_profile after insert on auth.users for each row execute function public.create_profile_for_new_user();

create or replace function public.reserve_community_media(p_user_id uuid, p_byte_size integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  reservation_id uuid := gen_random_uuid();
  global_limit bigint;
  expired_id uuid;
begin
  if p_byte_size < 1 or p_byte_size > 1048576 then return null; end if;
  if not exists (select 1 from public.community_settings where id = true and uploads_enabled and community_enabled) then return null; end if;
  for expired_id in select id from public.media_quota_reservations where expires_at < now() order by expires_at limit 100 loop
    perform public.release_community_media_reservation(expired_id);
  end loop;
  insert into public.user_media_usage (user_id) values (p_user_id) on conflict do nothing;
  update public.user_media_usage
    set images_reserved = images_reserved + 1, bytes_reserved = bytes_reserved + p_byte_size, updated_at = now()
    where user_id = p_user_id and image_count + images_reserved < 10 and bytes_used + bytes_reserved + p_byte_size <= 10485760;
  if not found then return null; end if;
  select storage_limit_bytes into global_limit from public.community_settings where id = true for update;
  update public.community_settings
    set storage_reserved_bytes = storage_reserved_bytes + p_byte_size, updated_at = now()
    where id = true and uploads_enabled and community_enabled
      and storage_used_bytes + storage_reserved_bytes + p_byte_size <= global_limit;
  if not found then
    update public.user_media_usage set images_reserved = images_reserved - 1, bytes_reserved = bytes_reserved - p_byte_size where user_id = p_user_id;
    return null;
  end if;
  insert into public.media_quota_reservations (id, user_id, byte_size) values (reservation_id, p_user_id, p_byte_size);
  return reservation_id;
end;
$$;

create or replace function public.finalize_community_media(
  p_reservation_id uuid, p_object_path text, p_content_type text,
  p_parent_type text, p_parent_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  reservation public.media_quota_reservations%rowtype;
  media_id uuid := gen_random_uuid();
  parent_exists boolean := false;
begin
  select * into reservation from public.media_quota_reservations where id = p_reservation_id for update;
  if not found then return null; end if;
  if p_parent_type = 'guestbook' then
    perform 1 from public.guestbook_posts where id = p_parent_id and user_id = reservation.user_id and status = 'published' for update;
    parent_exists := found;
    if parent_exists then
      select count(*) < 3 into parent_exists from public.community_media where guestbook_post_id = p_parent_id;
    end if;
  elsif p_parent_type = 'review' then
    perform 1 from public.schedule_reviews where id = p_parent_id and user_id = reservation.user_id and status = 'published' for update;
    parent_exists := found;
    if parent_exists then
      select count(*) < 3 into parent_exists from public.community_media where schedule_review_id = p_parent_id;
    end if;
  end if;
  if not parent_exists then return null; end if;
  insert into public.community_media (id, owner_id, guestbook_post_id, schedule_review_id, object_path, content_type, byte_size)
  values (media_id, reservation.user_id,
    case when p_parent_type = 'guestbook' then p_parent_id else null end,
    case when p_parent_type = 'review' then p_parent_id else null end,
    p_object_path, p_content_type, reservation.byte_size);
  update public.user_media_usage set image_count = image_count + 1, bytes_used = bytes_used + reservation.byte_size,
    images_reserved = images_reserved - 1, bytes_reserved = bytes_reserved - reservation.byte_size, updated_at = now()
    where user_id = reservation.user_id;
  update public.community_settings set storage_used_bytes = storage_used_bytes + reservation.byte_size,
    storage_reserved_bytes = storage_reserved_bytes - reservation.byte_size, updated_at = now() where id = true;
  delete from public.media_quota_reservations where id = p_reservation_id;
  return media_id;
end;
$$;

create or replace function public.release_community_media_reservation(p_reservation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  reservation public.media_quota_reservations%rowtype;
begin
  select * into reservation from public.media_quota_reservations where id = p_reservation_id for update;
  if not found then return; end if;
  update public.user_media_usage set images_reserved = greatest(0, images_reserved - 1),
    bytes_reserved = greatest(0, bytes_reserved - reservation.byte_size), updated_at = now()
    where user_id = reservation.user_id;
  update public.community_settings set storage_reserved_bytes = greatest(0, storage_reserved_bytes - reservation.byte_size), updated_at = now() where id = true;
  delete from public.media_quota_reservations where id = p_reservation_id;
end;
$$;

create or replace function public.release_community_media(p_user_id uuid, p_byte_size integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.user_media_usage set image_count = greatest(0, image_count - 1), bytes_used = greatest(0, bytes_used - p_byte_size), updated_at = now()
    where user_id = p_user_id;
  update public.community_settings set storage_used_bytes = greatest(0, storage_used_bytes - p_byte_size), updated_at = now() where id = true;
end;
$$;

create or replace function public.consume_community_rate_limit(p_user_id uuid, p_action text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  bucket_start timestamptz;
  current_count integer;
begin
  bucket_start := to_timestamp(floor(extract(epoch from now()) / greatest(1, p_window_seconds)) * greatest(1, p_window_seconds));
  insert into public.community_rate_limits (user_id, action, window_start, request_count)
  values (p_user_id, p_action, bucket_start, 1)
  on conflict (user_id, action, window_start) do update set request_count = community_rate_limits.request_count + 1
  returning request_count into current_count;
  return current_count <= p_limit;
end;
$$;

create or replace function public.get_public_community_settings()
returns table (community_enabled boolean, uploads_enabled boolean, media_views_enabled boolean)
language sql stable security definer set search_path = '' as $$
  select s.community_enabled, s.uploads_enabled, s.media_views_enabled from public.community_settings s where s.id = true;
$$;

create or replace function public.get_public_guestbook(p_offset integer default 0, p_limit integer default 12)
returns table (id uuid, author_name text, body text, created_at timestamptz, is_mine boolean, media jsonb)
language sql stable security definer set search_path = '' as $$
  select p.id, p.author_name, p.body, p.created_at, p.user_id = auth.uid(),
    coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'object_path', m.object_path, 'byte_size', m.byte_size, 'content_type', m.content_type)) filter (where m.id is not null), '[]'::jsonb)
  from public.guestbook_posts p left join public.community_media m on m.guestbook_post_id = p.id
  where p.status = 'published'
  group by p.id
  order by p.created_at desc
  offset greatest(0, least(p_offset, 100000)) limit greatest(1, least(p_limit, 12));
$$;

create or replace function public.get_public_schedule_reviews(p_schedule_id text, p_offset integer default 0, p_limit integer default 12)
returns table (id uuid, schedule_id text, author_name text, body text, rating smallint, created_at timestamptz, is_mine boolean, media jsonb)
language sql stable security definer set search_path = '' as $$
  select r.id, r.schedule_id, r.author_name, r.body, r.rating, r.created_at, r.user_id = auth.uid(),
    coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'object_path', m.object_path, 'byte_size', m.byte_size, 'content_type', m.content_type)) filter (where m.id is not null), '[]'::jsonb)
  from public.schedule_reviews r left join public.community_media m on m.schedule_review_id = r.id
  where r.status = 'published' and r.schedule_id = p_schedule_id
  group by r.id
  order by r.created_at desc
  offset greatest(0, least(p_offset, 100000)) limit greatest(1, least(p_limit, 12));
$$;

create or replace function public.get_schedule_reaction_stats(p_schedule_id text)
returns table (like_count bigint, liked boolean, own_review_id uuid)
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.schedule_likes l where l.schedule_id = p_schedule_id),
    exists(select 1 from public.schedule_likes l where l.schedule_id = p_schedule_id and l.user_id = auth.uid()),
    (select r.id from public.schedule_reviews r where r.schedule_id = p_schedule_id and r.user_id = auth.uid() limit 1);
$$;

create or replace function public.get_database_size_bytes()
returns bigint language sql stable security definer set search_path = '' as $$
  select pg_database_size(current_database());
$$;

create or replace function public.get_own_schedule_review(p_schedule_id text)
returns table (id uuid, schedule_id text, author_name text, body text, rating smallint, created_at timestamptz, media jsonb)
language sql stable security definer set search_path = '' as $$
  select r.id, r.schedule_id, r.author_name, r.body, r.rating, r.created_at,
    coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'object_path', m.object_path, 'byte_size', m.byte_size, 'content_type', m.content_type)) filter (where m.id is not null), '[]'::jsonb)
  from public.schedule_reviews r left join public.community_media m on m.schedule_review_id = r.id
  where r.schedule_id = p_schedule_id and r.user_id = auth.uid()
  group by r.id limit 1;
$$;

create or replace function public.consume_public_media_rate_limit(p_ip_hash text, p_limit integer default 50, p_window_seconds integer default 60)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  bucket_start timestamptz;
  current_count integer;
begin
  bucket_start := to_timestamp(floor(extract(epoch from now()) / greatest(1, p_window_seconds)) * greatest(1, p_window_seconds));
  insert into public.community_public_rate_limits (ip_hash, action, window_start, request_count)
  values (p_ip_hash, 'signed-media', bucket_start, 1)
  on conflict (ip_hash, action, window_start) do update set request_count = community_public_rate_limits.request_count + 1
  returning request_count into current_count;
  if random() < 0.01 then delete from public.community_public_rate_limits where window_start < now() - interval '2 days'; end if;
  return current_count <= p_limit;
end;
$$;

alter table public.profiles enable row level security;
alter table public.admin_members enable row level security;
alter table public.community_settings enable row level security;
alter table public.user_media_usage enable row level security;
alter table public.guestbook_posts enable row level security;
alter table public.schedule_likes enable row level security;
alter table public.schedule_reviews enable row level security;
alter table public.community_media enable row level security;
alter table public.content_reports enable row level security;
alter table public.media_quota_reservations enable row level security;
alter table public.community_rate_limits enable row level security;
alter table public.community_public_rate_limits enable row level security;

create policy "public read display profiles" on public.profiles for select to anon, authenticated using (true);
create policy "owners read profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "public read published guestbook" on public.guestbook_posts for select to anon, authenticated using (status = 'published');
create policy "admins read hidden guestbook" on public.guestbook_posts for select to authenticated using (exists (select 1 from public.admin_members where user_id = auth.uid()));
create policy "public read schedule likes" on public.schedule_likes for select to anon, authenticated using (true);
create policy "public read published reviews" on public.schedule_reviews for select to anon, authenticated using (status = 'published');
create policy "admins read hidden reviews" on public.schedule_reviews for select to authenticated using (exists (select 1 from public.admin_members where user_id = auth.uid()));
create policy "public read attached media metadata" on public.community_media for select to anon, authenticated using (
  (guestbook_post_id is not null and exists(select 1 from public.guestbook_posts p where p.id = guestbook_post_id and p.status = 'published'))
  or (schedule_review_id is not null and exists(select 1 from public.schedule_reviews r where r.id = schedule_review_id and r.status = 'published'))
  or exists(select 1 from public.admin_members where user_id = auth.uid())
);
create policy "admins read reports" on public.content_reports for select to authenticated using (exists (select 1 from public.admin_members where user_id = auth.uid()));
create policy "admins read admin membership" on public.admin_members for select to authenticated using (user_id = auth.uid());

revoke all on public.profiles, public.guestbook_posts, public.schedule_likes,
  public.schedule_reviews, public.community_media, public.content_reports, public.community_settings,
  public.user_media_usage, public.admin_members, public.media_quota_reservations, public.community_rate_limits, public.community_public_rate_limits
  from anon, authenticated;
grant select (id, display_name) on public.profiles to anon, authenticated;
revoke all on function public.reserve_community_media(uuid, integer) from public, anon, authenticated;
revoke all on function public.finalize_community_media(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.release_community_media_reservation(uuid) from public, anon, authenticated;
revoke all on function public.release_community_media(uuid, integer) from public, anon, authenticated;
revoke all on function public.consume_community_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.get_public_community_settings() from public;
grant execute on function public.reserve_community_media(uuid, integer) to service_role;
grant execute on function public.finalize_community_media(uuid, text, text, text, uuid) to service_role;
grant execute on function public.release_community_media_reservation(uuid) to service_role;
grant execute on function public.release_community_media(uuid, integer) to service_role;
grant execute on function public.consume_community_rate_limit(uuid, text, integer, integer) to service_role;
grant execute on function public.get_public_community_settings() to anon, authenticated;
grant execute on function public.get_public_guestbook(integer, integer) to anon, authenticated;
grant execute on function public.get_public_schedule_reviews(text, integer, integer) to anon, authenticated;
grant execute on function public.get_schedule_reaction_stats(text) to anon, authenticated;
revoke all on function public.get_own_schedule_review(text) from public, anon;
grant execute on function public.get_own_schedule_review(text) to authenticated;
revoke all on function public.get_database_size_bytes() from public, anon, authenticated;
grant execute on function public.get_database_size_bytes() to service_role;
revoke all on function public.consume_public_media_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_public_media_rate_limit(text, integer, integer) to service_role;

-- Public client access goes through narrow RPC results so account UUIDs and report metadata stay private.
revoke select on public.guestbook_posts, public.schedule_likes, public.schedule_reviews,
  public.community_media, public.content_reports from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-images', 'community-images', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 1048576, allowed_mime_types = excluded.allowed_mime_types;
create policy "community images are served only through signed URLs" on storage.objects
  for select to authenticated using (false);
create policy "community images upload through server function only" on storage.objects
  for insert to authenticated with check (false);
create policy "community images delete through server function only" on storage.objects
  for delete to authenticated using (false);

comment on table public.community_settings is 'Public feature switches; storage totals are returned only to authorized administrators by the server function.';
comment on table public.content_reports is 'Only users with membership in admin_members can read reports.';
comment on table public.community_media is 'User uploaded photos only; X archive photos remain in the static archive data.';
