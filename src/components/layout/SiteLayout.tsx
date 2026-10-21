import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/AuthProvider'
import { useEffect, useState } from 'react'
import { getProfile } from '../../features/community/api'
import AdminNavigationLink from './AdminNavigationLink'
import './SiteLayout.css'

function SiteLayout() {
  const { user, loading, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const location = useLocation()
  const navigate = useNavigate()

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    setSignOutError('')
    try {
      const error = await signOut()
      if (error) setSignOutError(error)
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : '로그아웃하지 못했습니다.')
    } finally {
      setSigningOut(false)
    }
  }

  useEffect(() => {
    if (loading || !user || location.pathname === '/account/setup') return
    let active = true
    void getProfile(user.id).then((profile) => {
      const displayName = profile?.display_name.trim() ?? ''
      if (active && (!displayName || displayName === 'H1-KEY 팬')) {
        const next = `${location.pathname}${location.search}`
        navigate(`/account/setup?next=${encodeURIComponent(next)}`, { replace: true })
      }
    }).catch(() => {
      // 데이터베이스 준비 전에는 로그인한 사용자의 기존 화면을 막지 않습니다.
    })
    return () => { active = false }
  }, [loading, user, location.pathname, location.search, navigate])

  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="site-brand" to="/" aria-label="H1-KEY Activity Archive 홈">
          <img className="site-brand-mark" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" aria-hidden="true" />
          <span>H1-KEY <b>ARCHIVE</b></span>
        </Link>
        <nav className="site-navigation" aria-label="주요 메뉴">
          <NavLink to="/archive">지도</NavLink>
          <NavLink to="/guestbook">방명록</NavLink>
        </nav>
        <div className="site-account">
          {loading ? <span className="site-account-loading">확인 중</span> : user
            ? <>
              <div className="site-account-actions">
                <AdminNavigationLink />
                <Link className="site-account-link" to="/account">내 계정</Link>
                <button className="site-logout-button" type="button" disabled={signingOut} onClick={() => void handleSignOut()}>
                  {signingOut ? '로그아웃 중…' : '로그아웃'}
                </button>
              </div>
              {signOutError && <span className="site-account-error" role="alert">{signOutError}</span>}
            </>
            : <Link className="site-account-link" to="/account">로그인</Link>}
        </div>
      </header>
      <main className="site-main"><Outlet /></main>
      <footer className="site-footer"><Link to="/policy/privacy">개인정보 안내</Link><Link to="/policy/community">커뮤니티 운영 원칙</Link></footer>
    </div>
  )
}

export default SiteLayout
