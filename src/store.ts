import { useCallback, useEffect, useState } from 'react'
import type { TrackId } from './content'
import { HAS_BACKEND } from './config'

/* ---------- даты (локальное время пользователя) ---------- */
export const dayKey = (d = new Date()) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
export const addDays = (key: string, n: number) => {
  const [y, m, d] = key.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d + n))
}
export const diffDays = (a: string, b: string) => {
  const [ya, ma, da] = a.split('-').map(Number)
  const [yb, mb, db] = b.split('-').map(Number)
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000)
}

/* ---------- модель ---------- */
export type Friend = {
  id: string
  name: string
  avatar: string
  reliability: number // % дней, когда друг занимается (симуляция, пока нет бэкенда)
  activeHour: number // во сколько друг обычно заходит
  sharedStreak: number
  lastBoth: string | null // последний день, когда оба занимались
  lostStreak: number // сгоревший огонёк, который можно восстановить (как в TikTok)
  nudgedDay: string | null
}

export type State = {
  name: string
  track: TrackId | null
  onboarded: boolean
  xp: number
  coins: number
  dailyGoal: number
  xpByDay: Record<string, number>
  activeDays: string[]
  frozenDays: string[]
  streak: number
  longest: number
  lastActive: string | null
  lostStreak: number
  freezes: number
  completed: string[]
  friends: Friend[]
  lastSeenDay: string
}

export const FREEZE_PRICE = 50
export const REPAIR_PRICE = 100
export const FRIEND_RESTORE_PRICE = 60
export const MAX_FREEZES = 3

const mkFriend = (id: string, name: string, avatar: string, reliability: number, activeHour: number): Friend => ({
  id, name, avatar, reliability, activeHour,
  sharedStreak: 0, lastBoth: null, lostStreak: 0, nudgedDay: null,
})

const demoFriends = () => [
  mkFriend('aigerim', 'Айгерим', '👩🏻', 90, 7),
  mkFriend('bekzat', 'Бекзат', '🧑🏻', 75, 12),
  mkFriend('zhyldyz', 'Жылдыз', '👩🏻‍🏫', 85, 18),
  mkFriend('timur', 'Тимур', '🧑🏻‍💻', 60, 21),
]

const freshState = (): State => ({
  name: '',
  track: null,
  onboarded: false,
  xp: 0,
  coins: 30,
  dailyGoal: 30,
  xpByDay: {},
  activeDays: [],
  frozenDays: [],
  streak: 0,
  longest: 0,
  lastActive: null,
  lostStreak: 0,
  freezes: 1,
  completed: [],
  // с сервером — только реальные друзья; без сервера — демо-друзья
  friends: HAS_BACKEND ? [] : demoFriends(),
  lastSeenDay: dayKey(),
})

/* ---------- симуляция активности друзей (детерминированно по дню) ---------- */
const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return Math.abs(h) % 100
}
export function friendActiveOn(f: Friend, day: string, now = new Date()): boolean {
  const today = dayKey(now)
  if (day === today && f.nudgedDay === today) return true
  const active = hash(f.id + day) < f.reliability
  if (day === today) return active && now.getHours() >= f.activeHour
  return active
}
export const userActiveOn = (s: State, day: string) => s.activeDays.includes(day)

/* ---------- огонёк с другом: продлевается, только если ОБА занимались в этот день ---------- */
function reconcileFriend(s: State, f: Friend, now = new Date()): Friend {
  const today = dayKey(now)
  let { sharedStreak, lastBoth, lostStreak } = f
  // начинаем проверку с дня после последнего общего (или с сегодня для новых)
  let d = lastBoth ? addDays(lastBoth, 1) : today
  while (diffDays(d, today) >= 0) {
    const both = userActiveOn(s, d) && friendActiveOn(f, d, now)
    if (both) {
      sharedStreak = lastBoth && diffDays(lastBoth, d) === 1 ? sharedStreak + 1 : 1
      lastBoth = d
      lostStreak = 0
    } else if (d !== today && sharedStreak > 0) {
      // день прошёл, а кто-то не занимался — огонёк гаснет
      lostStreak = sharedStreak
      sharedStreak = 0
    }
    d = addDays(d, 1)
  }
  return { ...f, sharedStreak, lastBoth, lostStreak }
}

/* ---------- личный огонёк: при пропуске сначала тратится «заморозка» ---------- */
function reconcilePersonal(s: State, now = new Date()): State {
  const today = dayKey(now)
  if (!s.lastActive || s.streak === 0) return s
  const gap = diffDays(s.lastActive, today) // 1 = вчера, ок
  if (gap <= 1) return s
  let { freezes, streak, lastActive, lostStreak } = s
  const frozenDays = [...s.frozenDays]
  for (let i = 1; i < gap; i++) {
    const missed = addDays(s.lastActive, i)
    if (freezes > 0) {
      freezes--
      frozenDays.push(missed)
      lastActive = missed
    } else {
      lostStreak = streak
      streak = 0
      break
    }
  }
  return { ...s, freezes, streak, lastActive, frozenDays, lostStreak }
}

