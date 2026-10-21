-- Moderation hides content for a 7-day appeal window before permanent removal.
-- Existing hidden content receives a fresh window when this migration is applied.
begin;

alter table public.guestbook_posts
  add column if not exists moderation_reason text,
  add column if not exists hidden_at timestamptz,
  add column if not exists purge_after timestamptz;

alter table public.schedule_reviews
  add column if not exists moderation_reason text,
  add column if not exists hidden_at timestamptz,
  add column if not exists purge_after timestamptz;

alter table public.guestbook_posts drop constraint if exists guestbook_posts_status_check;
alter table public.guestbook_posts add constraint guestbook_posts_status_check check (status in ('published', 'hidden', 'purging'));
alter table public.schedule_reviews drop constraint if exists schedule_reviews_status_check;
alter table public.schedule_reviews add constraint schedule_reviews_status_check check (status in ('published', 'hidden', 'purging'));

update public.guestbook_posts
set hidden_at = coalesce(hidden_at, now()), purge_after = coalesce(purge_after, now() + interval '7 days')
where status = 'hidden';

update public.schedule_reviews
set hidden_at = coalesce(hidden_at, now()), purge_after = coalesce(purge_after, now() + interval '7 days')
where status = 'hidden';

create index if not exists guestbook_posts_expired_hidden_idx
  on public.guestbook_posts (purge_after) where status = 'hidden';
create index if not exists schedule_reviews_expired_hidden_idx
  on public.schedule_reviews (purge_after) where status = 'hidden';

create table if not exists public.content_appeals (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('guestbook', 'review')),
  content_id uuid not null,
  author_id uuid references auth.users(id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 1000)
);
create unique index if not exists content_appeals_one_pending_per_content_idx
  on public.content_appeals (content_type, content_id) where status = 'pending';
create index if not exists content_appeals_pending_idx
  on public.content_appeals (submitted_at) where status = 'pending';
create index if not exists content_appeals_author_idx
  on public.content_appeals (author_id, submitted_at desc);

alter table public.content_appeals enable row level security;
revoke all on public.content_appeals from public, anon, authenticated;
grant all on public.content_appeals to service_role;

create or replace function public.purge_community_content_record(
  p_content_type text, p_content_id uuid, p_required_status text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed boolean := false;
begin
  if p_content_type is null or p_content_type not in ('guestbook', 'review') then
    raise exception 'Unsupported community content type';
  end if;

  if p_content_type = 'guestbook' then
    if p_required_status is null then
      delete from public.guestbook_posts where id = p_content_id;
    else
      delete from public.guestbook_posts where id = p_content_id and status = p_required_status;
    end if;
  else
    if p_required_status is null then
      delete from public.schedule_reviews where id = p_content_id;
    else
      delete from public.schedule_reviews where id = p_content_id and status = p_required_status;
    end if;
  end if;
  removed := found;

  if removed then
    delete from public.content_reports where content_type = p_content_type and content_id = p_content_id;
    delete from public.content_appeals where content_type = p_content_type and content_id = p_content_id;
  end if;
  return removed;
end;
$$;

create or replace function public.submit_community_content_appeal(
  p_content_type text, p_content_id uuid, p_author_id uuid, p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  content_status text;
  content_author uuid;
  content_deadline timestamptz;
  appeal_id uuid;
begin
  if p_content_type = 'guestbook' then
    select status, user_id, purge_after into content_status, content_author, content_deadline
      from public.guestbook_posts where id = p_content_id for update;
  elsif p_content_type = 'review' then
    select status, user_id, purge_after into content_status, content_author, content_deadline
      from public.schedule_reviews where id = p_content_id for update;
  else
    raise exception 'Unsupported community content type';
  end if;

  if not found or content_author is distinct from p_author_id or content_status <> 'hidden' then
    raise exception 'Only the author may appeal their hidden content';
  end if;
  if content_deadline is null or content_deadline <= now() then raise exception 'The appeal period has expired'; end if;
  if char_length(btrim(p_reason)) < 1 or char_length(btrim(p_reason)) > 1000 then raise exception 'Appeal reason must be 1 to 1000 characters'; end if;

  insert into public.content_appeals (content_type, content_id, author_id, reason)
  values (p_content_type, p_content_id, p_author_id, btrim(p_reason)) returning id into appeal_id;
  return appeal_id;
end;
$$;

create or replace function public.claim_expired_community_content_for_purge(p_content_type text, p_content_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  content_status text;
  content_deadline timestamptz;
begin
  if p_content_type = 'guestbook' then
    select status, purge_after into content_status, content_deadline
      from public.guestbook_posts where id = p_content_id for update;
  elsif p_content_type = 'review' then
    select status, purge_after into content_status, content_deadline
      from public.schedule_reviews where id = p_content_id for update;
  else
    raise exception 'Unsupported community content type';
  end if;

  if not found or content_status <> 'hidden' or content_deadline is null or content_deadline > now() then return false; end if;
  if exists (select 1 from public.content_appeals where content_type = p_content_type and content_id = p_content_id and status = 'pending') then
    return false;
  end if;

  if p_content_type = 'guestbook' then
    update public.guestbook_posts set status = 'purging' where id = p_content_id;
  else
    update public.schedule_reviews set status = 'purging' where id = p_content_id;
  end if;
  return true;
end;
$$;

create or replace function public.release_community_content_purge_claim(p_content_type text, p_content_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_content_type = 'guestbook' then
    update public.guestbook_posts set status = 'hidden' where id = p_content_id and status = 'purging';
  elsif p_content_type = 'review' then
    update public.schedule_reviews set status = 'hidden' where id = p_content_id and status = 'purging';
  end if;
end;
$$;

-- Remove media metadata and update per-user/global quota in one transaction.
-- Storage objects are removed by the Edge Function immediately before this RPC;
-- if this transaction fails, its metadata remains so the purge can safely retry.
create or replace function public.remove_community_media_records(p_media_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  media_record record;
  removed_count integer := 0;
begin
  for media_record in
    select id, owner_id, byte_size
    from public.community_media
    where id = any(coalesce(p_media_ids, array[]::uuid[]))
    for update
  loop
    if media_record.owner_id is not null then
      update public.user_media_usage
      set image_count = greatest(0, image_count - 1),
          bytes_used = greatest(0, bytes_used - media_record.byte_size),
          updated_at = now()
      where user_id = media_record.owner_id;
    end if;
    update public.community_settings
    set storage_used_bytes = greatest(0, storage_used_bytes - media_record.byte_size),
        updated_at = now()
    where id = true;
    delete from public.community_media where id = media_record.id;
    removed_count := removed_count + 1;
  end loop;
  return removed_count;
end;
$$;

revoke all on function public.purge_community_content_record(text, uuid, text) from public, anon, authenticated;
revoke all on function public.claim_expired_community_content_for_purge(text, uuid) from public, anon, authenticated;
revoke all on function public.release_community_content_purge_claim(text, uuid) from public, anon, authenticated;
revoke all on function public.remove_community_media_records(uuid[]) from public, anon, authenticated;
revoke all on function public.submit_community_content_appeal(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.purge_community_content_record(text, uuid, text) to service_role;
grant execute on function public.claim_expired_community_content_for_purge(text, uuid) to service_role;
grant execute on function public.release_community_content_purge_claim(text, uuid) to service_role;
grant execute on function public.remove_community_media_records(uuid[]) to service_role;
grant execute on function public.submit_community_content_appeal(text, uuid, uuid, text) to service_role;

comment on table public.content_appeals is 'Owner appeals against hidden community content; pending appeals pause the scheduled purge.';

commit;
