import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const turnstileSecret = Deno.env.get('TURNSTILE_SECRET_KEY')
const communityTermsVersion = '2026-10-19-v1'
const allowedOrigins = new Set((Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:5173,http://127.0.0.1:5173,https://mangang0713.github.io').split(',').map((value) => value.trim()).filter(Boolean))

const admin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

function corsHeaders(origin: string | null) {
  const headers = new Headers({
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  })
  if (origin && allowedOrigins.has(origin)) headers.set('Access-Control-Allow-Origin', origin)
  return headers
}

function respond(body: unknown, status = 200, origin: string | null = null) {
  const headers = corsHeaders(origin)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(body), { status, headers })
}

function getBearer(request: Request) {
  const value = request.headers.get('Authorization') ?? ''
  return value.startsWith('Bearer ') ? value.slice(7) : ''
}

async function requireUser(request: Request) {
  if (!supabaseUrl || !anonKey || !admin) throw new Error('Supabase 서버 설정이 완료되지 않았습니다.')
  const token = getBearer(request)
  if (!token) throw new Error('로그인이 필요합니다.')
  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) throw new Error('로그인 세션을 확인할 수 없습니다.')
  return { user: data.user, client, admin }
}

async function settings(client: SupabaseClient) {
  const { data, error } = await client.from('community_settings')
    .select('community_enabled, uploads_enabled, media_views_enabled, storage_used_bytes, storage_limit_bytes')
    .eq('id', true).single()
  if (error || !data) throw new Error('커뮤니티 설정을 확인하지 못했습니다.')
  return data
}

async function adminSettings(client: SupabaseClient, userId: string) {
  if (!await isAdmin(client, userId)) throw new Error('관리자만 운영 설정을 볼 수 있습니다.')
  const { data, error } = await client.from('community_settings').select('community_enabled, uploads_enabled, media_views_enabled, storage_used_bytes, storage_limit_bytes').eq('id', true).single()
  if (error || !data) throw new Error('운영 설정을 불러오지 못했습니다.')
  const { data: databaseBytes } = await client.rpc('get_database_size_bytes')
  return {
    ...data,
    database_used_bytes: Number(databaseBytes ?? 0),
    database_warning_bytes: 350 * 1024 * 1024,
    database_stop_bytes: 400 * 1024 * 1024,
    egress_warning_bytes: Math.round(3.5 * 1024 ** 3),
    egress_stop_bytes: 4 * 1024 ** 3,
  }
}

async function assertCommunityEnabled(client: SupabaseClient) {
  const current = await settings(client)
  if (!current.community_enabled) throw new Error('사용자 기능을 잠시 중단했습니다. 지도와 일정 기록은 계속 볼 수 있습니다.')
  const { data: databaseBytes, error } = await client.rpc('get_database_size_bytes')
  if (error) throw new Error('데이터베이스 사용량을 확인하지 못했습니다.')
  if (Number(databaseBytes) >= 400 * 1024 * 1024) throw new Error('데이터베이스 사용량이 안전 한도에 도달해 사용자 기능 쓰기를 잠시 중단했습니다.')
  return current
}

async function takeLimit(client: SupabaseClient, userId: string, action: string, limit: number, seconds = 60) {
  const { data, error } = await client.rpc('consume_community_rate_limit', {
    p_user_id: userId,
    p_action: action,
    p_limit: limit,
    p_window_seconds: seconds,
  })
  if (error) throw new Error('요청 횟수를 확인하지 못했습니다.')
  if (!data) throw new Error('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.')
}

async function verifyTurnstile(request: Request, token: unknown) {
  if (!turnstileSecret) return
  if (typeof token !== 'string' || token.length < 10) throw new Error('봇 확인을 완료해 주세요.')
  const form = new FormData()
  form.set('secret', turnstileSecret)
  form.set('response', token)
  const ip = request.headers.get('CF-Connecting-IP')
  if (ip) form.set('remoteip', ip)
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
  const result = await response.json() as { success?: boolean; hostname?: string }
  const allowedHosts = new Set([...allowedOrigins].map((value) => new URL(value).hostname))
  if (!result.success || !result.hostname || !allowedHosts.has(result.hostname)) throw new Error('봇 확인에 실패했습니다. 다시 시도해 주세요.')
}

