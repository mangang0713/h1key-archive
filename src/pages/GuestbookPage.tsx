import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import { acceptCommunityTerms, deleteCommunityContent, deleteCommunityMedia, getCommunityErrorDetails, getGuestbookPosts, hideCommunityContent, reportCommunityContent, saveGuestbookPost } from '../features/community/api'
import { claimHessxlAdmin, isCurrentArchiveAdmin } from '../features/community/adminApi'
import type { CommunityMedia, GuestbookPost } from '../features/community/types'
import GuestbookComposer from '../components/community/GuestbookComposer'
import GuestbookReportDialog from '../components/community/GuestbookReportDialog'
import TurnstileWidget from '../components/security/TurnstileWidget'
import './CommunityPages.css'

function GuestbookPage() {
  const { user, configured } = useAuth()
  const [adminCheck, setAdminCheck] = useState<{ userId: string; isAdmin: boolean } | null>(null)
  const [posts, setPosts] = useState<GuestbookPost[]>([])
  const [editingPostId, setEditingPostId] = useState<string>()
  const [editBody, setEditBody] = useState('')
  const [editTermsAccepted, setEditTermsAccepted] = useState(false)
  const [editConsentError, setEditConsentError] = useState('')
  const [editError, setEditError] = useState<{ code: string; message: string } | null>(null)
  const [editTurnstileToken, setEditTurnstileToken] = useState('')
  const [editTurnstileResetKey, setEditTurnstileResetKey] = useState(0)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [reportingPostId, setReportingPostId] = useState<string>()
  const [reportedPosts, setReportedPosts] = useState<{ userId: string | undefined; ids: Set<string> }>(() => ({ userId: undefined, ids: new Set() }))
  const [reportErrors, setReportErrors] = useState<Record<string, string>>({})
  const [reportTarget, setReportTarget] = useState<GuestbookPost | null>(null)
  const [reportDetails, setReportDetails] = useState('')
  const [reportDialogStep, setReportDialogStep] = useState<'form' | 'success'>('form')
  const editConsentCheckboxRef = useRef<HTMLInputElement>(null)

  const loadPosts = useCallback(async (nextPage = 0, append = false) => {
    if (!configured) return
    try {
      const rows = await getGuestbookPosts(nextPage)
      setPosts((current) => append ? [...current, ...rows] : rows)
      setHasMore(rows.length === 12)
      setPage(nextPage)
      return rows
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '방명록을 불러오지 못했습니다.')
      return null
    }
  }, [configured])

  // 최초 목록 데이터는 네트워크 요청 결과로 상태를 갱신합니다.
  useEffect(() => { void loadPosts() }, [loadPosts])

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

  function openInlineEditor(post: GuestbookPost) {
    setEditingPostId(post.id)
    setEditBody(post.body)
    setEditTermsAccepted(true)
    setEditConsentError('')
    setEditError(null)
    setEditTurnstileToken('')
    setEditTurnstileResetKey((key) => key + 1)
  }

  function closeInlineEditor() {
    setEditingPostId(undefined)
    setEditBody('')
    setEditTermsAccepted(false)
    setEditConsentError('')
    setEditError(null)
    setEditTurnstileToken('')
    setEditTurnstileResetKey((key) => key + 1)
  }

  async function submitInlineEdit(event: FormEvent<HTMLFormElement>, post: GuestbookPost) {
    event.preventDefault()
    if (editBody.trim().length < 2) {
      setEditError({ code: 'INVALID_BODY', message: '축하 글을 두 글자 이상 입력해 주세요.' })
      return
    }
    if (!editTermsAccepted) {
      setEditConsentError('글을 수정하려면 공개 안내를 확인하고 동의해 주세요.')
      editConsentCheckboxRef.current?.focus()
      return
    }

    setBusy(true)
    setEditError(null)
    setEditConsentError('')
    try {
      await acceptCommunityTerms()
      await saveGuestbookPost(editBody.trim(), [], post.id, editTurnstileToken)
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, body: editBody.trim() } : item))
      closeInlineEditor()
      setMessage('축하 글을 수정했습니다.')
    } catch (error) {
      setEditError(getCommunityErrorDetails(error))
    } finally {
      setBusy(false)
    }
  }

  async function removePost(post: GuestbookPost) {
    const moderatingAnotherUsersPost = isAdmin && !post.is_mine
    if (moderatingAnotherUsersPost) {
      const reason = window.prompt('작성자에게 표시할 숨김 사유를 입력해 주세요. (최대 1000자)')?.trim()
      if (!reason) return
      if (reason.length > 1000) { setMessage('숨김 사유는 1000자 이내로 입력해 주세요.'); return }
      try {
        await hideCommunityContent('guestbook', post.id, reason)
        await loadPosts()
        setMessage('글을 숨겼습니다. 작성자는 내 게시글에서 7일 안에 이의제기할 수 있습니다.')
      } catch (error) { setMessage(error instanceof Error ? error.message : '글을 숨기지 못했습니다.') }
      return
    }
    if (!window.confirm('이 글과 첨부 사진을 영구 삭제할까요? 삭제한 글과 신고 기록은 복구할 수 없습니다.')) return
    try {
      await deleteCommunityContent('guestbook', post.id)
      await loadPosts()
    } catch (error) { setMessage(error instanceof Error ? error.message : '글을 삭제하지 못했습니다.') }
  }

  async function removePhoto(media: CommunityMedia) {
    if (!window.confirm('이 사진만 삭제할까요? 글은 그대로 남습니다.')) return
    try {
      await deleteCommunityMedia(media.id)
      await loadPosts()
    } catch (error) { setMessage(error instanceof Error ? error.message : '사진을 삭제하지 못했습니다.') }
  }

  function openReportDialog(post: GuestbookPost) {
    if (reportingPostId || reportedPostIds.has(post.id)) return
    setReportDetails('')
    setReportDialogStep('form')
    setReportErrors((current) => { const next = { ...current }; delete next[post.id]; return next })
    setReportTarget(post)
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const post = reportTarget
    if (!post || reportingPostId) return
    setReportingPostId(post.id)
    try {
      await reportCommunityContent('guestbook', post.id, '기타', reportDetails.trim())
      setReportedPosts((current) => ({
        userId: user?.id,
        ids: new Set(current.userId === user?.id ? current.ids : []).add(post.id),
      }))
      setReportDialogStep('success')
    } catch (error) {
      setReportErrors((current) => ({ ...current, [post.id]: error instanceof Error ? error.message : '신고를 접수하지 못했습니다.' }))
    } finally { setReportingPostId(undefined) }
  }

  function closeReportDialog() {
    if (reportingPostId) return
    setReportTarget(null)
    setReportDetails('')
    setReportDialogStep('form')
  }

  const isAdmin = Boolean(user && adminCheck?.userId === user.id && adminCheck.isAdmin)
  const canReportContent = Boolean(user && adminCheck?.userId === user.id && !isAdmin)
  const reportedPostIds = reportedPosts.userId === user?.id ? reportedPosts.ids : new Set<string>()
  const visiblePosts = posts.filter((post) => !reportedPostIds.has(post.id))

  return (
    <section className="community-page">
      <div className="community-heading">
        <span className="community-eyebrow">HAPPY RIINA DAY</span>
        <h1>리이나에게 전하는 축하</h1>
        <p>리이나의 생일을 함께 축하해 주세요. 글과 사진은 공개됩니다.</p>
      </div>
      {!configured && <div className="community-alert">방명록은 Supabase 연결 설정 후 열립니다. 현재 지도 아카이브는 그대로 이용할 수 있습니다.</div>}
      {configured && !user && <div className="community-alert">글을 남기려면 먼저 <Link to="/account?returnTo=/guestbook">로그인</Link>해 주세요. 기존 글은 로그인 없이 볼 수 있습니다.</div>}
      {configured && user && <GuestbookComposer
        editingPostId={editingPostId}
        busy={busy}
        setBusy={setBusy}
        page={page}
        posts={posts}
        loadPosts={loadPosts}
        onMessage={setMessage}
      />}
      {message && <p className="community-message" role="status">{message}</p>}
      <div className="community-list-heading"><h2>남겨진 글</h2><span>{visiblePosts.length}개 표시</span></div>
      {visiblePosts.length === 0 && configured && <p className="empty-state">표시할 글이 없습니다. 신고한 글은 내 목록에서 숨겨집니다.</p>}
      <div className="guestbook-list">
        {visiblePosts.map((post) => (
          <article className="user-post-card" key={post.id}>
            <header><strong>{post.author_name}</strong><time dateTime={post.created_at}>{new Date(post.created_at).toLocaleString('ko-KR', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hourCycle: 'h23',
              timeZone: 'Asia/Seoul',
            })}</time></header>
            {editingPostId === post.id ? <form className="community-form guestbook-inline-editor" onSubmit={(event) => void submitInlineEdit(event, post)}>
              <label htmlFor={`guestbook-edit-${post.id}`}>축하 글 수정</label>
              <textarea id={`guestbook-edit-${post.id}`} autoFocus value={editBody} maxLength={1200} rows={4} onChange={(event) => setEditBody(event.target.value)} />
              <span className="guestbook-edit-count">{editBody.length}/1200자</span>
              <label className="consent-field"><input ref={editConsentCheckboxRef} type="checkbox" checked={editTermsAccepted} aria-invalid={editConsentError ? true : undefined} aria-describedby={editConsentError ? `guestbook-edit-consent-error-${post.id}` : undefined} onChange={(event) => {
                setEditTermsAccepted(event.target.checked)
                if (event.target.checked) setEditConsentError('')
              }} /><span><Link to="/policy/privacy" target="_blank" rel="noreferrer">개인정보·공개 안내</Link>를 확인했고, 글과 사진이 공개되는 데 동의합니다.</span></label>
              {editConsentError && <p className="consent-error" id={`guestbook-edit-consent-error-${post.id}`} role="alert">{editConsentError}</p>}
              {editError && <div className="community-error-details" role="alert"><strong>수정 요청 오류 · {editError.code}</strong><span>{editError.message}</span></div>}
              <div className="guestbook-turnstile" role="group" aria-label="Cloudflare 보안 확인"><TurnstileWidget onToken={setEditTurnstileToken} resetKey={editTurnstileResetKey} appearance="interaction-only" /></div>
              <div className="guestbook-inline-actions">
                <button className="secondary-button" type="button" disabled={busy} onClick={closeInlineEditor}>취소</button>
                <button className="primary-button" type="submit" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
              </div>
            </form> : <p className="user-post-body">{post.body}</p>}
            {!!post.media?.length && <div className="user-photo-grid">{post.media.map((media) => media.signed_url && <figure className="user-photo-item" key={media.id}>
              <img src={media.signed_url} loading="lazy" alt="방명록 첨부 사진" />
              {user && (post.is_mine || isAdmin) && <button className="admin-photo-delete" type="button" aria-label="방명록 사진 삭제" onClick={() => void removePhoto(media)}>사진 삭제</button>}
            </figure>)}</div>}
            {!!post.media?.length && !post.media.some((media) => media.signed_url) && <p className="community-small">사진을 지금은 불러올 수 없습니다.</p>}
            {user && (post.is_mine || isAdmin) && editingPostId !== post.id && <div className="post-actions">
              {post.is_mine && <button type="button" className="text-button" onClick={() => openInlineEditor(post)}>수정</button>}
              {(post.is_mine || isAdmin) && <button type="button" className="text-button danger-text" onClick={() => void removePost(post)}>{isAdmin && !post.is_mine ? '숨김 처리' : '삭제'}</button>}
            </div>}
            {canReportContent && !post.is_mine && <div className="post-report-action">
              <button type="button" className="text-button" disabled={reportingPostId === post.id || reportedPostIds.has(post.id)} onClick={() => openReportDialog(post)}>
                {reportedPostIds.has(post.id) ? '신고 접수됨' : '신고'}
              </button>
              {reportErrors[post.id] && <p className="report-error" role="alert">{reportErrors[post.id]}</p>}
            </div>}
          </article>
        ))}
      </div>
      {hasMore && <button className="secondary-button load-more" type="button" onClick={() => void loadPosts(page + 1, true)}>더 불러오기</button>}
      <GuestbookReportDialog
        post={reportTarget}
        error={reportTarget ? reportErrors[reportTarget.id] : undefined}
        submitting={reportingPostId !== undefined}
        step={reportDialogStep}
        details={reportDetails}
        onDetailsChange={setReportDetails}
        onSubmit={(event) => void submitReport(event)}
        onClose={closeReportDialog}
      />
    </section>
  )
}

export default GuestbookPage
