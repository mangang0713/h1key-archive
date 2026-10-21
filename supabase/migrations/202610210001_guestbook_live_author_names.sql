-- Show each linked author's current public display name on older guestbook posts.
-- Posts whose account was deleted keep the stored anonymized author_name.
create or replace function public.get_public_guestbook(p_offset integer default 0, p_limit integer default 12)
returns table (id uuid, author_name text, body text, created_at timestamptz, is_mine boolean, media jsonb)
language sql stable security definer set search_path = '' as $$
  select p.id, coalesce(nullif(btrim(profile.display_name), ''), p.author_name), p.body, p.created_at, p.user_id = auth.uid(),
    coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'object_path', m.object_path, 'byte_size', m.byte_size, 'content_type', m.content_type)) filter (where m.id is not null), '[]'::jsonb)
  from public.guestbook_posts p
  left join public.profiles profile on profile.id = p.user_id
  left join public.community_media m on m.guestbook_post_id = p.id
  where p.status = 'published'
  group by p.id, profile.display_name
  order by p.created_at desc
  offset greatest(0, least(p_offset, 100000)) limit greatest(1, least(p_limit, 12));
$$;

grant execute on function public.get_public_guestbook(integer, integer) to anon, authenticated;