async function profileName(client: SupabaseClient, userId: string) {
  const { data, error } = await client.from('profiles').select('display_name').eq('id', userId).single()
  if (error || !data) throw new Error('공개 표시 이름을 불러오지 못했습니다.')
  return String(data.display_name)
}

async function acceptCommunityTerms(client: SupabaseClient, userId: string) {
  const { error } = await client.from('profiles').update({
    community_terms_accepted_at: new Date().toISOString(),
    community_terms_version: communityTermsVersion,
  }).eq('id', userId)
  if (error) throw new Error('공개 안내 동의를 저장하지 못했습니다.')
}

async function requireCommunityTerms(client: SupabaseClient, userId: string) {
  const { data, error } = await client.from('profiles').select('community_terms_version').eq('id', userId).single()
  if (error || data?.community_terms_version !== communityTermsVersion) throw new Error('게시물과 사진 공개 안내를 확인하고 동의해 주세요.')
}

async function isAdmin(client: SupabaseClient, userId: string) {
  const { data, error } = await client.rpc('is_archive_admin_user', { p_user_id: userId })
  if (error) throw new Error('관리자 권한을 확인하지 못했습니다.')
  return data === true
}

function text(value: unknown, max: number) {
  if (typeof value !== 'string') throw new Error('입력 내용이 올바르지 않습니다.')
  const result = value.trim()
  if (result.length < 1 || result.length > max) throw new Error(`입력은 1~${max}자여야 합니다.`)
  return result
}

async function removeMediaForContent(client: SupabaseClient, contentType: string, contentId: string) {
  const key = contentType === 'guestbook' ? 'guestbook_post_id' : 'schedule_review_id'
  const { data: media, error } = await client.from('community_media').select('id, owner_id, object_path, byte_size').eq(key, contentId)
  if (error) throw new Error('첨부 사진 정보를 읽을 수 없습니다.')
  if (!media?.length) return
  const paths = media.map((item) => item.object_path)
  const { error: storageError } = await client.storage.from('community-images').remove(paths)
  if (storageError) throw new Error('첨부 사진 파일을 지우지 못했습니다.')
  for (const item of media) {
    if (item.owner_id) await client.rpc('release_community_media', { p_user_id: item.owner_id, p_byte_size: item.byte_size })
  }
  const { error: deleteError } = await client.from('community_media').delete().in('id', media.map((item) => item.id))
  if (deleteError) throw new Error('첨부 사진 기록을 지우지 못했습니다.')
}

async function signedMedia(client: SupabaseClient, ids: unknown) {
  const current = await settings(client)
  if (!current.media_views_enabled) throw new Error('사진 열람을 잠시 중단했습니다.')
  if (!Array.isArray(ids) || ids.length > 36 || ids.some((id) => typeof id !== 'string')) throw new Error('사진 요청 형식이 올바르지 않습니다.')
  const uniqueIds = [...new Set(ids as string[])]
  if (uniqueIds.length === 0) return { urls: [] }
  const { data: media, error } = await client.from('community_media').select('id, object_path, guestbook_post_id, schedule_review_id').in('id', uniqueIds)
  if (error) throw new Error('사진 정보를 불러오지 못했습니다.')
  const urls = []
  for (const item of media ?? []) {
    let published = false
    if (item.guestbook_post_id) {
      const { data } = await client.from('guestbook_posts').select('status').eq('id', item.guestbook_post_id).maybeSingle()
      published = data?.status === 'published'
    } else if (item.schedule_review_id) {
      const { data } = await client.from('schedule_reviews').select('status').eq('id', item.schedule_review_id).maybeSingle()
      published = data?.status === 'published'
    }
    if (!published) continue
    const { data, error: signError } = await client.storage.from('community-images').createSignedUrl(item.object_path, 300)
    if (!signError && data?.signedUrl) urls.push({ id: item.id, signedUrl: data.signedUrl })
  }
  return { urls }
}

async function allowMediaRequest(request: Request, client: SupabaseClient) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = request.headers.get('cf-connecting-ip') ?? forwardedFor ?? 'unknown-client'
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))
  const ipHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const { data, error } = await client.rpc('consume_public_media_rate_limit', {
    p_ip_hash: ipHash,
    p_limit: 50,
    p_window_seconds: 60,
  })
  if (error) throw new Error('사진 요청 제한을 확인하지 못했습니다.')
  return Boolean(data)
}

