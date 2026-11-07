import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { TRACKS, type Lesson, type TrackId } from './content'
import LessonView from './Lesson'
import { HAS_BACKEND } from './config'
import { capturePendingRef, hasPendingRef, inviteUrl, sharedStreak, useSocial, xpOn, xpWeek, type Profile, type Social } from './social'
import {
  FREEZE_PRICE, FRIEND_RESTORE_PRICE, MAX_FREEZES, REPAIR_PRICE,
  achievements, addDays, completeLesson, dayKey, demoState, flameTier, fmtDuration, friendActiveOn,
  msUntilMidnight, openChest, reconcile, useStore, userActiveOn,
  type ChestReward, type Friend, type LessonResult, type State,
} from './store'
import { Confetti, Flame, setSoundOn, sfx } from './ui'
import { makeStreakCard, shareOrDownload } from './share'

type Tab = 'home' | 'friends' | 'cohort' | 'profile'
type Update = (fn: (s: State) => State) => void

declare global {
  interface Window {
    Telegram?: { WebApp?: { ready: () => void; expand: () => void; initDataUnsafe?: { user?: { first_name?: string } }; openTelegramLink: (u: string) => void; HapticFeedback?: { notificationOccurred: (t: string) => void } } }
  }
}
capturePendingRef()
const tg = window.Telegram?.WebApp
const haptic = () => tg?.HapticFeedback?.notificationOccurred('success')
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}
const daysWord = (n: number) => plural(n, 'день', 'дня', 'дней')
const initials = (name: string) => name.trim().slice(0, 1).toUpperCase() || '?'

function useNow(ms = 1000) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

async function shareStreak(state: State, friendsCount: number, toast: (t: string) => void) {
  const tier = flameTier(state.streak)
  const url = HAS_BACKEND ? inviteUrl() : `${location.origin}${location.pathname}`
  const blob = await makeStreakCard({ name: state.name, streak: state.streak, tier: state.streak ? tier.cls : 'tier-fire', tierLabel: tier.label, friends: friendsCount, url })
  const r = await shareOrDownload(blob, `Мой огонёк в AkylFlow: ${state.streak} ${daysWord(state.streak)} подряд 🔥 Присоединяйся: ${url}`)
  if (r === 'downloaded') toast('📸 Картинка сохранена, выложи её в сторис!')
}

export default function App() {
  const { state, update, reset } = useStore()
  const [tab, setTab] = useState<Tab>('home')
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [celebrate, setCelebrate] = useState<LessonResult | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [realExt, setRealExt] = useState<{ name: string; streak: number }[]>([])
  const social = useSocial(state)

  useEffect(() => { setSoundOn(state.sound) }, [state.sound])
  useEffect(() => {
    tg?.ready()
    tg?.expand()
  }, [])
  useEffect(() => {
    if (social.newFriend) {
      setToast(`🤝 Вы теперь друзья с ${social.newFriend}!`)
      social.clearNewFriend()
    }
  }, [social.newFriend]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])
  useEffect(() => { window.scrollTo(0, 0) }, [tab])

  const track = TRACKS.find((t) => t.id === state.track) ?? TRACKS[0]

  const finishLesson = (l: Lesson, xp: number, coins: number, perfect: boolean) => {
    const [next, result] = completeLesson({ ...state, coins: state.coins + coins }, l.id, xp, perfect)
    update(() => next)
    const today = dayKey()
    // реальные друзья: если друг уже занимался сегодня, общий огонёк продлевается моим первым уроком
    setRealExt(result.streakExtended
      ? social.friends.filter((f) => f.active_days.includes(today)).map((f) => ({ name: f.name, streak: sharedStreak(next.activeDays, f.active_days).streak }))
      : [])
    setLesson(null)
    setCelebrate(result)
    if (result.streakExtended) sfx.streak()
    haptic()
  }

  if (!state.onboarded) {
    return (
      <Onboarding
        onStart={(name, trackId, demo) => {
          if (demo) update(() => reconcile(demoState(name, trackId)))
          else {
            update((s) => ({ ...s, name, track: trackId, onboarded: true }))
            // First-Week Micro-Win: сразу запускаем первый урок
            setLesson(TRACKS.find((t) => t.id === trackId)!.lessons[0])
          }
        }}
      />
    )
  }

  const friendsAlert = state.friends.some((f) => f.sharedStreak > 0 && f.lastBoth !== dayKey()) || (social.nudges.length > 0 && !userActiveOn(state, dayKey()))

  return (
    <div className="app">
      {tab === 'home' && <Home state={state} social={social} track={track} openLesson={setLesson} goFriends={() => setTab('friends')} update={update} toast={setToast} />}
      {tab === 'friends' && <Friends state={state} social={social} update={update} toast={setToast} />}
      {tab === 'cohort' && <Cohort state={state} />}
      {tab === 'profile' && <ProfileScreen state={state} social={social} update={update} reset={reset} toast={setToast} />}

      <nav className="tabs">
        {([
          ['home', '🏠', 'Учёба'],
          ['friends', '🔥', 'Огоньки'],
          ['cohort', '👥', 'Когорта'],
          ['profile', '👤', 'Профиль'],
        ] as const).map(([id, ic, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); sfx.tap() }}>
            <span className="tab-ic">{ic}</span>
            {label}
            {id === 'friends' && friendsAlert && <i className="dot" />}
          </button>
        ))}
      </nav>

      {lesson && <LessonView lesson={lesson} onClose={() => setLesson(null)} onDone={(xp, c, p) => finishLesson(lesson, xp, c, p)} />}
      {celebrate && (
        <Celebration
          result={celebrate}
          realExt={realExt}
          state={state}
          onShare={() => shareStreak(state, social.friends.length + state.friends.filter((f) => f.sharedStreak > 0).length, setToast)}
          onClose={() => setCelebrate(null)}
        />
      )}
      {toast && <div className="toast" key={toast}>{toast}</div>}
    </div>
  )
}

