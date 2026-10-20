export type CommunityMedia = {
  id: string
  object_path: string
  byte_size: number
  content_type: string
  signed_url?: string
}

export type GuestbookPost = {
  id: string
  author_name: string
  body: string
  created_at: string
  is_mine: boolean
  media: CommunityMedia[]
}

export type ScheduleReview = {
  id: string
  schedule_id: string
  author_name: string
  body: string
  rating: number
  created_at: string
  is_mine: boolean
  media: CommunityMedia[]
}

export type ContentReport = {
  id: string
  content_type: 'guestbook' | 'review'
  content_id: string
  reason: string
  details: string | null
  status: 'open' | 'reviewed' | 'actioned' | 'dismissed'
  created_at: string
  target_excerpt: string
  target_author: string
}

export type HiddenCommunityContent = {
  id: string
  content_type: 'guestbook' | 'review'
  schedule_id: string | null
  author_name: string
  body: string
  rating: number | null
  created_at: string
  media: Array<Pick<CommunityMedia, 'id' | 'signed_url'>>
}

export type CommunitySettings = {
  community_enabled: boolean
  uploads_enabled: boolean
  media_views_enabled: boolean
}

export type AdminCommunitySettings = CommunitySettings & {
  storage_used_bytes: number
  storage_limit_bytes: number
  database_used_bytes: number
  database_warning_bytes: number
  database_stop_bytes: number
  egress_warning_bytes: number
  egress_stop_bytes: number
}
