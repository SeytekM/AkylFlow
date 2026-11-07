// Supabase: Project Settings → API Keys.
// Здесь ТОЛЬКО publishable-ключ (sb_publishable_...) или legacy anon (eyJ...): они публичные по замыслу Supabase.
// Секретный ключ (sb_secret_... / service_role) НИКОГДА не кладём во фронтенд.
// Пустые значения → приложение работает офлайн (только локальный прогресс и демо-друзья).
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://cdjvpssavsyahuslcqkg.supabase.co'
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
export const HAS_BACKEND = Boolean(SUPABASE_URL && SUPABASE_KEY) && !SUPABASE_KEY.startsWith('sb_secret_')