/* ================= Онбординг ================= */
function Onboarding({ onStart }: { onStart: (name: string, t: TrackId, demo: boolean) => void }) {
  const [name, setName] = useState(tg?.initDataUnsafe?.user?.first_name ?? '')
  const [trackId, setTrackId] = useState<TrackId>('ort')
  return (
    <div className="onboarding">
      <div className="hero-glow">
        <Flame tier="tier-fire" size={96} />
      </div>
      <h1 className="brand">Akyl<span>Flow</span></h1>
      <p className="lead">5 минут в день. Огонёк с друзьями.<br />ИИ-тьютор, который не даёт сдаться.</p>
      {hasPendingRef() && <p className="invite-hint">🤝 Тебя пригласил друг! После первого урока вы будете видеть прогресс друг друга и держать общий огонёк.</p>}

      <div className="ob-form">
        <input className="input" placeholder="Как тебя зовут?" value={name} onChange={(e) => setName(e.target.value)} />
        <p className="label">Твоя цель</p>
        <div className="track-list">
          {TRACKS.map((t) => (
            <button key={t.id} className={`track ${trackId === t.id ? 'sel' : ''}`} onClick={() => { setTrackId(t.id); sfx.tap() }}>
              <span className="track-emoji">{t.emoji}</span>
              <span className="grow"><b>{t.title}</b><span className="muted small block">{t.goal}</span></span>
              <span className="radio" />
            </button>
          ))}
        </div>
        <button className="btn wide big" disabled={!name.trim()} onClick={() => onStart(name.trim(), trackId, false)}>
          Начать первый урок · 4 мин
        </button>
        <button className="link" disabled={!name.trim()} onClick={() => onStart(name.trim(), trackId, true)}>
          Открыть с демо-данными (для питча)
        </button>
      </div>
    </div>
  )
}

/* ================= Шапка ================= */
function TopBar({ state, track, doneToday }: { state: State; track: (typeof TRACKS)[number]; doneToday: boolean }) {
  return (
    <header className="topbar">
      <span className="pill">{track.emoji} {track.title}</span>
      <span className="grow" />
      <span className="pill ice" title="Заморозки">❄️ {state.freezes}</span>
      <span className="pill coin" title="Social Coins">🪙 {state.coins}</span>
      <span className={`pill fire ${doneToday ? '' : 'dim'}`}>
        <Flame tier={doneToday ? flameTier(state.streak).cls : 'tier-off'} size={14} animate={false} /> {state.streak}
      </span>
    </header>
  )
}

