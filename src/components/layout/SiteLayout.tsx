import { NavLink, Outlet, Link } from 'react-router-dom'
import { useAuth } from '../../features/auth/AuthProvider'
import './SiteLayout.css'

function SiteLayout() {
  const { user, loading } = useAuth()
  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="site-brand" to="/" aria-label="H1-KEY Activity Archive 홈">
          <span className="site-brand-mark" aria-hidden="true">H</span>
          <span>H1-KEY <b>ARCHIVE</b></span>
        </Link>
        <nav className="site-navigation" aria-label="주요 메뉴">
          <NavLink to="/" end>지도</NavLink>
          <NavLink to="/guestbook">방명록</NavLink>
        </nav>
        <div className="site-account">
          {loading ? <span className="site-account-loading">확인 중</span> : user
            ? <><Link className="site-account-link" to="/admin/reports">운영</Link><Link className="site-account-link" to="/account">내 계정</Link></>
            : <Link className="site-account-link" to="/account">로그인</Link>}
        </div>
      </header>
      <main className="site-main"><Outlet /></main>
      <footer className="site-footer"><Link to="/policy/privacy">개인정보 안내</Link><Link to="/policy/community">커뮤니티 운영 원칙</Link></footer>
    </div>
  )
}

export default SiteLayout
