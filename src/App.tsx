import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './features/auth/AuthProvider'
import SiteLayout from './components/layout/SiteLayout'

const ArchivePage = lazy(() => import('./pages/ArchivePage'))
const LandingPage = lazy(() => import('./pages/LandingPage'))
const AccountPage = lazy(() => import('./pages/AccountPage'))
const MyCommunityPostsPage = lazy(() => import('./pages/MyCommunityPostsPage'))
const ProfileSetupPage = lazy(() => import('./pages/ProfileSetupPage'))
const AdminReportsPage = lazy(() => import('./pages/AdminReportsPage'))
const AdminSettingsPage = lazy(() => import('./pages/AdminSettingsPage'))
const CommunityPolicyPage = lazy(() => import('./pages/CommunityPolicyPage'))
const GuestbookPage = lazy(() => import('./pages/GuestbookPage'))
const SchedulePage = lazy(() => import('./pages/SchedulePage'))
const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

function App() {
  return (
    <BrowserRouter basename={routerBasename}>
      <AuthProvider>
        <Routes>
          <Route element={<SiteLayout />}>
            <Route index element={<Suspense fallback={<p className="page-loading" role="status">페이지를 불러오는 중입니다.</p>}><LandingPage /></Suspense>} />
            <Route path="archive" element={<Suspense fallback={<p className="page-loading" role="status">지도를 불러오는 중입니다.</p>}><ArchivePage /></Suspense>} />
            <Route path="guestbook" element={<Suspense fallback={<p className="page-loading" role="status">페이지를 불러오는 중입니다.</p>}><GuestbookPage /></Suspense>} />
            <Route path="schedule/:scheduleId" element={<Suspense fallback={<p className="page-loading" role="status">일정 정보를 불러오는 중입니다.</p>}><SchedulePage /></Suspense>} />
            <Route path="account" element={<Suspense fallback={<p className="page-loading" role="status">계정 정보를 불러오는 중입니다.</p>}><AccountPage /></Suspense>} />
            <Route path="account/posts" element={<Suspense fallback={<p className="page-loading" role="status">내 게시글을 불러오는 중입니다.</p>}><MyCommunityPostsPage /></Suspense>} />
            <Route path="account/setup" element={<Suspense fallback={<p className="page-loading" role="status">프로필 설정을 불러오는 중입니다.</p>}><ProfileSetupPage /></Suspense>} />
            <Route path="admin/reports" element={<Suspense fallback={<p className="page-loading" role="status">운영 화면을 불러오는 중입니다.</p>}><AdminReportsPage /></Suspense>} />
            <Route path="admin/settings" element={<Suspense fallback={<p className="page-loading" role="status">운영 화면을 불러오는 중입니다.</p>}><AdminSettingsPage /></Suspense>} />
            <Route path="policy/:policyType" element={<Suspense fallback={<p className="page-loading" role="status">안내를 불러오는 중입니다.</p>}><CommunityPolicyPage /></Suspense>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