async function deleteCommunityContent(client: SupabaseClient, contentType: string, contentId: string, userId: string) {
  const table = contentType === 'guestbook' ? 'guestbook_posts' : 'schedule_reviews'
  const { data: post, error: ownershipError } = await client.from(table).select('id, user_id').eq('id', contentId).maybeSingle()
  if (ownershipError || !post) throw new Error('게시물을 찾지 못했습니다.')
  if (post.user_id !== userId && !await isAdmin(client, userId)) throw new Error('본인 게시물만 삭제할 수 있습니다.')
  await removeMediaForContent(client, contentType, contentId)
  const { error } = await client.from(table).delete().eq('id', contentId)
  if (error) throw new Error('게시물을 삭제하지 못했습니다.')
}

async function deleteCommunityMedia(client: SupabaseClient, mediaId: string, userId: string) {
  if (!await isAdmin(client, userId)) throw new Error('관리자만 첨부 사진을 직접 삭제할 수 있습니다.')
  const { data: media, error: mediaError } = await client.from('community_media')
    .select('id, owner_id, object_path, byte_size').eq('id', mediaId).maybeSingle()
  if (mediaError || !media) throw new Error('첨부 사진을 찾지 못했습니다.')
  const { error: storageError } = await client.storage.from('community-images').remove([media.object_path])
  if (storageError) throw new Error('첨부 사진 파일을 지우지 못했습니다.')
  if (media.owner_id) {
    const { error: quotaError } = await client.rpc('release_community_media', { p_user_id: media.owner_id, p_byte_size: media.byte_size })
    if (quotaError) throw new Error('사진 사용량을 갱신하지 못했습니다.')
  }
  const { error: deleteError } = await client.from('community_media').delete().eq('id', media.id)
  if (deleteError) throw new Error('첨부 사진 기록을 지우지 못했습니다.')
}

