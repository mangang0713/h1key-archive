import { supabase } from '../../lib/supabase/client'

function requireClient() {
  if (!supabase) throw new Error('Supabase 연결 설정이 필요합니다.')
  return supabase
}

export async function claimHessxlAdmin() {
  const { data, error } = await requireClient().rpc('claim_hessxl_admin')
  if (error) throw new Error(error.message)
  return data === true
}

export async function isCurrentArchiveAdmin() {
  const { data, error } = await requireClient().rpc('is_current_archive_admin')
  if (error) throw new Error(error.message)
  return data === true
}