/* ================= Главная: личный огонёк (Duolingo) ================= */
function Home({ state, social, track, openLesson, goFriends, update, toast }: {
  state: State; social: Social; track: (typeof TRACKS)[number]; openLesson: (l: Lesson) => void; goFriends: () => void
  update: Update; toast: (t: string) => void
}) {
  const now = useNow(30_000)
  const today = dayKey(now)
  const doneToday = userActiveOn(state, today)
  const xpToday = state.xpByDay[today] ?? 0
  const goalPct = Math.min(1, xpToday / state.dailyGoal)
  const nextIdx = track.lessons.findIndex((l) => !state.completed.includes(l.id))
  const nextLesson = track.lessons[nextIdx >= 0 ? nextIdx : state.completed.length % track.lessons.length]
  const atRisk = [
    ...state.friends.filter((f) => f.sharedStreak > 0 && f.lastBoth !== today).map((f) => ({ id: f.id, name: f.name, avatar: f.avatar })),
    ...social.friends
      .filter((f) => { const s = sharedStreak(state.activeDays, f.active_days, today); return s.streak > 0 && !s.bothToday })
      .map((f) => ({ id: f.id, name: f.name, avatar: initials(f.name) })),
  ]
  const tier = flameTier(state.streak)
  const dow = (now.getDay() + 6) % 7
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - dow))
  const [chest, setChest] = useState<ChestReward | null>(null)
  const chestReady = goalPct >= 1 && state.chestDay !== today

  return (
    <div className="screen">
      <TopBar state={state} track={track} doneToday={doneToday} />

      <section className={`hero ${doneToday ? 'lit' : 'risk'}`}>
        <div className="hero-flame">
          <Flame tier={doneToday ? tier.cls : 'tier-off'} size={92} />
          {!doneToday && state.streak > 0 && <span className="hero-warn">!</span>}
        </div>
        <div className="hero-text">
          <div className="streak-num">{state.streak}</div>
          <div className="streak-label">{daysWord(state.streak)} подряд</div>
          <div className="tier-name">{state.streak ? `Уровень «${tier.label}»` : 'Огонёк ещё не зажжён'}</div>
        </div>
        <div className="hero-status">
          {doneToday ? (
            <span className="status ok">✓ Огонёк горит до завтра</span>
          ) : state.streak > 0 ? (
            <span className="status warn">⏳ Погаснет через {fmtDuration(msUntilMidnight(now))}</span>
          ) : (
            <span className="status">Пройди урок, чтобы зажечь</span>
          )}
        </div>
        <div className="week">
          {week.map((d, i) => {
            const cls = state.activeDays.includes(d) ? 'on' : state.frozenDays.includes(d) ? 'frozen' : d === today ? 'today' : d > today ? 'future' : ''
            return (
              <div key={d} className={`wd ${cls}`}>
                <span>{DAYS[i]}</span>
                <i>{cls === 'on' ? <Flame size={16} animate={false} tier="tier-fire" /> : cls === 'frozen' ? '❄️' : ''}</i>
              </div>
            )
          })}
        </div>
      </section>

      {social.nudges.length > 0 && !doneToday && (
        <button className="card banner nudge" onClick={() => openLesson(nextLesson)}>
          <span className="banner-ic wiggle">👉</span>
          <div>
            <b>{[...new Set(social.nudges.map((n) => n.from_name))].join(', ')} {social.nudges.length > 1 ? 'пнули' : 'пнул(а)'} тебя!</b>
            <p className="muted small">Ваш общий огонёк ждёт. Пройди урок →</p>
          </div>
        </button>
      )}

      {state.lostStreak > 0 && state.streak === 0 && (
        <section className="card banner repair">
          <span className="banner-ic">💔</span>
          <div className="grow">
            <b>Огонёк в {state.lostStreak} {daysWord(state.lostStreak)} погас</b>
            <p className="muted small">Восстанови серию, пока не поздно</p>
          </div>
          <button className="btn small" disabled={state.coins < REPAIR_PRICE} onClick={() => {
            update((s) => reconcile({ ...s, coins: s.coins - REPAIR_PRICE, streak: s.lostStreak, lastActive: addDays(dayKey(), -1), lostStreak: 0 }))
            sfx.streak()
            toast(`🔥 Серия ${state.lostStreak} ${daysWord(state.lostStreak)} восстановлена!`)
          }}>{REPAIR_PRICE} 🪙</button>
        </section>
      )}

      <section className="card goal">
        <div className="ring" style={{ ['--p' as string]: goalPct }}><span>{Math.round(goalPct * 100)}%</span></div>
        <div className="grow">
          <b>Цель дня · {xpToday}/{state.dailyGoal} XP</b>
          <p className="muted small">{goalPct >= 1 ? (chestReady ? 'Цель выполнена! Забери сундук 👉' : 'Цель выполнена 🎉 Сундук открыт') : `Ещё ${state.dailyGoal - xpToday} XP, а потом сундук с наградой`}</p>
        </div>
        <button className={`chest ${chestReady ? 'ready' : ''} ${state.chestDay === today ? 'opened' : ''}`} disabled={!chestReady} onClick={() => {
          const [next, r] = openChest(state)
          update(() => next)
          setChest(r)
          sfx.chest()
        }} aria-label="Сундук дня">🎁</button>
      </section>

      {atRisk.length > 0 && (
        <button className="card banner friends-risk" onClick={goFriends}>
          <div className="avatars">{atRisk.slice(0, 3).map((f) => <span key={f.id}>{f.avatar}</span>)}</div>
          <div className="grow">
            <b>{atRisk.length === 1 ? `Огонёк с ${atRisk[0].name} в опасности` : `${atRisk.length} огонька с друзьями в опасности`}</b>
            <p className="muted small">Нужно, чтобы сегодня занимались вы оба</p>
          </div>
          <span className="chev">›</span>
        </button>
      )}

      <section className="card lesson-card">
        <div className="lc-head">
          <span className="eyebrow">Урок дня</span>
          <span className="chip soft">{nextLesson.minutes} мин</span>
        </div>
        <h3>{nextLesson.title}</h3>
        <p className="muted small">{nextLesson.questions.length} вопроса · ИИ-подсказки · дискуссия когорты</p>
        <button className="btn wide big" onClick={() => openLesson(nextLesson)}>{doneToday ? 'Ещё урок ⚡' : 'Зажечь огонёк 🔥'}</button>
      </section>

      <div className="section-head">
        <span className="eyebrow">Спринт · неделя 1</span>
        <span className="muted small">{track.goal}</span>
      </div>
      <div className="path">
        {track.lessons.map((l, i) => {
          const done = state.completed.includes(l.id)
          const current = l.id === nextLesson.id && !done
          return (
            <div key={l.id} className={`step pos${i % 4}`}>
              {current && <span className="bubble">СТАРТ</span>}
              <button className={`node ${done ? 'done' : ''} ${current ? 'current' : ''}`} onClick={() => openLesson(l)} aria-label={l.title}>
                {done ? '✓' : ['📘', '🧮', '💬', '🎧'][i % 4]}
              </button>
              <span className="step-title">{l.title}</span>
            </div>
          )
        })}
        <div className="step pos3">
          <button className="node locked" disabled>🔒</button>
          <span className="step-title muted">Неделя 2 · по расписанию когорты</span>
        </div>
        <div className="step pos1">
          <button className="node trophy" disabled>🏆</button>
          <span className="step-title muted">Пробный экзамен</span>
        </div>
      </div>

      {chest && createPortal(
        <div className="overlay" onClick={() => setChest(null)}>
          <Confetti count={40} />
          <div className="modal chest-modal" onClick={(e) => e.stopPropagation()}>
            <div className="chest-open">🎁</div>
            <p className="eyebrow">Сундук дня</p>
            <h2>{chest.kind === 'freeze' ? 'Редкая награда!' : 'Награда!'}</h2>
            <div className="reward-big">{chest.kind === 'freeze' ? '❄️ +1 заморозка' : `🪙 +${chest.amount}`}</div>
            <p className="muted small">Новый сундук завтра. Не пропусти!</p>
            <button className="btn wide" onClick={() => setChest(null)}>Забрать</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

/* ================= Огоньки с друзьями (TikTok) ================= */
function friendStatus(state: State, f: Friend, now: Date) {
  const today = dayKey(now)
  const me = userActiveOn(state, today)
  const them = friendActiveOn(f, today, now)
  if (f.lastBoth === today) return { text: 'Оба позанимались сегодня ✓', cls: 'ok' }
  if (me && !them) return { text: `Ждём ${f.name}… осталось ${fmtDuration(msUntilMidnight(now))}`, cls: 'wait' }
  if (!me && them) return { text: `${f.name} уже позанимался(ась). Твоя очередь!`, cls: 'you' }
  if (f.sharedStreak > 0) return { text: `Никто ещё не занимался · ${fmtDuration(msUntilMidnight(now))}`, cls: 'risk' }
  return { text: 'Позанимайтесь в один день, чтобы зажечь огонёк', cls: '' }
}

function realStatus(me: State, f: Profile, today: string) {
  const meToday = userActiveOn(me, today)
  const them = f.active_days.includes(today)
  const { streak, bothToday } = sharedStreak(me.activeDays, f.active_days, today)
  if (bothToday) return { streak, bothToday, text: 'Оба позанимались сегодня ✓', cls: 'ok' }
  if (meToday && !them) return { streak, bothToday, text: `Ждём ${f.name}…`, cls: 'wait' }
  if (!meToday && them) return { streak, bothToday, text: `${f.name} уже позанимался(ась). Твоя очередь!`, cls: 'you' }
  if (streak > 0) return { streak, bothToday, text: 'Никто ещё не занимался сегодня', cls: 'risk' }
  return { streak, bothToday, text: 'Позанимайтесь в один день, чтобы зажечь огонёк', cls: '' }
}

function FriendFlame({ streak, lit }: { streak: number; lit: boolean }) {
  const tier = flameTier(streak)
  return (
    <div className={`f-flame ${lit ? '' : streak > 0 ? 'faded' : 'off'}`}>
      <Flame tier={streak > 0 ? tier.cls : 'tier-off'} size={26} animate={lit} />
      <span>{streak}</span>
    </div>
  )
}

function Friends({ state, social, update, toast }: { state: State; social: Social; update: Update; toast: (t: string) => void }) {
  const now = useNow(5_000)
  const today = dayKey(now)
  const sorted = [...state.friends].sort((a, b) => b.sharedStreak - a.sharedStreak)
  const [pending, setPending] = useState<string[]>([])
  const [nudged, setNudged] = useState<string[]>([])
  const [period, setPeriod] = useState<'today' | 'week'>('today')

  // симулированный друг (демо)
  const nudgeDemo = (f: Friend) => {
    setPending((p) => [...p, f.id])
    sfx.tap()
    toast(`👉 ${f.name} получил(а) напоминание`)
    setTimeout(() => {
      update((s) => reconcile({ ...s, friends: s.friends.map((x) => (x.id === f.id ? { ...x, nudgedDay: dayKey() } : x)) }))
      setPending((p) => p.filter((id) => id !== f.id))
      toast(`🔥 ${f.name} зашёл(ла) и прошёл(ла) урок!`)
      sfx.correct()
      haptic()
    }, 4000)
  }
  // реальный друг: «пинок» уходит на сервер, друг увидит его в приложении
  const nudgeReal = async (f: Profile) => {
    try {
      await social.nudge(f.id)
      setNudged((n) => [...n, f.id])
      sfx.tap()
      toast(`👉 ${f.name} увидит твой пинок в приложении`)
      haptic()
    } catch {
      toast('Не получилось отправить, проверь интернет')
    }
  }
  const restore = (f: Friend) => {
    update((s) => reconcile({
      ...s,
      coins: s.coins - FRIEND_RESTORE_PRICE,
      friends: s.friends.map((x) => (x.id === f.id ? { ...x, sharedStreak: x.lostStreak, lastBoth: addDays(dayKey(), -1), lostStreak: 0 } : x)),
    }))
    sfx.streak()
    toast(`🔥 Огонёк с ${f.name} восстановлен!`)
  }
  const url = HAS_BACKEND ? inviteUrl() : `${location.origin}${location.pathname}`
  const text = `${state.name} зовёт тебя учиться вместе в AkylFlow и держать общий огонёк 🔥`
  const invite = async () => {
    if (tg?.openTelegramLink) return tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`)
    try {
      if (navigator.share) await navigator.share({ title: 'AkylFlow', text, url })
      else {
        await navigator.clipboard.writeText(url)
        toast('🔗 Ссылка скопирована, отправь её другу')
      }
    } catch { /* пользователь отменил */ }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast('🔗 Ссылка скопирована')
    } catch {
      toast('Скопируй ссылку вручную')
    }
  }

  // рейтинг «кто сколько занимался»: я + реальные друзья
  const meRow = { id: 'me', name: state.name, me: true, today: state.xpByDay[today] ?? 0, week: xpWeek({ xp_by_day: state.xpByDay }, today), streak: state.streak, active: userActiveOn(state, today) }
  const rows = [meRow, ...social.friends.map((f) => ({ id: f.id, name: f.name, me: false, today: xpOn(f, today), week: xpWeek(f, today), streak: f.active_days.includes(today) || f.active_days.includes(addDays(today, -1)) ? f.streak : 0, active: f.active_days.includes(today) }))]
    .sort((a, b) => b[period] - a[period])
  const maxXp = Math.max(1, ...rows.map((r) => r[period]))

  return (
    <div className="screen">
      <div className="page-head">
        <h1 className="h1">Огоньки</h1>
        <p className="muted small">Огонёк растёт, только если <b>вы оба</b> занимаетесь каждый день. Пропустил один, и огонёк гаснет у обоих.</p>
      </div>

      <div className="tiers">
        {([[1, 'Искра'], [3, 'Огонь'], [30, 'Пламя'], [100, 'Легенда']] as const).map(([n, l]) => (
          <div key={n} className="tier"><Flame tier={flameTier(n).cls} size={22} animate={false} /><b>{n}+</b><span className="muted tiny">{l}</span></div>
        ))}
      </div>

      {HAS_BACKEND && (
        <section className="card invite">
          <div className="invite-head">
            <span className="banner-ic">🤝</span>
            <div>
              <b>Позови друга по ссылке</b>
              <p className="muted small">Друг откроет её, и вы сразу появитесь друг у друга: будете видеть, кто сколько занимался.</p>
            </div>
          </div>
          <div className="link-row">
            <input className="input link-input" readOnly value={url} onFocus={(e) => e.target.select()} />
            <button className="btn small ghost" onClick={copy}>Копировать</button>
          </div>
          <button className="btn wide tg" onClick={invite}>✈️ Отправить в Telegram</button>
          {!social.online && <p className="warn-text small">Нет связи с сервером, данные обновятся позже</p>}
        </section>
      )}

      {social.friends.length > 0 && (
        <>
          <div className="section-head">
            <span className="eyebrow">Кто сколько занимался</span>
            <div className="seg">
              <button className={period === 'today' ? 'on' : ''} onClick={() => setPeriod('today')}>Сегодня</button>
              <button className={period === 'week' ? 'on' : ''} onClick={() => setPeriod('week')}>Неделя</button>
            </div>
          </div>
          <div className="board">
            {rows.map((r, i) => (
              <div key={r.id} className={`row lb ${r.me ? 'me' : ''}`}>
                <span className="place">{i < 3 && r[period] > 0 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
                <span className="ava sm">{initials(r.name)}</span>
                <div className="grow">
                  <div className="lb-top">
                    <span>{r.name}{r.me && ' (ты)'} {r.active && <span className="done-dot" title="Занимался сегодня">✓</span>}</span>
                    <b>{r[period]} XP</b>
                  </div>
                  <div className="lb-bar"><div style={{ width: `${(r[period] / maxXp) * 100}%` }} /></div>
                  <span className="muted tiny">серия {r.streak} {daysWord(r.streak)}</span>
                </div>
              </div>
            ))}
          </div>

          <span className="eyebrow">Общие огоньки</span>
          {social.friends.map((f) => {
            const st = realStatus(state, f, today)
            const tier = flameTier(st.streak)
            const canNudge = !f.active_days.includes(today) && !nudged.includes(f.id)
            return (
              <div key={f.id} className={`friend ${st.cls}`}>
                <div className="ava">{initials(f.name)}</div>
                <div className="f-main">
                  <b>{f.name}</b>
                  <span className={`f-status ${st.cls}`}>{st.text}</span>
                  <span className="muted tiny">Сегодня {xpOn(f, today)} XP · неделя {xpWeek(f, today)} XP</span>
                  {tier.next && st.streak > 0 && <div className="f-next"><div style={{ width: `${(st.streak / tier.next) * 100}%` }} /></div>}
                </div>
                <div className="f-right">
                  <FriendFlame streak={st.streak} lit={st.bothToday} />
                  {canNudge && <button className="chip nudge-btn" onClick={() => nudgeReal(f)}>👉 Пнуть</button>}
                  {nudged.includes(f.id) && <span className="muted tiny">пнул ✓</span>}
                </div>
              </div>
            )
          })}
        </>
      )}

      {HAS_BACKEND && social.friends.length === 0 && (
        <div className="empty">
          <Flame tier="tier-off" size={40} animate={false} />
          <p className="muted small">Пока нет друзей. Отправь ссылку выше: как только друг её откроет, он появится здесь.</p>
        </div>
      )}

      {sorted.length > 0 && <span className="eyebrow">{HAS_BACKEND ? 'Демо-друзья' : 'Друзья'}</span>}
      {sorted.map((f) => {
        const st = friendStatus(state, f, now)
        const tier = flameTier(f.sharedStreak)
        const canNudge = !friendActiveOn(f, today, now) && !pending.includes(f.id) && f.nudgedDay !== today
        return (
          <div key={f.id} className={`friend ${st.cls}`}>
            <div className="ava emoji-ava">{f.avatar}</div>
            <div className="f-main">
              <b>{f.name}</b>
              <span className={`f-status ${st.cls}`}>{st.text}</span>
              {tier.next && f.sharedStreak > 0 && (
                <div className="f-next"><div style={{ width: `${(f.sharedStreak / tier.next) * 100}%` }} /></div>
              )}
              {f.lostStreak > 0 && f.sharedStreak === 0 && (
                <button className="chip warn" disabled={state.coins < FRIEND_RESTORE_PRICE} onClick={() => restore(f)}>
                  💔 Огонёк {f.lostStreak} {daysWord(f.lostStreak)} погас · вернуть за {FRIEND_RESTORE_PRICE} 🪙
                </button>
              )}
            </div>
            <div className="f-right">
              <FriendFlame streak={f.sharedStreak} lit={f.lastBoth === today} />
              {canNudge && <button className="chip nudge-btn" onClick={() => nudgeDemo(f)}>👉 Пнуть</button>}
              {pending.includes(f.id) && <span className="muted tiny">отправлено…</span>}
            </div>
          </div>
        )
      })}

      {!HAS_BACKEND && <button className="btn wide ghost" onClick={invite}>＋ Пригласить друга в Telegram</button>}
    </div>
  )
}

/* ================= Когорта ================= */
const COHORT = ['Айгерим', 'Бекзат', 'Жылдыз', 'Тимур', 'Нурлан', 'Асель', 'Эрлан', 'Алина', 'Дастан', 'Мээрим', 'Улан', 'Сезим', 'Адилет', 'Камила', 'Эмир', 'Айпери', 'Султан']

function Cohort({ state }: { state: State }) {
  const now = useNow(1_000)
  const weekXp = Object.entries(state.xpByDay).filter(([d]) => d > addDays(dayKey(), -7)).reduce((a, [, v]) => a + v, 0)
  const board = useMemo(() => {
    const rows = COHORT.map((n, i) => ({ name: n, xp: ((i * 73 + 41) % 260) + 20, me: false }))
    rows.push({ name: state.name || 'Ты', xp: weekXp, me: true })
    return rows.sort((a, b) => b.xp - a.xp)
  }, [state.name, weekXp])
  const myPlace = board.findIndex((r) => r.me) + 1
  const live = 3 + ((now.getMinutes() * 7 + Math.floor(now.getSeconds() / 8)) % 6)
  const nextMonday = new Date(now)
  nextMonday.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7))
  nextMonday.setHours(0, 0, 0, 0)

  const [focus, setFocus] = useState<number | null>(null) // время окончания
  const left = focus ? Math.max(0, focus - now.getTime()) : 0
  const focusPct = focus ? 1 - left / (25 * 60000) : 0

  return (
    <div className="screen">
      <div className="page-head">
        <h1 className="h1">Когорта #42</h1>
        <p className="muted small">18 человек · одна цель · 4-недельный спринт</p>
      </div>

      <div className="grid2">
        <section className="card stat-card">
          <span className="live-dot" />
          <b className="stat-big">{live}</b>
          <span className="muted tiny">занимаются прямо сейчас</span>
        </section>
        <section className="card stat-card">
          <span>⏰</span>
          <b className="stat-big sm">{fmtDuration(nextMonday.getTime() - now.getTime())}</b>
          <span className="muted tiny">до открытия модуля 2</span>
        </section>
      </div>

      <section className="card focus-card">
        <div className="focus-ring" style={{ ['--p' as string]: focusPct }}>
          <span>{focus && left > 0 ? `${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}` : '25:00'}</span>
        </div>
        <div className="grow">
          <b>🍅 Комната фокуса</b>
          <p className="muted small">25 минут без отвлечений. С тобой {live} {plural(live, 'человек', 'человека', 'человек')} из когорты.</p>
          {focus && left > 0
            ? <button className="chip" onClick={() => setFocus(null)}>Выйти</button>
            : <button className="btn small" onClick={() => { setFocus(Date.now() + 25 * 60000); sfx.tap() }}>Войти</button>}
        </div>
      </section>

      <div className="section-head">
        <span className="eyebrow">Рейтинг недели</span>
        <span className="chip soft">ты на {myPlace} месте</span>
      </div>
      <div className="board">
        {board.map((r, i) => (
          <div key={r.name + i} className={`row ${r.me ? 'me' : ''}`}>
            <span className="place">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
            <span className="ava sm">{initials(r.name)}</span>
            <span className="grow">{r.name}{r.me && ' (ты)'}</span>
            <b>{r.xp} XP</b>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ================= Профиль, достижения, магазин ================= */
function ProfileScreen({ state, social, update, reset, toast }: { state: State; social: Social; update: Update; reset: () => void; toast: (t: string) => void }) {
  const today = dayKey()
  const dow = (new Date().getDay() + 6) % 7
  const start = addDays(today, -dow - 28)
  const days = Array.from({ length: 35 }, (_, i) => addDays(start, i))
  const realMax = Math.max(0, ...social.friends.map((f) => sharedStreak(state.activeDays, f.active_days, today).streak))
  const ach = achievements(state, realMax)
  const unlocked = ach.filter((a) => a.progress >= a.goal).length
  const [sharing, setSharing] = useState(false)

  return (
    <div className="screen">
      <section className="profile-head">
        <div className="ava xl">{initials(state.name)}</div>
        <div className="grow">
          <h1 className="h1">{state.name}</h1>
          <p className="muted small">Когорта #42 · {TRACKS.find((t) => t.id === state.track)?.title}</p>
        </div>
      </section>

      <div className="stats">
        <div><Flame tier={flameTier(state.streak).cls} size={18} animate={false} /><b>{state.streak}</b><span>серия</span></div>
        <div><span>🏆</span><b>{state.longest}</b><span>рекорд</span></div>
        <div><span>⚡</span><b>{state.xp}</b><span>XP</span></div>
        <div><span>🪙</span><b>{state.coins}</b><span>монеты</span></div>
      </div>

      <button className="btn wide share" disabled={sharing || state.streak === 0} onClick={async () => {
        setSharing(true)
        await shareStreak(state, social.friends.length + state.friends.filter((f) => f.sharedStreak > 0).length, toast)
        setSharing(false)
      }}>📸 Поделиться огоньком в сторис</button>

      <div className="section-head">
        <span className="eyebrow">Достижения</span>
        <span className="chip soft">{unlocked}/{ach.length}</span>
      </div>
      <div className="badges">
        {ach.map((a) => {
          const ok = a.progress >= a.goal
          return (
            <div key={a.id} className={`badge-item ${ok ? 'ok' : ''}`} title={a.desc}>
              <span className="badge-ic">{a.emoji}</span>
              <b>{a.title}</b>
              {ok ? <span className="tiny muted">{a.desc}</span> : (
                <div className="badge-prog"><div style={{ width: `${Math.min(1, a.progress / a.goal) * 100}%` }} /><span>{Math.min(a.progress, a.goal)}/{a.goal}</span></div>
              )}
            </div>
          )
        })}
      </div>

      <span className="eyebrow">Последние 5 недель</span>
      <div className="calendar">
        {DAYS.map((d) => <span key={d} className="cal-h">{d}</span>)}
        {days.map((d) => (
          <span key={d} className={`cal ${state.activeDays.includes(d) ? 'on' : state.frozenDays.includes(d) ? 'frozen' : ''} ${d === today ? 'today' : ''} ${d > today ? 'future' : ''}`}>
            {Number(d.slice(8))}
          </span>
        ))}
      </div>

      <div className="section-head">
        <span className="eyebrow">Магазин</span>
        <span className="muted tiny">монеты даются за помощь сокурсникам</span>
      </div>
      <div className="shop">
        <div className="item">
          <span className="item-ic ice">❄️</span>
          <div className="grow"><b>Заморозка серии</b><p className="muted small">Спасёт огонёк, если пропустишь день · {state.freezes}/{MAX_FREEZES}</p></div>
          <button className="btn small" disabled={state.coins < FREEZE_PRICE || state.freezes >= MAX_FREEZES} onClick={() => {
            update((s) => ({ ...s, coins: s.coins - FREEZE_PRICE, freezes: s.freezes + 1 }))
            sfx.correct()
            toast('❄️ Заморозка куплена')
          }}>{FREEZE_PRICE} 🪙</button>
        </div>
        <div className="item">
          <span className="item-ic">🎙️</span>
          <div className="grow"><b>+10 мин голосового экзамена</b><p className="muted small">Скоро · ИИ-экзаменатор</p></div>
          <button className="btn small" disabled>200 🪙</button>
        </div>
        <div className="item pro">
          <span className="item-ic">💎</span>
          <div className="grow"><b>Когортный Спринт Про</b><p className="muted small">ИИ-тьютор без лимита, сертификат</p></div>
          <button className="btn small gold" onClick={() => toast('💳 Оплата (Элкарт / Mbank) появится в следующей версии')}>1 990 с</button>
        </div>
      </div>

      <span className="eyebrow">Настройки</span>
      <div className="settings card">
        <label className="setting">
          <span>🔊 Звуки и вибрация</span>
          <input type="checkbox" className="switch" checked={state.sound} onChange={(e) => update((s) => ({ ...s, sound: e.target.checked }))} />
        </label>
        <div className="setting col">
          <span>🎯 Трек</span>
          <div className="seg wide">
            {TRACKS.map((t) => (
              <button key={t.id} className={state.track === t.id ? 'on' : ''} onClick={() => update((s) => ({ ...s, track: t.id }))}>{t.emoji} {t.title}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="dev">
        <span className="eyebrow">Для демо</span>
        <button className="link" onClick={() => { update((s) => reconcile(demoState(s.name, s.track ?? 'ort'))); toast('Демо-данные загружены') }}>Загрузить демо-данные</button>
        <button className="link" onClick={() => {
          // имитация «прошёл день»: сдвигаем все даты на день назад
          update((s) => {
            const shift = (d: string | null) => (d ? addDays(d, -1) : d)
            const xpByDay: Record<string, number> = {}
            Object.entries(s.xpByDay).forEach(([d, v]) => (xpByDay[addDays(d, -1)] = v))
            return reconcile({
              ...s, xpByDay,
              activeDays: s.activeDays.map((d) => addDays(d, -1)),
              frozenDays: s.frozenDays.map((d) => addDays(d, -1)),
              lastActive: shift(s.lastActive),
              chestDay: shift(s.chestDay),
              friends: s.friends.map((f) => ({ ...f, lastBoth: shift(f.lastBoth), nudgedDay: null })),
            })
          })
          toast('⏭ Перемотали на следующий день')
        }}>⏭ Симулировать следующий день</button>
        <button className="link danger" onClick={() => { if (confirm('Сбросить весь прогресс?')) reset() }}>Сбросить прогресс</button>
      </div>
    </div>
  )
}

/* ================= Празднование после урока ================= */
function Celebration({ result, realExt, state, onShare, onClose }: { result: LessonResult; realExt: { name: string; streak: number }[]; state: State; onShare: () => void; onClose: () => void }) {
  const tier = flameTier(result.newStreak)
  const milestone = [3, 7, 14, 30, 50, 100, 365].includes(result.newStreak)
  const ext = [
    ...realExt,
    ...result.friendsExtended.map((n) => ({ name: n, streak: state.friends.find((x) => x.name === n)?.sharedStreak ?? 0 })),
  ]
  return (
    <div className="overlay" onClick={onClose}>
      {(result.streakExtended || milestone) && <Confetti count={milestone ? 90 : 50} />}
      <div className="modal celebrate" onClick={(e) => e.stopPropagation()}>
        {result.streakExtended ? (
          <>
            <div className="cel-flame"><Flame tier={tier.cls} size={120} /></div>
            <div className="streak-num big">{result.newStreak}</div>
            <h2>{milestone ? `Рубеж ${result.newStreak} ${daysWord(result.newStreak)}! 🎉` : result.newStreak === 1 ? 'Огонёк зажжён!' : 'Серия продлена!'}</h2>
            <p className="muted">{result.newStreak === 1 ? 'Возвращайся завтра, чтобы он разгорелся' : `Ты занимаешься ${result.newStreak} ${daysWord(result.newStreak)} подряд. Это лучше, чем у 80% когорты`}</p>
          </>
        ) : (
          <>
            <div className="cel-flame bolt">⚡</div>
            <h2>Урок пройден!</h2>
            <p className="muted">Огонёк уже горит сегодня, а XP идут в рейтинг</p>
          </>
        )}
        <div className="rewards">
          <span>⚡ +{result.xpGained} XP</span>
          <span>🪙 +15</span>
        </div>
        {ext.length > 0 && (
          <div className="friend-ext">
            {ext.map((r) => (
              <div key={r.name}><Flame tier={flameTier(r.streak).cls} size={16} animate={false} /> Огонёк с <b>{r.name}</b> теперь <b>{r.streak}</b> {daysWord(r.streak)}</div>
            ))}
          </div>
        )}
        {state.friends.some((f) => f.sharedStreak > 0 && f.lastBoth !== dayKey()) && (
          <p className="muted small">Некоторые друзья ещё не занимались. Пни их во вкладке «Огоньки» 👉</p>
        )}
        <button className="btn wide big" onClick={onClose}>Продолжить</button>
        {result.streakExtended && <button className="link" onClick={onShare}>📸 Поделиться огоньком</button>}
      </div>
    </div>
  )
}