export function reconcile(s: State, now = new Date()): State {
  const p = reconcilePersonal(s, now)
  return { ...p, friends: p.friends.map((f) => reconcileFriend(p, f, now)), lastSeenDay: dayKey(now) }
}

/* ---------- действия ---------- */
export type LessonResult = {
  xpGained: number
  streakExtended: boolean
  newStreak: number
  friendsExtended: string[] // имена друзей, с кем продлили огонёк
}

export function completeLesson(s: State, lessonId: string, xpGained: number, now = new Date()): [State, LessonResult] {
  const today = dayKey(now)
  const already = s.activeDays.includes(today)
  let next: State = {
    ...s,
    xp: s.xp + xpGained,
    xpByDay: { ...s.xpByDay, [today]: (s.xpByDay[today] ?? 0) + xpGained },
    completed: s.completed.includes(lessonId) ? s.completed : [...s.completed, lessonId],
  }
  if (!already) {
    const continues = next.lastActive && diffDays(next.lastActive, today) === 1
    const streak = continues ? next.streak + 1 : 1
    next = {
      ...next,
      activeDays: [...next.activeDays, today],
      streak,
      longest: Math.max(next.longest, streak),
      lastActive: today,
      lostStreak: 0,
    }
  }
  const before = new Map(s.friends.map((f) => [f.id, f.sharedStreak]))
  next = reconcile(next, now)
  const friendsExtended = next.friends
    .filter((f) => f.lastBoth === today && f.sharedStreak > (before.get(f.id) ?? 0))
    .map((f) => f.name)
  return [next, { xpGained, streakExtended: !already, newStreak: next.streak, friendsExtended }]
}

/* ---------- демо-данные для питча (по протоколу демо: заранее заполненный профиль) ---------- */
export function demoState(name: string, track: TrackId): State {
  const today = dayKey()
  const s = freshState()
  const days = Array.from({ length: 13 }, (_, i) => addDays(today, -13 + i)) // 13 дней до вчера
  const frozen = [days[5]]
  const active = days.filter((d) => !frozen.includes(d))
  const xpByDay: Record<string, number> = {}
  active.forEach((d, i) => (xpByDay[d] = 30 + ((i * 17) % 40)))
  const streaks: Record<string, number> = { aigerim: 12, bekzat: 3, zhyldyz: 47, timur: 0 }
  return {
    ...s,
    name, track, onboarded: true,
    xp: 1280, coins: 140, freezes: 2,
    activeDays: active, frozenDays: frozen, xpByDay,
    streak: 13, longest: 21, lastActive: addDays(today, -1),
    completed: [],
    friends: demoFriends().map((f) => ({
      ...f,
      sharedStreak: streaks[f.id],
      lastBoth: streaks[f.id] ? addDays(today, -1) : null,
      lostStreak: f.id === 'timur' ? 8 : 0, // огонёк с Тимуром погас — можно восстановить
    })),
  }
}

/* ---------- хук хранилища ---------- */
const KEY = 'akylflow.v1'
function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return reconcile({ ...freshState(), ...JSON.parse(raw) })
  } catch {
    /* приватный режим или повреждённые данные */
  }
  return freshState()
}

export function useStore() {
  const [state, setState] = useState<State>(load)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* ignore */
    }
  }, [state])
  // раз в минуту: смена дня, друзья «заходят» по своему времени
  useEffect(() => {
    const t = setInterval(() => setState((s) => reconcile(s)), 60_000)
    return () => clearInterval(t)
  }, [])
  const update = useCallback((fn: (s: State) => State) => setState((s) => fn(s)), [])
  const reset = useCallback(() => setState(freshState()), [])
  return { state, update, reset }
}

/* ---------- уровни огонька (как в TikTok: цвет меняется с длиной серии) ---------- */
export function flameTier(n: number) {
  if (n >= 100) return { cls: 'tier-legend', label: 'Легенда', next: null as number | null }
  if (n >= 30) return { cls: 'tier-hot', label: 'Пламя', next: 100 }
  if (n >= 3) return { cls: 'tier-fire', label: 'Огонь', next: 30 }
  if (n >= 1) return { cls: 'tier-spark', label: 'Искра', next: 3 }
  return { cls: 'tier-off', label: 'Нет огонька', next: 1 }
}

export const msUntilMidnight = (now = new Date()) => {
  const m = new Date(now)
  m.setHours(24, 0, 0, 0)
  return m.getTime() - now.getTime()
}
export const fmtDuration = (ms: number) => {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`
}
