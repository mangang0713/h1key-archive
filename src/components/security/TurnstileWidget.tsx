import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void; 'error-callback': () => void; theme: 'light'; appearance?: 'always' | 'execute' | 'interaction-only' }) => string
      remove: (widgetId: string) => void
    }
  }
}

const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim()
let loader: Promise<void> | undefined

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve()
  if (!loader) {
    loader = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile-loader]')
      const script = existing ?? document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      script.dataset.turnstileLoader = 'true'
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('봇 확인 도구를 불러오지 못했습니다.'))
      if (!existing) document.head.append(script)
    }).catch((error: unknown) => { loader = undefined; throw error })
  }
  return loader
}

function TurnstileWidget({ onToken, resetKey = 0, appearance = 'always' }: {
  onToken: (token: string) => void
  resetKey?: number
  appearance?: 'always' | 'execute' | 'interaction-only'
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const container = containerRef.current
    if (!siteKey || !container) return
    let widgetId: string | undefined
    let active = true
    loadTurnstile().then(() => {
      const turnstile = window.turnstile
      if (!active || !turnstile || !container) return
      widgetId = turnstile.render(container, {
        sitekey: siteKey,
        theme: 'light',
        callback: onToken,
        'expired-callback': () => onToken(''),
        'error-callback': () => { onToken(''); setError('봇 확인을 다시 진행해 주세요.') },
        appearance,
      })
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '봇 확인을 불러오지 못했습니다.'))
    return () => {
      active = false
      if (widgetId) window.turnstile?.remove(widgetId)
      onToken('')
    }
  }, [appearance, onToken, resetKey])

  if (!siteKey) return <p className="community-small">Turnstile 사이트 키가 설정되면 봇 확인이 표시됩니다.</p>
  return <div><div ref={containerRef} />{error && <p className="community-message" role="alert">{error}</p>}</div>
}

export default TurnstileWidget
