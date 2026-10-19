import { useSyncExternalStore, type ReactNode } from 'react'
import ArchivePage from './pages/ArchivePage'

type AppRoute = {
  path: string
  render: () => ReactNode
}

// 새 페이지를 만들면 이 목록에 경로와 컴포넌트를 연결합니다.
const routes: AppRoute[] = [{ path: '/', render: () => <ArchivePage /> }]

function getCurrentPath(): string {
  const path = window.location.hash.slice(1).split('?')[0] || '/'
  return routes.some((route) => route.path === path) ? path : '/'
}

function subscribeToPageChanges(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function App() {
  const path = useSyncExternalStore(subscribeToPageChanges, getCurrentPath, () => '/')
  const route = routes.find((item) => item.path === path) ?? routes[0]

  return route.render()
}

export default App
