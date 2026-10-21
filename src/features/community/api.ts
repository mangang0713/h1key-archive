import type { AdminCommunitySettings, CommunityMedia, CommunitySettings, ContentReport, GuestbookPost, HiddenCommunityContent, MyCommunityContent, ScheduleReview } from './types'
import { supabase, supabaseConfig } from '../../lib/supabase/client'

const PAGE_SIZE = 12

export class CommunityRequestError extends Error {
  readonly code: string
  readonly status?: number

  constructor(
    code: string,
    message: string,
    status?: number,
  ) {
    super(message)
    this.name = 'CommunityRequestError'
    this.code = code
    this.status = status
  }
}

export class GuestbookPhotoUploadError extends CommunityRequestError {
  readonly postId: string
  readonly createdPost: boolean
  readonly uploadedPhotoCount: number
  readonly totalPhotoCount: number

  constructor(
    postId: string,
    createdPost: boolean,
    uploadedPhotoCount: number,
    totalPhotoCount: number,
    error: unknown,
  ) {
    const details = getCommunityErrorDetails(error)
    super(details.code, details.message, error instanceof CommunityRequestError ? error.status : undefined)
    this.name = 'GuestbookPhotoUploadError'
    this.postId = postId
    this.createdPost = createdPost
    this.uploadedPhotoCount = uploadedPhotoCount
    this.totalPhotoCount = totalPhotoCount
  }
}

export function getCommunityErrorDetails(error: unknown) {
  if (error instanceof CommunityRequestError) return { code: error.code, message: error.message }
  return {
    code: error instanceof Error ? 'REQUEST_FAILED' : 'UNKNOWN_ERROR',
    message: error instanceof Error ? error.message : '요청을 완료하지 못했습니다.',
  }
}

async function readFunctionError(error: unknown) {
  if (!(error instanceof Error)) return new CommunityRequestError('FUNCTION_REQUEST_FAILED', '요청을 처리하지 못했습니다.')

  const context = (error as Error & { context?: unknown }).context
  if (context instanceof Response) {
    const body = await context.clone().json().catch(() => null) as { code?: unknown; error?: unknown } | null
    const status = context.status
    const message = typeof body?.error === 'string'
      ? body.error
      : status >= 500
        ? '서버에서 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
        : `요청을 처리하지 못했습니다. (HTTP ${status})`
    const code = typeof body?.code === 'string' ? body.code : `HTTP_${status}`
    return new CommunityRequestError(code, message, status)
  }

  if (error.name === 'FunctionsFetchError') {
    return new CommunityRequestError('NETWORK_ERROR', '서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.')
  }
  if (error.name === 'FunctionsRelayError') {
    return new CommunityRequestError('EDGE_FUNCTION_UNAVAILABLE', '요청 처리 서버가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.')
  }
  return new CommunityRequestError('FUNCTION_REQUEST_FAILED', error.message || '요청을 처리하지 못했습니다.')
}

function requireClient() {
  if (!supabase) throw new Error('Supabase 연결 설정이 필요합니다. .env.example을 참고해 주세요.')
  return supabase
}

async function invoke<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const client = requireClient()
  const { data, error } = await client.functions.invoke('community-api', { body: { action, ...payload } })
  if (error) throw await readFunctionError(error)
  if (data?.error) throw new CommunityRequestError(String(data.code ?? 'REQUEST_REJECTED'), String(data.error))
  return data as T
}

async function addSignedMedia<T extends { id: string; media?: CommunityMedia[] }>(items: T[]): Promise<T[]> {
  if (!items.length) return items
  const client = requireClient()
  const { data, error } = await client.functions.invoke('community-api', {
    body: { action: 'signed-media', mediaIds: items.flatMap((item) => item.media?.map((media) => media.id) ?? []) },
  })
  if (error || data?.error) {
    // 사진 URL 기능이 중지되어도 글과 후기는 계속 읽을 수 있게 합니다.
    return items.map((item) => ({ ...item, media: item.media?.map((media) => ({ ...media, signed_url: undefined })) }))
  }
  const urls = new Map<string, string>((data?.urls ?? []).map((row: { id: string; signedUrl: string }) => [row.id, row.signedUrl]))
  return items.map((item) => ({
    ...item,
    media: item.media?.map((media) => ({ ...media, signed_url: urls.get(media.id) })),
  }))
}

