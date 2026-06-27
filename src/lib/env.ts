const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

const isProbablyUrl = (value: string) => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

const missingSupabaseEnv = [
  !supabaseUrl ? 'VITE_SUPABASE_URL' : null,
  !supabaseAnonKey ? 'VITE_SUPABASE_ANON_KEY' : null,
].filter((value): value is string => value !== null)

const invalidSupabaseEnv =
  supabaseUrl && !isProbablyUrl(supabaseUrl)
    ? ['VITE_SUPABASE_URL должен быть корректным URL.']
    : []

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  missingSupabaseEnv,
  invalidSupabaseEnv,
  isSupabaseConfigured: missingSupabaseEnv.length === 0 && invalidSupabaseEnv.length === 0,
}

export function getSupabaseEnvIssue() {
  if (env.isSupabaseConfigured) {
    return null
  }

  const missing = env.missingSupabaseEnv.length
    ? `Не заполнено: ${env.missingSupabaseEnv.join(', ')}.`
    : ''
  const invalid = env.invalidSupabaseEnv.join(' ')

  return [missing, invalid].filter(Boolean).join(' ')
}
