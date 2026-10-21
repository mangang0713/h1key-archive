import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import { acceptCommunityTerms, deleteCommunityContent, deleteCommunityMedia, getCommunityErrorDetails, getGuestbookPosts, GuestbookPhotoUploadError, hideCommunityContent, reportCommunityContent, saveGuestbookPost } from '../features/community/api'
import { claimHessxlAdmin, isCurrentArchiveAdmin } from '../features/community/adminApi'
import type { CommunityMedia, GuestbookPost } from '../features/community/types'
import TurnstileWidget from '../components/security/TurnstileWidget'
import './CommunityPages.css'

const MAX_POST_IMAGES = 3

function GuestbookPage() {
  const { user, configured } = useAuth()
  const [adminCheck, setAdminCheck] = useState<{ userId: string; isAdmin: boolean } | null>(null)
  const [posts, setPosts] = useState<GuestbookPost[]>([])
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<Array<{ file: File; url: string }>>([])
  const previewUrlsRef = useRef<string[]>([])
  const [resumePostId, setResumePostId] = useState<string>()
  const [editingPostId, setEditingPostId] = useState<string>()
  const [editBody, setEditBody] = useState('')
  const [editTermsAccepted, setEditTermsAccepted] = useState(false)
  const [editConsentError, setEditConsentError] = useState('')
  const [editError, setEditError] = useState<{ code: string; message: string } | null>(null)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [submissionError, setSubmissionError] = useState<{ code: string; message: string } | null>(null)
  const [reportingPostId, setReportingPostId] = useState<string>()
  const [reportedPosts, setReportedPosts] = useState<{ userId: string | undefined; ids: Set<string> }>(() => ({ userId: undefined, ids: new Set() }))
  const [reportErrors, setReportErrors] = useState<Record<string, string>>({})
  const [reportTarget, setReportTarget] = useState<GuestbookPost | null>(null)
  const [reportDetails, setReportDetails] = useState('')
  const [reportDialogStep, setReportDialogStep] = useState<'form' | 'success'>('form')
  const reportDialogRef = useRef<HTMLDialogElement>(null)
  const reportTextareaRef = useRef<HTMLTextAreaElement>(null)
  const reportPrimaryButtonRef = useRef<HTMLButtonElement>(null)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileResetKey, setTurnstileResetKey] = useState(0)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [consentError, setConsentError] = useState('')
  const consentCheckboxRef = useRef<HTMLInputElement>(null)
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

  useEffect(() => () => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  useEffect(() => {
    if (!reportTarget) return
    const dialog = reportDialogRef.current
    if (!dialog) return
    dialog.showModal()
    reportTextareaRef.current?.focus()
    return () => { if (dialog.open) dialog.close() }
  }, [reportTarget])

  useEffect(() => {
    if (reportTarget && reportDialogStep === 'success') reportPrimaryButtonRef.current?.focus()
  }, [reportDialogStep, reportTarget])

  function replaceSelectedPhotos(nextFiles: File[]) {
    setSubmissionError(null)
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    const previews = nextFiles.map((file) => ({ file, url: URL.createObjectURL(file) }))
    previewUrlsRef.current = previews.map((preview) => preview.url)
    setFiles(nextFiles)
    setPhotoPreviews(previews)
  }

  function addSelectedPhotos(newFiles: File[]) {
    const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}:${file.type}`
    const existing = new Set(files.map(fileKey))
    const additions = newFiles.filter((file) => {
      const key = fileKey(file)
      if (existing.has(key)) return false
      existing.add(key)
      return true
    })
    const remaining = MAX_POST_IMAGES - files.length
    if (additions.length > remaining) {
      setMessage(`사진은 게시물당 최대 ${MAX_POST_IMAGES}장까지 선택할 수 있어 ${remaining}장만 추가했습니다.`)
    } else if (additions.length < newFiles.length) {
      setMessage('이미 선택한 사진은 중복으로 추가하지 않았습니다.')
    } else {
      setMessage('')
    }
    replaceSelectedPhotos([...files, ...additions.slice(0, remaining)])
  }

  async function submitPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (editingPostId) return
    if (body.trim().length < 2) { setMessage('축하 글을 두 글자 이상 입력해 주세요.'); return }
    if (files.length > MAX_POST_IMAGES) { setMessage(`사진은 게시물당 최대 ${MAX_POST_IMAGES}장까지 선택할 수 있습니다.`); return }
    const invalidFile = files.find((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    if (invalidFile) { setMessage('JPG, PNG, WebP 사진을 선택해 주세요. 1MB가 넘는 사진은 업로드 전에 자동으로 줄입니다.'); return }
    if (!termsAccepted) {
      setConsentError('글을 등록하려면 공개 안내를 확인하고 동의해 주세요.')
      consentCheckboxRef.current?.focus()
      return
    }
    setConsentError('')
    setBusy(true)
    setMessage('')
    setSubmissionError(null)
    const continuingUpload = Boolean(resumePostId)
    try {
      await acceptCommunityTerms()
      await saveGuestbookPost(body.trim(), files, resumePostId, turnstileToken)
      setBody('')
      replaceSelectedPhotos([])
      setResumePostId(undefined)
      await loadPosts()
      setTurnstileResetKey((key) => key + 1)
      setTurnstileToken('')
      setTermsAccepted(false)
      setMessage(continuingUpload ? '남은 사진을 글에 추가했습니다.' : '축하 글을 등록했습니다.')
    } catch (error) {
      const details = getCommunityErrorDetails(error)
      if (error instanceof GuestbookPhotoUploadError) {
        const previousPhotoCount = posts.find((post) => post.id === error.postId)?.media?.length ?? 0
        const refreshedPosts = await loadPosts(error.createdPost ? 0 : page)
        const refreshedPhotoCount = refreshedPosts?.find((post) => post.id === error.postId)?.media?.length
        const confirmedPhotoCount = Math.min(error.totalPhotoCount, Math.max(
          error.uploadedPhotoCount,
          refreshedPhotoCount === undefined ? 0 : Math.max(0, refreshedPhotoCount - previousPhotoCount),
        ))

        if (confirmedPhotoCount === error.totalPhotoCount) {
          setBody('')
          replaceSelectedPhotos([])
          setResumePostId(undefined)
          setTurnstileResetKey((key) => key + 1)
          setTurnstileToken('')
          setTermsAccepted(false)
          setMessage(`요청 응답은 실패했지만 글과 사진 ${confirmedPhotoCount}장을 남겨진 글에서 확인했습니다.`)
        } else {
          setResumePostId(error.postId)
          replaceSelectedPhotos(files.slice(confirmedPhotoCount))
          setMessage(refreshedPosts
            ? `글은 저장되었습니다. 사진 ${confirmedPhotoCount}/${error.totalPhotoCount}장이 연결된 것을 확인했습니다. 남은 사진은 이 글을 수정해 다시 첨부할 수 있습니다.`
            : '글 저장 요청은 완료됐지만 목록에서 사진 상태를 다시 확인하지 못했습니다. 새 글을 다시 만들지 말고 남겨진 글을 새로고침해 확인해 주세요.')
          setSubmissionError(details)
        }
      } else {
        setSubmissionError(details)
      }
    }
    finally { setBusy(false) }
  }

  function openInlineEditor(post: GuestbookPost) {
    setEditingPostId(post.id)
    setEditBody(post.body)
    setEditTermsAccepted(true)
    setEditConsentError('')
    setEditError(null)
    setTurnstileToken('')
    setTurnstileResetKey((key) => key + 1)
  }

  function closeInlineEditor() {
    setEditingPostId(undefined)
    setEditBody('')
    setEditTermsAccepted(false)
    setEditConsentError('')
    setEditError(null)
    setTurnstileToken('')
    setTurnstileResetKey((key) => key + 1)
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
      await saveGuestbookPost(editBody.trim(), [], post.id, turnstileToken)
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
      {configured && user && (
        <>
          <form className="community-form guestbook-form" onSubmit={(event) => void submitPost(event)}>
            <label htmlFor="guestbook-body">축하 글</label>
            <textarea id="guestbook-body" value={body} maxLength={1200} rows={4} placeholder="리이나에게 전하고 싶은 마음을 적어 주세요." onChange={(event) => setBody(event.target.value)} />
            <div className="form-footer">
              <label className="file-picker" htmlFor="guestbook-images">사진 추가 (최대 3장)</label>
              <input id="guestbook-images" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => {
                addSelectedPhotos(Array.from(event.target.files ?? []))
                event.target.value = ''
              }} />
              <button className="primary-button" disabled={busy || Boolean(editingPostId)}>{busy ? '등록 중…' : resumePostId ? '남은 사진 추가' : '등록'}</button>
              <span>{files.length}/{MAX_POST_IMAGES}장 선택 · {body.length}/1200자 · 계정당 사진 10장, 총 10MB까지</span>
            </div>
            {photoPreviews.length > 0 && <div className="guestbook-photo-previews" aria-label="업로드할 사진 미리보기">
              {photoPreviews.map(({ file, url }, index) => <figure key={`${file.name}-${file.lastModified}-${index}`}>
                <img src={url} alt={`${file.name} 미리보기`} />
                <figcaption>{file.name}</figcaption>
                <button type="button" aria-label={`${file.name} 사진 제거`} onClick={() => replaceSelectedPhotos(files.filter((_, fileIndex) => fileIndex !== index))}>×</button>
              </figure>)}
            </div>}
            <label className="consent-field"><input ref={consentCheckboxRef} type="checkbox" checked={termsAccepted} aria-invalid={consentError ? true : undefined} aria-describedby={consentError ? 'guestbook-consent-error' : undefined} onChange={(event) => {
              setTermsAccepted(event.target.checked)
              if (event.target.checked) setConsentError('')
            }} /><span><Link to="/policy/privacy" target="_blank" rel="noreferrer">개인정보·공개 안내</Link>를 확인했고, 글과 선택한 사진이 공개되는 데 동의합니다.</span></label>
            {consentError && <p className="consent-error" id="guestbook-consent-error" role="alert">{consentError}</p>}
            {!editingPostId && <div className="guestbook-turnstile" role="group" aria-label="Cloudflare 보안 확인"><TurnstileWidget onToken={setTurnstileToken} resetKey={turnstileResetKey} appearance="interaction-only" /></div>}
            {resumePostId && <button className="text-button" type="button" onClick={() => { setResumePostId(undefined); setBody(''); replaceSelectedPhotos([]) }}>사진 이어 올리기 취소</button>}
          </form>
        </>
      )}
      {message && <p className="community-message" role="status">{message}</p>}
      {submissionError && <div className="community-error-details" role="alert"><strong>등록 요청 오류 · {submissionError.code}</strong><span>{submissionError.message}</span></div>}
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
              <div className="guestbook-turnstile" role="group" aria-label="Cloudflare 보안 확인"><TurnstileWidget onToken={setTurnstileToken} resetKey={turnstileResetKey} appearance="interaction-only" /></div>
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
      <dialog ref={reportDialogRef} className="report-confirmation" aria-labelledby="report-confirmation-title" onCancel={(event) => { event.preventDefault(); closeReportDialog() }}>
        {reportDialogStep === 'form' && <form className="report-dialog-content" onSubmit={(event) => void submitReport(event)}>
          <h2 id="report-confirmation-title">게시물 신고</h2>
          <p>신고 사유를 적어 주세요. 설명은 선택 사항이며, 비워도 신고할 수 있습니다.</p>
          <label htmlFor="guestbook-report-details">신고 사유 (선택)</label>
          <textarea ref={reportTextareaRef} id="guestbook-report-details" value={reportDetails} maxLength={500} rows={4} placeholder="예: 개인정보가 포함되어 있어요." onChange={(event) => setReportDetails(event.target.value)} />
          <span className="report-dialog-count">{reportDetails.length}/500자</span>
          {reportTarget && reportErrors[reportTarget.id] && <p className="report-error" role="alert">{reportErrors[reportTarget.id]}</p>}
          <div className="report-dialog-actions">
            <button className="secondary-button" type="button" disabled={reportingPostId !== undefined} onClick={closeReportDialog}>취소</button>
            <button className="primary-button" type="submit" disabled={reportingPostId !== undefined}>{reportingPostId ? '접수 중…' : '신고하기'}</button>
          </div>
        </form>}
        {reportDialogStep === 'success' && <div className="report-dialog-content report-confirmation-content">
          <span className="report-confirmation-icon" aria-hidden="true">✓</span>
          <h2 id="report-confirmation-title">신고가 접수되었습니다</h2>
          <p>관리자가 내용을 확인할 예정입니다. 이 글은 내 방명록 목록에서 숨겼습니다.</p>
          <button ref={reportPrimaryButtonRef} className="primary-button" type="button" onClick={closeReportDialog}>확인</button>
        </div>}
      </dialog>
    </section>
  )
}

export default GuestbookPage
