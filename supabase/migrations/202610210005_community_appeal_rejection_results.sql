-- Rejected appeals immediately remove the hidden post and its media.
-- A minimal, author-only result notice remains for seven days after the decision.
begin;

create table if not exists public.content_appeal_results (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  content_type text not null check (content_type in ('guestbook', 'review')),
  content_created_at timestamptz not null,
  decision_reason text not null check (char_length(decision_reason) between 1 and 1000),
  decided_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create index if not exists content_appeal_results_author_expiry_idx
  on public.content_appeal_results (author_id, expires_at desc);
create index if not exists content_appeal_results_expiry_idx
  on public.content_appeal_results (expires_at);

alter table public.content_appeal_results enable row level security;
revoke all on public.content_appeal_results from public, anon, authenticated;
grant all on public.content_appeal_results to service_role;

create or replace function public.resolve_community_content_appeal(
  p_appeal_id uuid,
  p_decision text,
  p_decision_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  appeal_row record;
  target_status text;
  target_author uuid;
  target_created_at timestamptz;
  media_ids uuid[];
  result_id uuid;
  decision_time timestamptz := now();
  clean_reason text := nullif(btrim(coalesce(p_decision_reason, '')), '');
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'Unsupported appeal decision';
  end if;

  select id, content_type, content_id, author_id, status
    into appeal_row
    from public.content_appeals
    where id = p_appeal_id
    for update;

  if not found or appeal_row.status <> 'pending' then
    raise exception 'Appeal is no longer pending';
  end if;

  if appeal_row.content_type = 'guestbook' then
    select status, user_id, created_at
      into target_status, target_author, target_created_at
      from public.guestbook_posts where id = appeal_row.content_id for update;
  elsif appeal_row.content_type = 'review' then
    select status, user_id, created_at
      into target_status, target_author, target_created_at
      from public.schedule_reviews where id = appeal_row.content_id for update;
  else
    raise exception 'Unsupported community content type';
  end if;

  if not found or target_status <> 'hidden' or target_author is distinct from appeal_row.author_id then
    raise exception 'Appealed content is no longer available';
  end if;

  if p_decision = 'approve' then
    if appeal_row.content_type = 'guestbook' then
      update public.guestbook_posts
        set status = 'published', moderation_reason = null, hidden_at = null, purge_after = null, updated_at = decision_time
        where id = appeal_row.content_id and status = 'hidden';
    else
      update public.schedule_reviews
        set status = 'published', moderation_reason = null, hidden_at = null, purge_after = null, updated_at = decision_time
        where id = appeal_row.content_id and status = 'hidden';
    end if;
    if not found then raise exception 'Could not restore appealed content'; end if;

    update public.content_appeals
      set status = 'approved', decided_at = decision_time, decision_reason = clean_reason
      where id = p_appeal_id and status = 'pending';
    if not found then raise exception 'Could not save appeal decision'; end if;
    return jsonb_build_object('decision', 'approve');
  end if;

  if clean_reason is null then raise exception 'A rejection reason is required'; end if;
  if char_length(clean_reason) > 1000 then raise exception 'Decision reason is too long'; end if;
  if target_author is null then raise exception 'Appeal author is no longer available'; end if;

  if appeal_row.content_type = 'guestbook' then
    select coalesce(array_agg(id), array[]::uuid[]) into media_ids
      from public.community_media where guestbook_post_id = appeal_row.content_id;
  else
    select coalesce(array_agg(id), array[]::uuid[]) into media_ids
      from public.community_media where schedule_review_id = appeal_row.content_id;
  end if;
  perform public.remove_community_media_records(media_ids);

  insert into public.content_appeal_results (
    author_id, content_type, content_created_at, decision_reason, decided_at, expires_at
  ) values (
    target_author, appeal_row.content_type, target_created_at, clean_reason, decision_time, decision_time + interval '7 days'
  ) returning id into result_id;

  delete from public.content_reports where content_type = appeal_row.content_type and content_id = appeal_row.content_id;
  if appeal_row.content_type = 'guestbook' then
    delete from public.guestbook_posts where id = appeal_row.content_id and status = 'hidden';
  else
    delete from public.schedule_reviews where id = appeal_row.content_id and status = 'hidden';
  end if;
  if not found then raise exception 'Could not permanently delete appealed content'; end if;
  delete from public.content_appeals where content_type = appeal_row.content_type and content_id = appeal_row.content_id;

  return jsonb_build_object('decision', 'reject', 'result_id', result_id, 'expires_at', decision_time + interval '7 days');
end;
$$;

revoke all on function public.resolve_community_content_appeal(uuid, text, text) from public, anon, authenticated;
grant execute on function public.resolve_community_content_appeal(uuid, text, text) to service_role;

comment on table public.content_appeal_results is 'Minimal author-only notice for rejected appeals; contains no post text, appeal text, or media and expires seven days after decision.';

commit;
