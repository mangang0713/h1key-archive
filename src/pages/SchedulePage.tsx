import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { locations } from '../data/locations'
import { schedules } from '../data/schedules'
import { songs } from '../data/songs'
import { useAuth } from '../features/auth/AuthProvider'
import { acceptCommunityTerms, deleteCommunityContent, deleteCommunityMedia, getOwnScheduleReview, getScheduleReactions, getScheduleReviews, reportCommunityContent, saveScheduleReview, toggleScheduleLike } from '../features/community/api'
import { claimHessxlAdmin, isCurrentArchiveAdmin } from '../features/community/adminApi'
import type { CommunityMedia, ScheduleReview } from '../features/community/types'
import TurnstileWidget from '../components/security/TurnstileWidget'
import './CommunityPages.css'

function SchedulePage() {
  const { scheduleId = '' } = useParams()
  const { user } = useAuth()
  const [adminCheck, setAdminCheck] = useState<{ userId: string; isAdmin: boolean } | null>(null)
  const userIdForFetch = user?.id
  const schedule = useMemo(() => schedules.find((item) => item.id === scheduleId), [scheduleId])
  const location = schedule?.locationId ? locations.find((item) => item.id === schedule.locationId) : undefined
  const scheduleIdForFetch = schedule?.id
  const [reviews, setReviews] = useState<ScheduleReview[]>([])
  const [reviewPage, setReviewPage] = useState(0)
  const [hasMoreReviews, setHasMoreReviews] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [liked, setLiked] = useState(false)
  const [ownReviewId, setOwnReviewId] = useState<string>()
  const [body, setBody] = useState('')
  const [rating, setRating] = useState(5)
  const [files, setFiles] = useState<File[]>([])
  const [editingId, setEditingId] = useState<string>()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileResetKey, setTurnstileResetKey] = useState(0)
  const [termsAccepted, setTermsAccepted] = useState(false)

  const refresh = useCallback(async () => {
    if (!scheduleIdForFetch) return
    try {
      const [nextReviews, reactions] = await Promise.all([
        getScheduleReviews(scheduleIdForFetch),
        getScheduleReactions(scheduleIdForFetch, userIdForFetch),
      ])
      let visibleReviews = nextReviews
      if (reactions.ownReviewId && !nextReviews.some((review) => review.id === reactions.ownReviewId)) {
        const ownReview = await getOwnScheduleReview(scheduleIdForFetch)
        if (ownReview) visibleReviews = [...nextReviews, ownReview]
      }
      setReviews(visibleReviews)
      setReviewPage(0)
      setHasMoreReviews(nextReviews.length === 12)
      setLikeCount(reactions.likeCount)
      setLiked(reactions.liked)
      setOwnReviewId(reactions.ownReviewId)
    } catch (error) { setMessage(error instanceof Error ? error.message : '일정 반응을 불러오지 못했습니다.') }
  }, [scheduleIdForFetch, userIdForFetch])

  // 페이지 진입과 로그인 상태 변경 시 원격 후기를 읽어옵니다.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (!user) return
    let active = true
    void claimHessxlAdmin().then(isCurrentArchiveAdmin).then((isAdmin) => {
      if (active) setAdminCheck({ userId: user.id, isAdmin })
    }).catch(() => {
      if (active) setAdminCheck({ userId: user.id, isAdmin: false })
    })
    return () => { active = false }
  }, [user])

  if (!schedule) return <section className="community-page"><div className="community-alert">해당 일정을 찾을 수 없습니다.</div><Link to="/">지도에서 찾기</Link></section>
  const currentSchedule = schedule
  const songById = new Map(songs.map((song) => [song.id, song]))

  async function handleLike() {
    setBusy(true)
    try { const result = await toggleScheduleLike(currentSchedule.id); setLiked(result.liked); setLikeCount((count) => count + (result.liked ? 1 : -1)) }
    catch (error) { setMessage(error instanceof Error ? error.message : '좋아요를 반영하지 못했습니다.') }
    finally { setBusy(false) }
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!body.trim()) { setMessage('후기를 입력해 주세요.'); return }
    if (files.length > 3 || files.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      setMessage('JPG, PNG, WebP 사진을 게시물당 3장까지 선택해 주세요. 1MB 초과 사진은 업로드 전에 자동으로 줄입니다.')
      return
    }
    setBusy(true)
    try {
      if (!termsAccepted) throw new Error('공개 안내를 확인하고 동의해 주세요.')
      await acceptCommunityTerms()
      await saveScheduleReview(currentSchedule.id, body.trim(), rating, files, editingId, turnstileToken)
      setBody(''); setFiles([]); setEditingId(undefined)
      setTurnstileResetKey((key) => key + 1)
      setTurnstileToken('')
      setTermsAccepted(false)
      await refresh()
      setMessage('후기를 저장했습니다.')
    } catch (error) { setMessage(error instanceof Error ? error.message : '후기를 저장하지 못했습니다.') }
    finally { setBusy(false) }
  }

  async function handleDelete(reviewId: string) {
    if (!window.confirm(isAdmin ? '관리자 권한으로 이 후기와 첨부 사진을 모두 삭제할까요?' : '후기를 삭제할까요?')) return
    try { await deleteCommunityContent('review', reviewId); await refresh() }
    catch (error) { setMessage(error instanceof Error ? error.message : '후기를 삭제하지 못했습니다.') }
  }

  async function removePhoto(media: CommunityMedia) {
    if (!window.confirm('이 사진만 삭제할까요? 후기는 그대로 남습니다.')) return
    try { await deleteCommunityMedia(media.id); await refresh() }
    catch (error) { setMessage(error instanceof Error ? error.message : '사진을 삭제하지 못했습니다.') }
  }

  async function loadMoreReviews() {
    try {
      const nextPage = reviewPage + 1
      const next = await getScheduleReviews(currentSchedule.id, nextPage)
      setReviews((current) => [...current, ...next.filter((review) => !current.some((item) => item.id === review.id))])
      setReviewPage(nextPage)
      setHasMoreReviews(next.length === 12)
    } catch (error) { setMessage(error instanceof Error ? error.message : '후기를 더 불러오지 못했습니다.') }
  }

  async function handleReport(review: ScheduleReview) {
    const reason = window.prompt('신고 사유를 선택해 주세요: 스팸, 괴롭힘, 개인정보, 기타')
    if (!reason) return
    try { await reportCommunityContent('review', review.id, reason, ''); setMessage('신고를 접수했습니다.') }
    catch (error) { setMessage(error instanceof Error ? error.message : '신고를 접수하지 못했습니다.') }
  }

  const isAdmin = Boolean(user && adminCheck?.userId === user.id && adminCheck.isAdmin)

  return (
    <section className="community-page schedule-community-page">
      <Link className="back-link" to="/">← 지도</Link>
      <div className="community-heading">
        <span className="community-eyebrow">SCHEDULE RECORD</span>
        <h1>{schedule.title}</h1>
        <p>{schedule.date.replaceAll('-', '.')} · {location?.name ?? (schedule.eventFormat === 'online' ? '온라인' : '장소 미확인')}</p>
      </div>
      {schedule.startTime && <p className="schedule-time">시작 시간 {schedule.startTime}</p>}
      <section className="schedule-setlist-card"><h2>세트리스트</h2>
        {['known', 'partial', 'provisional'].includes(schedule.setlistStatus)
          ? <><p className="community-small">{schedule.setlistStatus === 'known' ? '확인된 공연 순서' : schedule.setlistStatus === 'partial' ? '일부 확인 · 아는 곡만 표시' : '임시 입력 · 실제 기록 확인 필요'}</p><ol>{schedule.setlist.map((songId) => <li key={songId}>{songById.get(songId)?.title ?? `곡 정보 오류 (${songId})`}</li>)}</ol></>
          : <p className="community-small">{schedule.setlistStatus === 'none' ? '이 행사에서는 곡 공연이 없었음을 확인했습니다.' : '세트리스트를 아직 확인하지 못했습니다.'}</p>}
      </section>
      <div className="schedule-community-actions">
        <button className={`like-button${liked ? ' is-liked' : ''}`} type="button" disabled={!user || busy} onClick={() => void handleLike()} aria-pressed={liked}>♥ {liked ? '좋아요' : '좋아요'} · {likeCount}</button>
        {!user && <span>좋아요와 후기를 남기려면 <Link to={`/account?returnTo=/schedule/${currentSchedule.id}`}>로그인</Link>해 주세요.</span>}
      </div>
      <section className="schedule-reviews">
        <div className="community-list-heading"><h2>후기</h2><span>{reviews.length}개 표시</span></div>
        {user && (!ownReviewId || editingId) && <form className="community-form review-form" onSubmit={(event) => void submitReview(event)}>
          <label htmlFor="review-body">다녀온 느낌을 남겨 주세요</label>
          <div className="rating-field"><label htmlFor="review-rating">별점</label><select id="review-rating" value={rating} onChange={(event) => setRating(Number(event.target.value))}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{'★'.repeat(value)} ({value}점)</option>)}</select></div>
          <textarea id="review-body" value={body} maxLength={1200} rows={4} onChange={(event) => setBody(event.target.value)} placeholder="공연과 행사에 대한 후기를 적어 주세요." />
          <label className="file-picker" htmlFor="review-images">사진 추가 (최대 3장)</label>
          <input id="review-images" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 3))} />
          <TurnstileWidget onToken={setTurnstileToken} resetKey={turnstileResetKey} />
          <label className="consent-field"><input type="checkbox" required checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} /><span><Link to="/policy/privacy" target="_blank" rel="noreferrer">개인정보·공개 안내</Link>를 확인했고, 후기와 선택한 사진이 공개되는 데 동의합니다.</span></label>
          <button className="primary-button" disabled={busy}>{editingId ? '후기 수정' : '후기 등록'}</button>
          {editingId && <button className="text-button" type="button" onClick={() => { setEditingId(undefined); setBody(''); setFiles([]) }}>수정 취소</button>}
        </form>}
        {!user && <p className="empty-state">후기를 작성하려면 로그인이 필요합니다.</p>}
        {reviews.map((review) => <article className="user-post-card" key={review.id}>
          <header><strong>{review.author_name}</strong><span className="review-rating" aria-label={`${review.rating}점`}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span><time dateTime={review.created_at}>{new Date(review.created_at).toLocaleDateString('ko-KR')}</time></header>
          <p className="user-post-body">{review.body}</p>
          {!!review.media?.length && <div className="user-photo-grid">{review.media.map((media) => media.signed_url && <figure className="user-photo-item" key={media.id}>
            <img src={media.signed_url} loading="lazy" alt="후기 첨부 사진" />
            {isAdmin && <button className="admin-photo-delete" type="button" aria-label="후기 사진 삭제" onClick={() => void removePhoto(media)}>사진 삭제</button>}
          </figure>)}</div>}
          {!!review.media?.length && !review.media.some((media) => media.signed_url) && <p className="community-small">사진을 지금은 불러올 수 없습니다.</p>}
          {user && (review.is_mine || isAdmin) && <div className="post-actions">
            {review.is_mine && <button className="text-button" type="button" onClick={() => { setEditingId(review.id); setBody(review.body); setRating(review.rating) }}>수정하기</button>}
            <button className="text-button danger-text" type="button" onClick={() => void handleDelete(review.id)}>{isAdmin && !review.is_mine ? '관리자 삭제' : '삭제'}</button>
          </div>}
          {user && !review.is_mine && <button className="text-button" type="button" onClick={() => void handleReport(review)}>신고</button>}
        </article>)}
        {hasMoreReviews && <button className="secondary-button load-more" type="button" onClick={() => void loadMoreReviews()}>후기 더 보기</button>}
      </section>
      {message && <p className="community-message" role="status">{message}</p>}
    </section>
  )
}

export default SchedulePage
