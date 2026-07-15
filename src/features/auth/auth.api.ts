import { requireSupabase } from '../../lib/supabase.ts'

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await requireSupabase().auth.signInWithPassword({ email, password })

  if (error) {
    throw error
  }

  return data.session
}

export async function signOut() {
  const { error } = await requireSupabase().auth.signOut()

  if (error) {
    throw error
  }
}

export async function updatePassword(password: string) {
  const { error } = await requireSupabase().auth.updateUser({ password })

  if (error) {
    throw error
  }
}