async function uploadImage(request: Request, userId: string, client: SupabaseClient, form: FormData) {
  const current = await assertCommunityEnabled(client)
  await requireCommunityTerms(client, userId)
  if (!current.uploads_enabled) throw new Error('사진 업로드를 잠시 중단했습니다.')
  await takeLimit(client, userId, 'upload-image', 6, 3600)
  const parentType = form.get('parentType')
  const parentId = form.get('parentId')
  const file = form.get('file')
  if ((parentType !== 'guestbook' && parentType !== 'review') || typeof parentId !== 'string' || !(file instanceof File)) {
    throw new Error('사진 업로드 정보가 올바르지 않습니다.')
  }
  if (file.size < 1 || file.size > 1048576 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('JPG, PNG, WebP 사진을 장당 1MB 이하로 올려 주세요.')
  }
  const buffer = new Uint8Array(await file.arrayBuffer())
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  const png = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
  const webp = new TextDecoder().decode(buffer.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(buffer.slice(8, 12)) === 'WEBP'
  if (!(file.type === 'image/jpeg' && jpeg) && !(file.type === 'image/png' && png) && !(file.type === 'image/webp' && webp)) {
    throw new Error('파일 내용과 이미지 형식이 일치하지 않습니다.')
  }
  const parentTable = parentType === 'guestbook' ? 'guestbook_posts' : 'schedule_reviews'
  const parentKey = parentType === 'guestbook' ? 'guestbook_post_id' : 'schedule_review_id'
  const { data: parent, error: parentError } = await client.from(parentTable).select('id').eq('id', parentId).eq('user_id', userId).eq('status', 'published').maybeSingle()
  if (parentError || !parent) throw new Error('사진을 연결할 본인 게시물을 찾지 못했습니다.')
  const { count } = await client.from('community_media').select('id', { count: 'exact', head: true }).eq(parentKey, parentId)
  if ((count ?? 0) >= 3) throw new Error('게시물당 사진은 최대 3장까지 첨부할 수 있습니다.')
  const { data: reservationId, error: reserveError } = await client.rpc('reserve_community_media', { p_user_id: userId, p_byte_size: file.size })
  if (reserveError || !reservationId) throw new Error('사진 저장 한도에 도달했거나 업로드가 잠시 중단되었습니다.')
  const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp'
  const objectPath = `${userId}/${crypto.randomUUID()}.${extension}`
  const { error: uploadError } = await client.storage.from('community-images').upload(objectPath, file, {
    contentType: file.type,
    cacheControl: '300',
    upsert: false,
  })
  if (uploadError) {
    await client.rpc('release_community_media_reservation', { p_reservation_id: reservationId })
    throw new Error('사진 파일을 저장하지 못했습니다.')
  }
  const { data: mediaId, error: finalizeError } = await client.rpc('finalize_community_media', {
    p_reservation_id: reservationId,
    p_object_path: objectPath,
    p_content_type: file.type,
    p_parent_type: parentType,
    p_parent_id: parentId,
  })
  if (finalizeError || !mediaId) {
    await client.storage.from('community-images').remove([objectPath])
    await client.rpc('release_community_media_reservation', { p_reservation_id: reservationId })
    throw new Error('사진 한도 예약을 확정하지 못했습니다.')
  }
  return { mediaId }
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin')
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (request.method !== 'POST') return respond({ error: 'POST 요청만 허용됩니다.' }, 405, origin)
  if (origin && !allowedOrigins.has(origin)) return respond({ error: '허용되지 않은 도메인입니다.' }, 403, origin)
  try {
    if (!admin) throw new Error('Supabase Edge Function 비밀 설정을 확인해 주세요.')
    const contentType = request.headers.get('content-type') ?? ''
    const contentLength = Number(request.headers.get('content-length') ?? 0)
    if (contentType.includes('multipart/form-data') && contentLength > 1250000) return respond({ error: '업로드 요청이 너무 큽니다. 사진을 줄여서 다시 시도해 주세요.' }, 413, origin)
    const form = contentType.includes('multipart/form-data') ? await request.formData() : null
    const rawBody = form ? Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === 'string')) : await request.json()
    const action = form?.get('action') ?? rawBody.action
    if (action === 'signed-media') {
      if (!await allowMediaRequest(request, admin)) return respond({ error: '사진 요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.' }, 429, origin)
      return respond(await signedMedia(admin, rawBody.mediaIds), 200, origin)
    }
    const { user } = await requireUser(request)
    if (action === 'accept-community-terms') {
      await acceptCommunityTerms(admin, user.id)
      return respond({ accepted: true, version: communityTermsVersion }, 200, origin)
    }
    if (form && action === 'upload-image') {
      return respond(await uploadImage(request, user.id, admin, form), 200, origin)
    }
    const adminClient = admin
    const userId = user.id

    if (action === 'get-admin-settings') return respond(await adminSettings(adminClient, userId), 200, origin)
    if (action === 'get-admin-reports') {
      if (!await isAdmin(adminClient, userId)) throw new Error('관리자만 신고 목록을 볼 수 있습니다.')
      const { data, error } = await adminClient.from('content_reports')
        .select('id, content_type, content_id, reason, details, status, created_at, target_excerpt, target_author')
        .order('created_at', { ascending: true }).limit(100)
      if (error) throw new Error('신고 목록을 불러오지 못했습니다.')
      return respond(data ?? [], 200, origin)
    }
    if (action === 'update-admin-settings') {
      if (!await isAdmin(adminClient, userId)) throw new Error('관리자만 운영 설정을 바꿀 수 있습니다.')
      const next = rawBody.settings
      if (!next || Object.keys(next).some((key) => !['community_enabled', 'uploads_enabled', 'media_views_enabled'].includes(key))
        || Object.values(next).some((value) => typeof value !== 'boolean')) throw new Error('운영 설정 형식이 올바르지 않습니다.')
      const { error } = await adminClient.from('community_settings').update({ ...next, updated_at: new Date().toISOString() }).eq('id', true)
      if (error) throw new Error('운영 설정을 저장하지 못했습니다.')
      return respond({ saved: true }, 200, origin)
    }

    const captchaActions = new Set(['create-guestbook', 'edit-guestbook', 'create-review', 'edit-review'])
    if (captchaActions.has(String(action))) await verifyTurnstile(request, rawBody.turnstileToken)
    if (!['moderate-report', 'get-admin-settings', 'update-admin-settings', 'get-admin-reports', 'delete-content', 'delete-media', 'delete-account'].includes(String(action))) {
      await assertCommunityEnabled(adminClient)
    }

    if (action === 'create-guestbook') {
      await requireCommunityTerms(adminClient, userId)
      await takeLimit(adminClient, userId, 'create-guestbook', 3, 3600)
      const body = text(rawBody.body, 1200)
      const author = await profileName(adminClient, userId)
      const { data, error } = await adminClient.from('guestbook_posts').insert({ user_id: userId, author_name: author, body }).select('id').single()
      if (error) throw new Error('방명록 글을 저장하지 못했습니다.')
      return respond({ id: data.id }, 200, origin)
    }
    if (action === 'edit-guestbook') {
      await requireCommunityTerms(adminClient, userId)
      await takeLimit(adminClient, userId, 'edit-guestbook', 8, 3600)
      const { error } = await adminClient.from('guestbook_posts').update({ body: text(rawBody.body, 1200), updated_at: new Date().toISOString() }).eq('id', rawBody.postId).eq('user_id', userId)
      if (error) throw new Error('본인 방명록 글만 수정할 수 있습니다.')
      return respond({ id: rawBody.postId }, 200, origin)
    }
    if (action === 'create-review' || action === 'edit-review') {
      await requireCommunityTerms(adminClient, userId)
      await takeLimit(adminClient, userId, 'save-review', 5, 3600)
      const scheduleId = text(rawBody.scheduleId, 100)
      const body = text(rawBody.body, 1200)
      const rating = Number(rawBody.rating)
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('별점은 1~5점으로 선택해 주세요.')
      const author = await profileName(adminClient, userId)
      if (action === 'edit-review') {
        const { error } = await adminClient.from('schedule_reviews').update({ body, rating, updated_at: new Date().toISOString() }).eq('id', rawBody.reviewId).eq('user_id', userId)
        if (error) throw new Error('본인 후기만 수정할 수 있습니다.')
        return respond({ id: rawBody.reviewId }, 200, origin)
      }
      const { data, error } = await adminClient.from('schedule_reviews').insert({ schedule_id: scheduleId, user_id: userId, author_name: author, body, rating }).select('id').single()
      if (error) throw new Error('일정당 후기 하나만 작성할 수 있습니다. 기존 후기를 수정해 주세요.')
      return respond({ id: data.id }, 200, origin)
    }
    if (action === 'toggle-like') {
      await takeLimit(adminClient, userId, 'toggle-like', 30, 3600)
      const scheduleId = text(rawBody.scheduleId, 100)
      const { data: existing } = await adminClient.from('schedule_likes').select('id').eq('schedule_id', scheduleId).eq('user_id', userId).maybeSingle()
      if (existing) {
        const { error } = await adminClient.from('schedule_likes').delete().eq('id', existing.id)
        if (error) throw new Error('좋아요를 취소하지 못했습니다.')
        return respond({ liked: false }, 200, origin)
      }
      const { error } = await adminClient.from('schedule_likes').insert({ schedule_id: scheduleId, user_id: userId })
      if (error) throw new Error('좋아요를 저장하지 못했습니다.')
      return respond({ liked: true }, 200, origin)
    }
    if (action === 'delete-content') {
      await takeLimit(adminClient, userId, 'delete-content', 10, 3600)
      const contentType = rawBody.contentType
      if (contentType !== 'guestbook' && contentType !== 'review') throw new Error('삭제할 게시물 종류가 올바르지 않습니다.')
      await deleteCommunityContent(adminClient, contentType, text(rawBody.contentId, 100), userId)
      return respond({ deleted: true }, 200, origin)
    }
    if (action === 'delete-media') {
      await takeLimit(adminClient, userId, 'delete-media', 20, 3600)
      await deleteCommunityMedia(adminClient, text(rawBody.mediaId, 100), userId)
      return respond({ deleted: true }, 200, origin)
    }
    if (action === 'report-content') {
      await takeLimit(adminClient, userId, 'report-content', 5, 86400)
      const contentType = rawBody.contentType
      if (contentType !== 'guestbook' && contentType !== 'review') throw new Error('신고 대상이 올바르지 않습니다.')
      const table = contentType === 'guestbook' ? 'guestbook_posts' : 'schedule_reviews'
      const { data: target, error: targetError } = await adminClient.from(table).select('body, author_name, status, user_id').eq('id', rawBody.contentId).maybeSingle()
      if (targetError || !target || target.status !== 'published') throw new Error('신고할 공개 게시물을 찾지 못했습니다.')
      if (target.user_id === userId) throw new Error('본인 게시물은 신고할 수 없습니다.')
      const reason = text(rawBody.reason, 80)
      const details = typeof rawBody.details === 'string' && rawBody.details.trim() ? rawBody.details.trim().slice(0, 500) : null
      const { error } = await adminClient.from('content_reports').insert({ reporter_id: userId, content_type: contentType, content_id: rawBody.contentId, reason, details, target_excerpt: target.body.slice(0, 500), target_author: target.author_name })
      if (error) throw new Error('이미 신고했거나 신고를 저장하지 못했습니다.')
      return respond({ reported: true }, 200, origin)
    }
    if (action === 'update-profile') {
      await takeLimit(adminClient, userId, 'update-profile', 5, 3600)
      const displayName = text(rawBody.displayName, 40)
      const { error } = await adminClient.from('profiles').update({ display_name: displayName, updated_at: new Date().toISOString() }).eq('id', userId)
      if (error) throw new Error('표시 이름을 저장하지 못했습니다.')
      return respond({ saved: true }, 200, origin)
    }
    if (action === 'moderate-report') {
      if (!await isAdmin(adminClient, userId)) throw new Error('관리자만 신고를 처리할 수 있습니다.')
      const decision = rawBody.decision
      if (!['dismiss', 'hide', 'delete'].includes(decision)) throw new Error('신고 처리 방식이 올바르지 않습니다.')
      const { data: report, error: reportError } = await adminClient.from('content_reports').select('*').eq('id', rawBody.reportId).single()
      if (reportError) throw new Error('신고 내역을 찾지 못했습니다.')
      if (decision === 'dismiss') {
        const { error } = await adminClient.from('content_reports').update({ status: 'dismissed' }).eq('id', report.id)
        if (error) throw new Error('신고 기각을 저장하지 못했습니다.')
      } else if (decision === 'hide') {
        const table = report.content_type === 'guestbook' ? 'guestbook_posts' : 'schedule_reviews'
        const { error: contentError } = await adminClient.from(table).update({ status: 'hidden' }).eq('id', report.content_id)
        const { error: reportError } = await adminClient.from('content_reports').update({ status: 'actioned' }).eq('id', report.id)
        if (contentError || reportError) throw new Error('신고 숨김 처리를 저장하지 못했습니다.')
      } else {
        await removeMediaForContent(adminClient, report.content_type, report.content_id)
        const table = report.content_type === 'guestbook' ? 'guestbook_posts' : 'schedule_reviews'
        const { error: contentError } = await adminClient.from(table).delete().eq('id', report.content_id)
        const { error: reportError } = await adminClient.from('content_reports').update({ status: 'actioned' }).eq('id', report.id)
        if (contentError || reportError) throw new Error('신고 삭제 처리를 저장하지 못했습니다.')
      }
      return respond({ processed: true }, 200, origin)
    }
    if (action === 'delete-account') {
      await takeLimit(adminClient, userId, 'delete-account', 1, 86400)
      const { data: media, error: mediaError } = await adminClient.from('community_media').select('object_path, byte_size').eq('owner_id', userId)
      if (mediaError) throw new Error('계정 사진을 확인하지 못했습니다.')
      if (media?.length) {
        const { error } = await adminClient.storage.from('community-images').remove(media.map((item) => item.object_path))
        if (error) throw new Error('계정 사진 파일을 지우지 못했습니다.')
        for (const item of media) await adminClient.rpc('release_community_media', { p_user_id: userId, p_byte_size: item.byte_size })
        await adminClient.from('community_media').delete().eq('owner_id', userId)
      }
      await adminClient.from('guestbook_posts').update({ user_id: null, author_name: '익명 사용자' }).eq('user_id', userId)
      await adminClient.from('schedule_reviews').update({ user_id: null, author_name: '익명 사용자' }).eq('user_id', userId)
      await adminClient.from('schedule_likes').delete().eq('user_id', userId)
      const { error } = await adminClient.auth.admin.deleteUser(userId)
      if (error) throw new Error('계정을 삭제하지 못했습니다.')
      return respond({ deleted: true }, 200, origin)
    }
    return respond({ error: '지원하지 않는 요청입니다.' }, 400, origin)
  } catch (error) {
    return respond({ error: error instanceof Error ? error.message : '요청을 처리하지 못했습니다.' }, 400, origin)
  }
})
