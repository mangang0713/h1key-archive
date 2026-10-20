import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../features/auth/AuthProvider'
import { claimHessxlAdmin, isCurrentArchiveAdmin } from '../../features/community/adminApi'

function AdminNavigationLink() {
  const { user } = useAuth()
  const [adminCheck, setAdminCheck] = useState<{ userId: string; isAdmin: boolean } | null>(null)

  useEffect(() => {
    let active = true
    if (!user) return

    void (async () => {
      try {
        await claimHessxlAdmin()
        const admin = await isCurrentArchiveAdmin()
        if (active) setAdminCheck({ userId: user.id, isAdmin: admin })
      } catch {
        if (active) setAdminCheck({ userId: user.id, isAdmin: false })
      }
    })()

    return () => { active = false }
  }, [user])

  return user && adminCheck?.userId === user.id && adminCheck.isAdmin
    ? <Link className="site-account-link" to="/admin/reports">운영</Link>
    : null
}

export default AdminNavigationLink
