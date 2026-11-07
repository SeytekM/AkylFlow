import { useCallback, useEffect, useRef, useState } from 'react'
import { HAS_BACKEND, SUPABASE_KEY, SUPABASE_URL } from './config'
import { addDays, dayKey, type State } from './store'

/* ---------- кто я: анонимный ID на устройстве (без регистрации) ---------- */
const UID_KEY = 'akylflow.uid'
const REF_KEY = 'akylflow.pendingRef'
export function myId(): string {
  try {
    let id = localStorage.getItem(UID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(UID_KEY, id)
    }
    return id
  } catch {
    return 'no-storage'
  }
}

// ссылка-приглашение ?ref=<id>: запоминаем, обработаем после онбординга
export function capturePendingRef() {
  const p = new URLSearchParams(location.search)
  const ref = p.get('ref')
  if (ref && /^[0-9a-f-]{36}$/i.test(ref) && ref !== myId()) {
    try { localStorage.setItem(REF_KEY, ref) } catch { /* ignore */ }
  }
  if (ref) history.replaceState(null, '', location.pathname)
}

export function inviteUrl() {
  return `${location.origin}${location.pathname}?ref=${myId()}`
}

/* ---------- Supabase REST (PostgREST) ---------- */
async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

export type Profile = {
  id: string
  name: string
  track: string | null
  streak: number
  longest: number
  xp_total: number
  active_days: string[]
  xp_by_day: Record<string, number>
  updated_at?: string
}

export type Nudge = { id: string; from_id: string; from_name: string; created_at: string }

function toProfile(s: State): Profile {
  const since = addDays(dayKey(), -60)
  const recentXp: Record<string, number> = {}
  for (const [d, v] of Object.entries(s.xpByDay)) if (d >= addDays(dayKey(), -14)) recentXp[d] = v
  return {
    id: myId(),
    name: s.name,
    track: s.track,
    streak: s.streak,
    longest: s.longest,
    xp_total: s.xp,
    active_days: s.activeDays.filter((d) => d >= since),
    xp_by_day: recentXp,
    updated_at: new Date().toISOString(),
  }
}

const api = {
  upsertProfile: (p: Profile) =>
    rest('profiles?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(p) }),
  addFriend: (me: string, other: string) =>
    rest('friendships?on_conflict=a,b', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify([{ a: me, b: other }, { a: other, b: me }]),
    }),
  friendIds: (me: string) => rest<{ b: string }[]>(`friendships?a=eq.${me}&select=b`),
  profiles: (ids: string[]) => rest<Profile[]>(`profiles?id=in.(${ids.join(',')})&select=*`),
  nudge: (from: string, fromName: string, to: string) =>
    rest('nudges', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ from_id: from, from_name: fromName, to_id: to }) }),
  nudgesFor: (me: string, sinceIso: string) =>
    rest<Nudge[]>(`nudges?to_id=eq.${me}&created_at=gte.${encodeURIComponent(sinceIso)}&select=id,from_id,from_name,created_at&order=created_at.desc`),
}

/* ---------- общий огонёк из реальных дней занятий обоих ---------- */
export function sharedStreak(mine: string[], theirs: string[], today = dayKey()) {
  const both = new Set(mine.filter((d) => theirs.includes(d)))
  const bothToday = both.has(today)
  let d = bothToday ? today : addDays(today, -1)
  let n = 0
  while (both.has(d)) {
    n++
    d = addDays(d, -1)
  }
  return { streak: n, bothToday }
}

export const xpOn = (p: Pick<Profile, 'xp_by_day'>, day: string) => p.xp_by_day?.[day] ?? 0
export const xpWeek = (p: Pick<Profile, 'xp_by_day'>, today = dayKey()) =>
  Object.entries(p.xp_by_day ?? {}).filter(([d]) => d > addDays(today, -7)).reduce((a, [, v]) => a + v, 0)

/* ---------- хук: синхронизация профиля, друзья, «пинки» ---------- */
export function useSocial(state: State) {
  const [friends, setFriends] = useState<Profile[]>([])
  const [nudges, setNudges] = useState<Nudge[]>([])
  const [online, setOnline] = useState(HAS_BACKEND)
  const [newFriend, setNewFriend] = useState<string | null>(null)
  const pushTimer = useRef<ReturnType<typeof setTimeout>>()

  const refresh = useCallback(async () => {
    if (!HAS_BACKEND || !state.onboarded) return
    try {
      const ids = (await api.friendIds(myId())).map((r) => r.b)
      setFriends(ids.length ? await api.profiles(ids) : [])
      const midnight = new Date()
      midnight.setHours(0, 0, 0, 0)
      setNudges(await api.nudgesFor(myId(), midnight.toISOString()))
      setOnline(true)
    } catch (e) {
      console.warn('sync failed', e)
      setOnline(false)
    }
  }, [state.onboarded])

  // профиль → сервер (с задержкой, чтобы не слать каждое изменение)
  useEffect(() => {
    if (!HAS_BACKEND || !state.onboarded) return
    clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(() => {
      api.upsertProfile(toProfile(state)).then(() => setOnline(true), () => setOnline(false))
    }, 800)
  }, [state])

  // после онбординга: принять приглашение по ссылке
  useEffect(() => {
    if (!HAS_BACKEND || !state.onboarded) return
    let ref: string | null = null
    try { ref = localStorage.getItem(REF_KEY) } catch { /* ignore */ }
    if (!ref) return
    ;(async () => {
      try {
        await api.upsertProfile(toProfile(state))
        await api.addFriend(myId(), ref!)
        localStorage.removeItem(REF_KEY)
        const [p] = await api.profiles([ref!])
        setNewFriend(p?.name ?? 'друг')
        refresh()
      } catch (e) {
        console.warn('invite failed', e)
      }
    })()
  }, [state.onboarded]) // eslint-disable-line react-hooks/exhaustive-deps

  // опрос раз в 20 сек + при возвращении во вкладку
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 20_000)
    const onVis = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [refresh])

  const nudge = useCallback(
    (to: string) => api.nudge(myId(), state.name, to),
    [state.name],
  )

  return { friends, nudges, online, refresh, nudge, newFriend, clearNewFriend: () => setNewFriend(null) }
}
export type Social = ReturnType<typeof useSocial>

export function hasPendingRef() {
  try { return Boolean(localStorage.getItem(REF_KEY)) } catch { return false }
}
