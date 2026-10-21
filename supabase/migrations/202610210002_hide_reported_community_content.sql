-- Keep each reporter's own community feed clear of content they have reported.
-- Reports remain available to moderators; dismissing them does not unhide content for the reporter.
create or replace function public.get_public_guestbook(p_offset integer default 0, p_limit integer default 12)
returns table (id uuid, author_name text, body text, created_at timestamptz, is_mine boolean, media jsonb)
language sql stable security definer set search_path = '' as $$
  select p.id, coalesce(nullif(btrim(profile.display_name), ''), p.author_name), p.body, p.created_at, p.user_id = auth.uid(),
    coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'object_path', m.object_path, 'byte_size', m.byte_size, 'content_type', m.content_type)) filter (where m.id is not null), '[]'::jsonb)
  from public.guestbook_posts p
  left join public.profiles profile on profile.id = p.user_id
  left join public.community_media m on m.guestbook_post_id = p.id
  where p.status = 'published'
    and not exists (
      select 1 from public.content_reports report
      where report.reporter_id = auth.uid()
        and report.content_type = 'guestbook'
        and report.content_id = p.id
    )
  group by p.id, profile.display_name
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
    and not exists (
      select 1 from public.content_reports report
      where report.reporter_id = auth.uid()
        and report.content_type = 'review'
        and report.content_id = r.id
    )
  group by r.id
  order by r.created_at desc
  offset greatest(0, least(p_offset, 100000)) limit greatest(1, least(p_limit, 12));
$$;

grant execute on function public.get_public_guestbook(integer, integer) to anon, authenticated;
grant execute on function public.get_public_schedule_reviews(text, integer, integer) to anon, authenticated;
