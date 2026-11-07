// Supabase: Project Settings → API. anon-ключ публичный по замыслу Supabase, его можно хранить в коде фронтенда.
// Пустые значения → приложение работает офлайн (только локальный прогресс и демо-друзья).
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? ''
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
export const HAS_BACKEND = Boolean(SUPABASE_URL && SUPABASE_KEY)