export async function getCommunitySettings(): Promise<CommunitySettings> {
  const client = requireClient()
  const { data, error } = await client.rpc('get_public_community_settings').single()
  if (error) throw new Error(error.message)
  return data as CommunitySettings
}

export async function getGuestbookPosts(page = 0) {
  const client = requireClient()
  const { data, error } = await client.rpc('get_public_guestbook', { p_offset: page * PAGE_SIZE, p_limit: PAGE_SIZE })
  if (error) throw new Error(error.message)
  return addSignedMedia((data ?? []).map((row: Record<string, unknown>) => ({ ...row, media: (row.media ?? []) as CommunityMedia[] })) as unknown as GuestbookPost[])
}

export async function getScheduleReviews(scheduleId: string, page = 0) {
  const client = requireClient()
  const { data, error } = await client.rpc('get_public_schedule_reviews', { p_schedule_id: scheduleId, p_offset: page * PAGE_SIZE, p_limit: PAGE_SIZE })
  if (error) throw new Error(error.message)
  return addSignedMedia((data ?? []).map((row: Record<string, unknown>) => ({ ...row, media: (row.media ?? []) as CommunityMedia[] })) as unknown as ScheduleReview[])
}

export async function getOwnScheduleReview(scheduleId: string) {
  const client = requireClient()
  const { data, error } = await client.rpc('get_own_schedule_review', { p_schedule_id: scheduleId }).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const row = data as unknown as Omit<ScheduleReview, 'is_mine'> & { media: CommunityMedia[] }
  return (await addSignedMedia([{ ...row, is_mine: true }]))[0]
}

export async function getScheduleReactions(scheduleId: string, userId?: string) {
  const client = requireClient()
  void userId
  const { data: rawStats, error } = await client.rpc('get_schedule_reaction_stats', { p_schedule_id: scheduleId }).single()
  if (error) throw new Error(error.message)
  const data = rawStats as { like_count: number | string; liked: boolean; own_review_id: string | null }
  return { likeCount: Number(data.like_count), liked: data.liked, ownReviewId: data.own_review_id ?? undefined }
}

export async function saveGuestbookPost(body: string, media: File[], postId?: string, turnstileToken?: string) {
  const createdPost = !postId
  const result = await invoke<{ id: string }>(postId ? 'edit-guestbook' : 'create-guestbook', { postId, body, turnstileToken })
  let uploadedPhotoCount = 0
  for (const file of media) {
    try {
      await uploadCommunityImage(file, 'guestbook', result.id, turnstileToken)
      uploadedPhotoCount += 1
    } catch (error) {
      throw new GuestbookPhotoUploadError(result.id, createdPost, uploadedPhotoCount, media.length, error)
    }
  }
  return result
}

export async function acceptCommunityTerms() {
  return invoke('accept-community-terms')
}

export async function saveScheduleReview(scheduleId: string, body: string, rating: number, media: File[], reviewId?: string, turnstileToken?: string) {
  const result = await invoke<{ id: string }>(reviewId ? 'edit-review' : 'create-review', { reviewId, scheduleId, body, rating, turnstileToken })
  for (const file of media) await uploadCommunityImage(file, 'review', result.id, turnstileToken)
  return result
}

async function uploadCommunityImage(file: File, parentType: 'guestbook' | 'review', parentId: string, turnstileToken?: string) {
  const client = requireClient()
  const { data: { session } } = await client.auth.getSession()
  if (!session) throw new CommunityRequestError('AUTH_REQUIRED', '사진 업로드는 로그인 후 이용할 수 있습니다.')
  const formData = new FormData()
  formData.set('action', 'upload-image')
  formData.set('parentType', parentType)
  formData.set('parentId', parentId)
  if (turnstileToken) formData.set('turnstileToken', turnstileToken)
  try { formData.set('file', await prepareCommunityImage(file)) }
  catch (error) {
    throw new CommunityRequestError('IMAGE_PREPARATION_FAILED', error instanceof Error ? error.message : '사진을 업로드용으로 준비하지 못했습니다.')
  }

  let response: Response
  try {
    response = await fetch(`${supabaseConfig.url}/functions/v1/community-api`, {
      method: 'POST',
      headers: { apikey: supabaseConfig.publishableKey!, Authorization: `Bearer ${session.access_token}` },
      body: formData,
    })
  } catch {
    throw new CommunityRequestError('UPLOAD_NETWORK_ERROR', '사진 전송 중 서버와 연결이 끊겼습니다. 남겨진 글에서 사진이 등록됐는지 확인해 주세요.')
  }

  const rawResponse = await response.text().catch(() => '')
  let data: { code?: unknown; error?: unknown } | null = null
  try { data = rawResponse ? JSON.parse(rawResponse) as { code?: unknown; error?: unknown } : null } catch { /* 비 JSON 응답은 상태 코드로 안내합니다. */ }
  if (!response.ok) {
    const message = typeof data?.error === 'string'
      ? data.error
      : response.status >= 500
        ? '사진 저장 서버에서 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
        : `사진 업로드에 실패했습니다. (HTTP ${response.status})`
    const code = typeof data?.code === 'string' ? data.code : `UPLOAD_HTTP_${response.status}`
    throw new CommunityRequestError(code, message, response.status)
  }
}

