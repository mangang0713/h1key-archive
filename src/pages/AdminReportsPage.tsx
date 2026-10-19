import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import { getAdminReports, moderateReport } from '../features/community/api'
import type { ContentReport } from '../features/community/types'
import './CommunityPages.css'

function AdminReportsPage() {
  const { user, configured } = useAuth()
  const [reports, setReports] = useState<ContentReport[]>([])
  const [message, setMessage] = useState('')

  const refresh = useCallback(async () => {
    if (!configured || !user) return
    try { setReports(await getAdminReports()) }
    catch (error) { setMessage(error instanceof Error ? error.message : '신고 목록을 불러오지 못했습니다.') }
  }, [configured, user])

  // 관리자 권한 확인 후 신고 데이터를 불러옵니다.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh() }, [refresh])

  async function decide(report: ContentReport, decision: 'dismiss' | 'hide' | 'delete') {
    try { await moderateReport(report.id, decision); await refresh() }
    catch (error) { setMessage(error instanceof Error ? error.message : '신고를 처리하지 못했습니다.') }
  }

  return (
    <section className="community-page">
      <div className="community-heading"><span className="community-eyebrow">MODERATION</span><h1>신고 검토</h1><p>관리자 계정만 접근할 수 있습니다. 잘못된 신고는 기각하고 필요한 조치를 기록합니다.</p></div>
      {!configured && <div className="community-alert">Supabase 설정이 필요합니다.</div>}
      {configured && !user && <div className="community-alert">관리자 로그인이 필요합니다. <Link to="/account?returnTo=/admin/reports">로그인</Link></div>}
      {reports.map((report) => <article className="user-post-card report-card" key={report.id}>
        <header><strong>{report.content_type === 'guestbook' ? '방명록' : '일정 후기'} 신고</strong><time dateTime={report.created_at}>{new Date(report.created_at).toLocaleString('ko-KR')}</time></header>
        <p><b>작성자:</b> {report.target_author}</p><p><b>사유:</b> {report.reason}</p>{report.details && <p>{report.details}</p>}
        <blockquote>{report.target_excerpt}</blockquote>
        <div className="post-actions"><button className="secondary-button" type="button" onClick={() => void decide(report, 'dismiss')}>기각</button><button className="secondary-button" type="button" onClick={() => void decide(report, 'hide')}>숨기기</button><button className="danger-button" type="button" onClick={() => void decide(report, 'delete')}>삭제</button></div>
      </article>)}
      {configured && user && reports.length === 0 && <p className="empty-state">현재 검토할 신고가 없습니다.</p>}
      {message && <p className="community-message" role="status">{message}</p>}
    </section>
  )
}

export default AdminReportsPage
