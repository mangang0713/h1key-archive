import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import { acceptCommunityTerms, deleteCommunityContent, getGuestbookPosts, reportCommunityContent, saveGuestbookPost } from '../features/community/api'
import type { GuestbookPost } from '../features/community/types'
import TurnstileWidget from '../components/security/TurnstileWidget'
import './CommunityPages.css'

const MAX_POST_IMAGES = 3

function GuestbookPage() {
  const { user, configured } = useAuth()
  const [posts, setPosts] = useState<GuestbookPost[]>([])
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [editingId, setEditingId] = useState<string>()
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileResetKey, setTurnstileResetKey] = useState(0)
  const [termsAccepted, setTermsAccepted] = useState(false)

  const loadPosts = useCallback(async (nextPage = 0, append = false) => {
    if (!configured) return
    try {
      const rows = await getGuestbookPosts(nextPage)
      setPosts((current) => append ? [...current, ...rows] : rows)
      setHasMore(rows.length === 12)
      setPage(nextPage)
    } catch (error) { setMessage(error instanceof Error ? error.message : '방명록을 불러오지 못했습니다.') }
  }, [configured])

  // 최초 목록 데이터는 네트워크 요청 결과로 상태를 갱신합니다.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadPosts() }, [loadPosts])

  async function submitPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (body.trim().length < 2) { setMessage('축하 글을 두 글자 이상 입력해 주세요.'); return }
    if (files.length > MAX_POST_IMAGES) { setMessage(`사진은 게시물당 최대 ${MAX_POST_IMAGES}장까지 선택할 수 있습니다.`); return }
    const invalidFile = files.find((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    if (invalidFile) { setMessage('JPG, PNG, WebP 사진을 선택해 주세요. 1MB가 넘는 사진은 업로드 전에 자동으로 줄입니다.'); return }
    setBusy(true)
    setMessage('')
    try {
      if (!termsAccepted) throw new Error('공개 안내를 확인하고 동의해 주세요.')
      await acceptCommunityTerms()
      await saveGuestbookPost(body.trim(), files, editingId, turnstileToken)
      setBody('')
      setFiles([])
      setEditingId(undefined)
      await loadPosts()
      setTurnstileResetKey((key) => key + 1)
      setTurnstileToken('')
      setTermsAccepted(false)
      setMessage('축하 글을 등록했습니다.')
    } catch (error) { setMessage(error instanceof Error ? error.message : '글을 등록하지 못했습니다.') }
    finally { setBusy(false) }
  }

  async function removePost(post: GuestbookPost) {
    if (!window.confirm('이 글을 삭제할까요?')) return
    try {
      await deleteCommunityContent('guestbook', post.id)
      await loadPosts()
    } catch (error) { setMessage(error instanceof Error ? error.message : '글을 삭제하지 못했습니다.') }
  }

  async function reportPost(post: GuestbookPost) {
    const reason = window.prompt('신고 사유를 입력해 주세요. (예: 스팸, 괴롭힘, 개인정보, 기타)')
    if (!reason?.trim()) return
    try {
      await reportCommunityContent('guestbook', post.id, reason.trim(), '')
      setMessage('신고를 접수했습니다. 신고만으로 글이 자동 숨김 처리되지는 않습니다.')
    } catch (error) { setMessage(error instanceof Error ? error.message : '신고를 접수하지 못했습니다.') }
  }

  return (
    <section className="community-page">
      <div className="community-heading">
        <span className="community-eyebrow">HAPPY H1-KEY DAY</span>
        <h1>축하와 응원의 글</h1>
        <p>기억하고 싶은 축하와 응원을 남겨 주세요. 글과 사진은 공개됩니다.</p>
      </div>
      {!configured && <div className="community-alert">방명록은 Supabase 연결 설정 후 열립니다. 현재 지도 아카이브는 그대로 이용할 수 있습니다.</div>}
      {configured && !user && <div className="community-alert">글을 남기려면 먼저 <Link to="/account?returnTo=/guestbook">로그인</Link>해 주세요. 기존 글은 로그인 없이 볼 수 있습니다.</div>}
      {configured && user && (
        <form className="community-form guestbook-form" onSubmit={(event) => void submitPost(event)}>
          <label htmlFor="guestbook-body">축하 글</label>
          <textarea id="guestbook-body" value={body} maxLength={1200} rows={4} placeholder="H1-KEY에게 전하고 싶은 마음을 적어 주세요." onChange={(event) => setBody(event.target.value)} />
          <div className="form-footer">
            <label className="file-picker" htmlFor="guestbook-images">사진 추가 (최대 3장)</label>
            <input id="guestbook-images" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, MAX_POST_IMAGES))} />
            <span>{body.length}/1200자 · 계정당 사진 10장, 총 10MB까지</span>
          </div>
          <TurnstileWidget onToken={setTurnstileToken} resetKey={turnstileResetKey} />
          <label className="consent-field"><input type="checkbox" required checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} /><span><Link to="/policy/privacy" target="_blank" rel="noreferrer">개인정보·공개 안내</Link>를 확인했고, 글과 선택한 사진이 공개되는 데 동의합니다.</span></label>
          {files.length > 0 && <p className="community-small">선택한 사진: {files.map((file) => file.name).join(', ')}</p>}
          <button className="primary-button" disabled={busy}>{busy ? '저장 중…' : editingId ? '수정 저장' : '축하 글 남기기'}</button>
          {editingId && <button className="text-button" type="button" onClick={() => { setEditingId(undefined); setBody(''); setFiles([]) }}>수정 취소</button>}
        </form>
      )}
      {message && <p className="community-message" role="status">{message}</p>}
      <div className="community-list-heading"><h2>남겨진 글</h2><span>{posts.length}개 표시</span></div>
      {posts.length === 0 && configured && <p className="empty-state">아직 남겨진 글이 없습니다.</p>}
      <div className="guestbook-list">
        {posts.map((post) => (
          <article className="user-post-card" key={post.id}>
            <header><strong>{post.author_name}</strong><time dateTime={post.created_at}>{new Date(post.created_at).toLocaleDateString('ko-KR')}</time></header>
            <p className="user-post-body">{post.body}</p>
            {!!post.media?.length && <div className="user-photo-grid">{post.media.map((media) => media.signed_url && <img key={media.id} src={media.signed_url} loading="lazy" alt="방명록 첨부 사진" />)}</div>}
            {!!post.media?.length && !post.media.some((media) => media.signed_url) && <p className="community-small">사진을 지금은 불러올 수 없습니다.</p>}
            {user && post.is_mine && <div className="post-actions">
              <button type="button" className="text-button" onClick={() => { setEditingId(post.id); setBody(post.body); setFiles([]); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>수정</button>
              <button type="button" className="text-button danger-text" onClick={() => void removePost(post)}>삭제</button>
            </div>}
            {user && !post.is_mine && <button type="button" className="text-button" onClick={() => void reportPost(post)}>신고</button>}
          </article>
        ))}
      </div>
      {hasMore && <button className="secondary-button load-more" type="button" onClick={() => void loadPosts(page + 1, true)}>더 불러오기</button>}
    </section>
  )
}

export default GuestbookPage
