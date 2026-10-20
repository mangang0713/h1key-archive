import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import { deleteCommunityContent, deleteCommunityMedia, getAdminHiddenContent, getAdminReports, moderateReport, restoreHiddenCommunityContent } from '../features/community/api'
import type { ContentReport, HiddenCommunityContent } from '../features/community/types'
import './CommunityPages.css'

type AdminTab = 'reports' | 'hidden'

function AdminReportsPage() {
  const { user, configured } = useAuth()
  const [activeTab, setActiveTab] = useState<AdminTab>('reports')
  const [reports, setReports] = useState<ContentReport[]>([])
  const [hiddenContent, setHiddenContent] = useState<HiddenCommunityContent[]>([])
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState<string>()

  const refreshReports = useCallback(async () => {
    if (!configured || !user) return
    try { setReports(await getAdminReports()) }
    catch (error) { setMessage(error instanceof Error ? error.message : '신고 목록을 불러오지 못했습니다.') }
  }, [configured, user])

  const refreshHiddenContent = useCallback(async () => {
    if (!configured || !user) return
    try { setHiddenContent(await getAdminHiddenContent()) }
    catch (error) { setMessage(error instanceof Error ? error.message : '숨김 게시물을 불러오지 못했습니다.') }
  }, [configured, user])

  // 관리자 권한 확인 후 미처리 신고함을 불러옵니다.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refreshReports() }, [refreshReports])

  async function decide(report: ContentReport, decision: 'dismiss' | 'hide' | 'delete') {
    if (decision === 'delete' && !window.confirm('이 게시물과 첨부 사진을 영구 삭제할까요?')) return
    setBusyId(report.id)
    setMessage('')
    try {
      await moderateReport(report.id, decision)
      await refreshReports()
      if (decision !== 'dismiss') await refreshHiddenContent()
    } catch (error) { setMessage(error instanceof Error ? error.message : '신고를 처리하지 못했습니다.') }
    finally { setBusyId(undefined) }
  }

  async function restoreContent(item: HiddenCommunityContent) {
    if (!window.confirm('이 게시물을 다시 공개할까요?')) return
    setBusyId(item.id)
    setMessage('')
    try {
      await restoreHiddenCommunityContent(item.content_type, item.id)
      await refreshHiddenContent()
      setMessage('게시물을 다시 공개했습니다.')
    } catch (error) { setMessage(error instanceof Error ? error.message : '게시물을 복원하지 못했습니다.') }
    finally { setBusyId(undefined) }
  }

  async function deleteHiddenContent(item: HiddenCommunityContent) {
    if (!window.confirm('게시물과 첨부 사진을 영구 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return
    setBusyId(item.id)
    setMessage('')
    try {
      await deleteCommunityContent(item.content_type, item.id)
      await refreshHiddenContent()
      setMessage('게시물과 첨부 사진을 삭제했습니다.')
    } catch (error) { setMessage(error instanceof Error ? error.message : '게시물을 삭제하지 못했습니다.') }
    finally { setBusyId(undefined) }
  }

  async function deleteHiddenPhoto(mediaId: string) {
    if (!window.confirm('이 사진만 영구 삭제할까요? 게시물은 그대로 보존됩니다.')) return
    setBusyId(mediaId)
    setMessage('')
    try {
      await deleteCommunityMedia(mediaId)
      await refreshHiddenContent()
      setMessage('사진을 삭제했습니다.')
    } catch (error) { setMessage(error instanceof Error ? error.message : '사진을 삭제하지 못했습니다.') }
    finally { setBusyId(undefined) }
  }

  return (
    <section className="community-page">
      <div className="community-heading"><span className="community-eyebrow">MODERATION</span><h1>커뮤니티 관리</h1><p>미처리 신고를 검토하고 숨긴 게시물을 복원하거나 삭제할 수 있습니다.</p></div>
      {!configured && <div className="community-alert">Supabase 설정이 필요합니다.</div>}
      {configured && !user && <div className="community-alert">관리자 로그인이 필요합니다. <Link to="/account?returnTo=/admin/reports">로그인</Link></div>}
      {configured && user && <>
        <div className="admin-review-tabs" role="group" aria-label="커뮤니티 관리 항목">
          <button type="button" aria-pressed={activeTab === 'reports'} className={`admin-review-tab${activeTab === 'reports' ? ' is-active' : ''}`} onClick={() => setActiveTab('reports')}>미처리 신고 <span>{reports.length}</span></button>
          <button type="button" aria-pressed={activeTab === 'hidden'} className={`admin-review-tab${activeTab === 'hidden' ? ' is-active' : ''}`} onClick={() => { setActiveTab('hidden'); void refreshHiddenContent() }}>숨김 게시물 <span>{hiddenContent.length}</span></button>
        </div>

        {activeTab === 'reports' && <div aria-label="미처리 신고">
          {reports.map((report) => <article className="user-post-card report-card" key={report.id}>
            <header><strong>{report.content_type === 'guestbook' ? '방명록' : '일정 후기'} 신고</strong><time dateTime={report.created_at}>{new Date(report.created_at).toLocaleString('ko-KR')}</time></header>
            <p><b>작성자:</b> {report.target_author}</p><p><b>사유:</b> {report.reason}</p>{report.details && <p>{report.details}</p>}
            <blockquote>{report.target_excerpt}</blockquote>
            <div className="post-actions">
              <button className="secondary-button" type="button" disabled={busyId === report.id} onClick={() => void decide(report, 'dismiss')}>기각</button>
              <button className="secondary-button" type="button" disabled={busyId === report.id} onClick={() => void decide(report, 'hide')}>숨기기</button>
              <button className="danger-button" type="button" disabled={busyId === report.id} onClick={() => void decide(report, 'delete')}>{busyId === report.id ? '처리 중…' : '영구 삭제'}</button>
            </div>
          </article>)}
          {reports.length === 0 && <p className="empty-state">현재 미처리 신고가 없습니다.</p>}
        </div>}

        {activeTab === 'hidden' && <div aria-label="숨김 게시물">
          {hiddenContent.map((item) => <article className="user-post-card report-card" key={`${item.content_type}-${item.id}`}>
            <header><strong>{item.content_type === 'guestbook' ? '방명록' : '일정 후기'} · 숨김</strong><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('ko-KR')}</time></header>
            <p><b>작성자:</b> {item.author_name}{item.rating !== null && ` · 별점 ${item.rating}/5`}</p>
            <blockquote>{item.body}</blockquote>
            {!!item.media.length && <div className="admin-hidden-photo-grid">{item.media.map((media) => media.signed_url && <figure key={media.id}>
              <img src={media.signed_url} loading="lazy" alt="숨김 게시물 첨부 사진" />
              <button className="admin-photo-delete" type="button" disabled={busyId === media.id} onClick={() => void deleteHiddenPhoto(media.id)}>사진 영구 삭제</button>
            </figure>)}</div>}
            <div className="post-actions">
              <button className="secondary-button" type="button" disabled={busyId === item.id} onClick={() => void restoreContent(item)}>{busyId === item.id ? '처리 중…' : '다시 공개'}</button>
              <button className="danger-button" type="button" disabled={busyId === item.id} onClick={() => void deleteHiddenContent(item)}>영구 삭제</button>
            </div>
          </article>)}
          {hiddenContent.length === 0 && <p className="empty-state">현재 숨김 처리된 게시물이 없습니다.</p>}
        </div>}
      </>}
      {message && <p className="community-message" role="status">{message}</p>}
    </section>
  )
}

export default AdminReportsPage
