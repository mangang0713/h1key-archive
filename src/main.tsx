/**
 * 이 파일은 브라우저에서 React 앱을 시작하고 GitHub Pages의 이전 주소를 새 경로로 복원합니다.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

const fallbackRoute = new URLSearchParams(window.location.search).get(
  '__ghpages_route',
);
const legacyHashRoute = window.location.hash.startsWith('#/')
  ? window.location.hash.slice(1)
  : undefined;
const routeToRestore = fallbackRoute ?? legacyHashRoute;

if (routeToRestore) {
  const destination = new URL(routeToRestore, window.location.origin);
  if (legacyHashRoute) {
    new URLSearchParams(window.location.search).forEach((value, key) => {
      if (!destination.searchParams.has(key)) {
        destination.searchParams.append(key, value);
      }
    });
  }
  const routePath = `${import.meta.env.BASE_URL}${destination.pathname.replace(/^\/+/, '')}`;
  window.history.replaceState(
    null,
    '',
    `${routePath}${destination.search}${destination.hash}`,
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
