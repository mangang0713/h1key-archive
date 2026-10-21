import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages는 저장소 경로 아래에 배포하고, 로컬 개발은 기존 루트를 유지합니다.
  base: command === 'build' ? '/happy-riina-day/' : '/',
  plugins: [react(), tailwindcss()],
}))
