import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'

const supabaseConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim())

export type SocialProvider = 'x' | 'google' | 'kakao'

type AuthContextValue = {
  user: User | null
  loading: boolean
  configured: boolean
  signIn: (provider: SocialProvider, returnTo?: string) => Promise<string | null>
  signOut: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(supabaseConfigured)

  useEffect(() => {
    if (!supabaseConfigured) return
    let active = true
    let unsubscribe: (() => void) | undefined
    void import('../../lib/supabase/client').then(({ supabase }) => {
      if (!active || !supabase) return
      supabase.auth.getSession().then(({ data, error }) => {
        if (!active) return
        if (error) console.error('세션 확인 실패:', error.message)
        setUser(data.session?.user ?? null)
        setLoading(false)
      })
      const { data } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
        setUser(session?.user ?? null)
        setLoading(false)
      })
      unsubscribe = () => data.subscription.unsubscribe()
    }).catch((error: unknown) => {
      console.error('Supabase 모듈 로딩 실패:', error)
      if (active) setLoading(false)
    })
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    configured: supabaseConfigured,
    signIn: async (provider, returnTo = '/') => {
      if (!supabaseConfigured) return '로그인 서버 설정이 완료되지 않았습니다.'
      const { supabase } = await import('../../lib/supabase/client')
      if (!supabase) return '로그인 서버 설정이 완료되지 않았습니다.'
      sessionStorage.setItem('auth-return-to', returnTo)
      const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          queryParams: provider === 'x' ? { response_type: 'code' } : undefined,
          skipBrowserRedirect: false,
        },
      })
      if (error) return error.message
      return null
    },
    signOut: async () => {
      if (!supabaseConfigured) return '로그인 서버 설정이 완료되지 않았습니다.'
      const { supabase } = await import('../../lib/supabase/client')
      if (!supabase) return '로그인 서버 설정이 완료되지 않았습니다.'
      const { error } = await supabase.auth.signOut()
      return error?.message ?? null
    },
  }), [loading, user])

  useEffect(() => {
    if (!user) return
    const returnTo = sessionStorage.getItem('auth-return-to')
    if (returnTo) {
      sessionStorage.removeItem('auth-return-to')
      window.location.hash = returnTo.startsWith('/') ? returnTo : '/'
    }
  }, [user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Context hook를 같은 파일에 두어 단순 구조를 유지합니다.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth는 AuthProvider 내부에서 사용해야 합니다.')
  return context
}