async function prepareCommunityImage(file: File): Promise<File> {
  if (file.size <= 1024 * 1024) return file
  if (file.size > 20 * 1024 * 1024) throw new Error('원본 사진이 너무 큽니다. 20MB 이하 사진을 선택해 주세요.')
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPG, PNG, WebP 사진만 올릴 수 있습니다.')
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file) }
  catch { throw new Error('이미지 파일을 읽지 못했습니다.') }
  try {
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('이미지 변환을 시작하지 못했습니다.')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    let quality = 0.88
    let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
    while (blob && blob.size > 1024 * 1024 && quality > 0.52) {
      quality -= 0.1
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
    }
    if (!blob || blob.size > 1024 * 1024) throw new Error('사진을 1MB 이하로 줄이지 못했습니다. 더 작은 사진을 선택해 주세요.')
    if (blob.type !== 'image/webp') throw new Error('이 브라우저에서 사진을 줄이지 못했습니다. 1MB 이하 사진을 선택해 주세요.')
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp', lastModified: Date.now() })
  } finally { bitmap.close() }
}

export async function toggleScheduleLike(scheduleId: string) {
  return invoke<{ liked: boolean }>('toggle-like', { scheduleId })
}

export async function deleteCommunityContent(contentType: 'guestbook' | 'review', contentId: string) {
  return invoke('delete-content', { contentType, contentId })
}

export async function hideCommunityContent(contentType: 'guestbook' | 'review', contentId: string, reason: string) {
  return invoke('hide-content', { contentType, contentId, reason })
}

export async function deleteCommunityMedia(mediaId: string) {
  return invoke('delete-media', { mediaId })
}

export async function reportCommunityContent(contentType: 'guestbook' | 'review', contentId: string, reason: string, details: string) {
  return invoke('report-content', { contentType, contentId, reason, details })
}

export async function getAdminReports() {
  return invoke<ContentReport[]>('get-admin-reports')
}

export async function getAdminHiddenContent() {
  return invoke<HiddenCommunityContent[]>('get-admin-hidden-content')
}

export async function getMyCommunityContent() {
  return invoke<MyCommunityContent[]>('get-my-content')
}

export async function submitCommunityAppeal(contentType: 'guestbook' | 'review', contentId: string, reason: string) {
  return invoke('submit-appeal', { contentType, contentId, reason })
}

export async function resolveCommunityAppeal(appealId: string, decision: 'approve' | 'reject', reason: string) {
  return invoke('resolve-appeal', { appealId, decision, reason })
}

export async function restoreHiddenCommunityContent(contentType: 'guestbook' | 'review', contentId: string) {
  return invoke('restore-hidden-content', { contentType, contentId })
}

export async function moderateReport(reportId: string, decision: 'dismiss' | 'hide', reason = '') {
  return invoke('moderate-report', { reportId, decision, reason })
}

export async function getAdminCommunitySettings(): Promise<AdminCommunitySettings> {
  return invoke<AdminCommunitySettings>('get-admin-settings')
}

export async function updateAdminCommunitySettings(settings: Partial<Pick<CommunitySettings, 'community_enabled' | 'uploads_enabled' | 'media_views_enabled'>>) {
  return invoke('update-admin-settings', { settings })
}

export async function updateProfile(displayName: string) {
  const client = requireClient()
  const { data, error } = await client.rpc('save_my_display_name', { p_display_name: displayName })
  if (error) throw new Error(error.message)
  return data
}

export async function deleteAccount() {
  return invoke('delete-account')
}

export async function getProfile(userId: string) {
  const client = requireClient()
  const { data, error } = await client.from('profiles').select('id, display_name').eq('id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  return data as { id: string; display_name: string } | null
}

export function communityConfigured() {
  return Boolean(supabase)
}
