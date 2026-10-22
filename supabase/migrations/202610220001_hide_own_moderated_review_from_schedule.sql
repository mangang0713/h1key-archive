-- Keep a moderated review out of the normal schedule feed for its author too.
-- Authors can still review its status, reason, and appeal from My Posts.
create or replace function public.get_own_schedule_review(p_schedule_id text)
returns table (
  id uuid,
  schedule_id text,
  author_name text,
  body text,
  rating smallint,
  created_at timestamptz,
  media jsonb
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.schedule_id, r.author_name, r.body, r.rating, r.created_at,
    coalesce(
      jsonb_agg(jsonb_build_object(
        'id', m.id,
        'object_path', m.object_path,
        'byte_size', m.byte_size,
        'content_type', m.content_type
      )) filter (where m.id is not null),
      '[]'::jsonb
    )
  from public.schedule_reviews r
  left join public.community_media m on m.schedule_review_id = r.id
  where r.schedule_id = p_schedule_id
    and r.user_id = auth.uid()
    and r.status = 'published'
  group by r.id
  limit 1;
$$;
