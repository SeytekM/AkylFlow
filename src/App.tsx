import { useEffect, useMemo, useState } from 'react'
import { TRACKS, type Lesson, type TrackId } from './content'
import LessonView from './Lesson'
import { HAS_BACKEND } from './config'
import { capturePendingRef, hasPendingRef, inviteUrl, sharedStreak, useSocial, xpOn, xpWeek, type Profile, type Social } from './social'
import {
  FREEZE_PRICE, FRIEND_RESTORE_PRICE, MAX_FREEZES, REPAIR_PRICE,
  addDays, completeLesson, dayKey, demoState, flameTier, fmtDuration, friendActiveOn,
  msUntilMidnight, reconcile, useStore, userActiveOn,
  type Friend, type LessonResult, type State,
} from './store'

type Tab = 'home' | 'friends' | 'cohort' | 'profile'

declare global {
  interface Window {
    Telegram?: { WebApp?: { ready: () => void; expand: () => void; initDataUnsafe?: { user?: { first_name?: string } }; openTelegramLink: (u: string) => void; HapticFeedback?: { notificationOccurred: (t: string) => void } } }
  }
}
capturePendingRef()
const tg = window.Telegram?.WebApp
const haptic = () => tg?.HapticFeedback?.notificationOccurred('success')

function useNow(ms = 1000) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

export default function App() {
  const { state, update, reset } = useStore()
  const [tab, setTab] = useState<Tab>('home')
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [celebrate, setCelebrate] = useState<LessonResult | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [realExt, setRealExt] = useState<{ name: string; streak: number }[]>([])
  const social = useSocial(state)
  useEffect(() => {
    if (social.newFriend) {
      setToast(`🤝 Вы теперь друзья с ${social.newFriend}!`)
      social.clearNewFriend()
    }
  }, [social.newFriend]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    tg?.ready()
    tg?.expand()
  }, [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const track = TRACKS.find((t) => t.id === state.track) ?? TRACKS[0]

  const finishLesson = (l: Lesson, xp: number, coins: number) => {
    const [next, result] = completeLesson({ ...state, coins: state.coins + coins }, l.id, xp)
    update(() => next)
    // реальные друзья: если друг уже занимался сегодня, общий огонёк продлевается моим первым уроком
    const today = dayKey()
    setRealExt(result.streakExtended
      ? social.friends.filter((f) => f.active_days.includes(today)).map((f) => ({ name: f.name, streak: sharedStreak(next.activeDays, f.active_days).streak }))
      : [])
    setLesson(null)
    setCelebrate(result)
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

  return (
    <div className="app">
      {tab === 'home' && <Home state={state} social={social} track={track} openLesson={setLesson} goFriends={() => setTab('friends')} update={update} toast={setToast} />}
      {tab === 'friends' && <Friends state={state} social={social} update={update} toast={setToast} />}
      {tab === 'cohort' && <Cohort state={state} />}
      {tab === 'profile' && <Profile state={state} update={update} reset={reset} toast={setToast} />}

      <nav className="tabs">
        {([
          ['home', '🏠', 'Учёба'],
          ['friends', '🔥', 'Огоньки'],
          ['cohort', '👥', 'Когорта'],
          ['profile', '👤', 'Профиль'],
        ] as const).map(([id, ic, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            <span>{ic}</span>
            {label}
            {id === 'friends' && (state.friends.some((f) => f.sharedStreak > 0 && f.lastBoth !== dayKey()) || (social.nudges.length > 0 && !userActiveOn(state, dayKey()))) && <i className="dot" />}
          </button>
        ))}
      </nav>

      {lesson && <LessonView lesson={lesson} onClose={() => setLesson(null)} onDone={(xp, c) => finishLesson(lesson, xp, c)} />}
      {celebrate && <Celebration result={celebrate} realExt={realExt} state={state} onClose={() => setCelebrate(null)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

/* ================= Онбординг ================= */
function Onboarding({ onStart }: { onStart: (name: string, t: TrackId, demo: boolean) => void }) {
  const [name, setName] = useState(tg?.initDataUnsafe?.user?.first_name ?? '')
  const [trackId, setTrackId] = useState<TrackId>('ort')
  return (
    <div className="onboarding">
      <div className="big-flame tier-fire">🔥</div>
      <h1>AkylFlow</h1>
      {hasPendingRef() && <p className="invite-hint">🤝 Тебя пригласил друг! После онбординга вы станете друзьями и будете видеть прогресс друг друга.</p>}
      <p className="muted">Микро-уроки по 5 минут, ИИ-тьютор и огонёк с друзьями. Учись каждый день и не дай огоньку погаснуть.</p>
      <input className="input" placeholder="Как тебя зовут?" value={name} onChange={(e) => setName(e.target.value)} />
      <p className="label">Твоя цель</p>
      <div className="track-list">
        {TRACKS.map((t) => (
          <button key={t.id} className={`track ${trackId === t.id ? 'sel' : ''}`} onClick={() => setTrackId(t.id)}>
            <span className="emoji">{t.emoji}</span>
            <span><b>{t.title}</b><br /><span className="muted small">{t.goal}</span></span>
          </button>
        ))}
      </div>
      <button className="btn wide" disabled={!name.trim()} onClick={() => onStart(name.trim(), trackId, false)}>
        Начать первый урок · 4 мин
      </button>
      <button className="link" disabled={!name.trim()} onClick={() => onStart(name.trim(), trackId, true)}>
        Открыть с демо-данными (для питча)
      </button>
    </div>
  )
}

/* ================= Главная: личный огонёк (Duolingo) ================= */
function Home({ state, social, track, openLesson, goFriends, update, toast }: {
  state: State; social: Social; track: (typeof TRACKS)[number]; openLesson: (l: Lesson) => void; goFriends: () => void
  update: (fn: (s: State) => State) => void; toast: (t: string) => void
}) {
  const now = useNow(30_000)
  const today = dayKey(now)
  const doneToday = userActiveOn(state, today)
  const xpToday = state.xpByDay[today] ?? 0
  const goalPct = Math.min(1, xpToday / state.dailyGoal)
  const nextLesson = track.lessons.find((l) => !state.completed.includes(l.id)) ?? track.lessons[(state.completed.length) % track.lessons.length]
  const atRisk = [
    ...state.friends.filter((f) => f.sharedStreak > 0 && f.lastBoth !== today).map((f) => ({ id: f.id, name: f.name, avatar: f.avatar })),
    ...social.friends
      .filter((f) => { const s = sharedStreak(state.activeDays, f.active_days, today); return s.streak > 0 && !s.bothToday })
      .map((f) => ({ id: f.id, name: f.name, avatar: initials(f.name) })),
  ]
  const tier = flameTier(state.streak)

  // текущая неделя Пн–Вс
  const dow = (now.getDay() + 6) % 7
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - dow))

  return (
    <div className="screen">
      <header className="top">
        <span className="badge">{track.emoji} {track.title}</span>
        <span className="badge">❄️ {state.freezes}</span>
        <span className="badge">🪙 {state.coins}</span>
        <span className={`badge streak ${doneToday ? '' : 'dim'}`}>🔥 {state.streak}</span>
      </header>

      <section className={`streak-card ${doneToday ? 'lit' : 'risk'}`}>
        <div className={`big-flame ${doneToday ? tier.cls : 'tier-off pulse'}`}>🔥</div>
        <div className="streak-num">{state.streak}</div>
        <div className="streak-label">{state.streak === 1 ? 'день подряд' : 'дней подряд'}</div>
        {doneToday ? (
          <p className="ok-text">Огонёк горит! Приходи завтра, чтобы не потерять серию.</p>
        ) : state.streak > 0 ? (
          <p className="warn-text">⏳ Огонёк погаснет через <b>{fmtDuration(msUntilMidnight(now))}</b>. Пройди 1 урок!</p>
        ) : (
          <p className="muted">Пройди урок, чтобы зажечь огонёк</p>
        )}
        <div className="week">
          {week.map((d, i) => {
            const cls = state.activeDays.includes(d) ? 'on' : state.frozenDays.includes(d) ? 'frozen' : d === today ? 'today' : ''
            return (
              <div key={d} className={`wd ${cls}`}>
                <span>{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][i]}</span>
                <i>{cls === 'on' ? '🔥' : cls === 'frozen' ? '❄️' : ''}</i>
              </div>
            )
          })}
        </div>
      </section>

      {social.nudges.length > 0 && !doneToday && (
        <button className="card nudge-banner" onClick={() => openLesson(nextLesson)}>
          <span className="emoji">👉</span>
          <div>
            <b>{[...new Set(social.nudges.map((n) => n.from_name))].join(', ')} {social.nudges.length > 1 ? 'пнули' : 'пнул(а)'} тебя!</b>
            <p className="muted small">Ваш общий огонёк ждёт. Пройди урок →</p>
          </div>
        </button>
      )}

      {state.lostStreak > 0 && state.streak === 0 && (
        <section className="card repair">
          <b>💔 Огонёк в {state.lostStreak} дн. погас</b>
          <p className="muted small">Восстанови серию, пока не поздно</p>
          <button className="btn" disabled={state.coins < REPAIR_PRICE} onClick={() => {
            update((s) => reconcile({ ...s, coins: s.coins - REPAIR_PRICE, streak: s.lostStreak, lastActive: addDays(dayKey(), -1), lostStreak: 0 }))
            toast(`🔥 Серия ${state.lostStreak} дн. восстановлена!`)
          }}>Восстановить за {REPAIR_PRICE} 🪙</button>
        </section>
      )}

      <section className="card goal">
        <div className="ring" style={{ ['--p' as string]: goalPct }}><span>{xpToday}/{state.dailyGoal}</span></div>
        <div>
          <b>Цель дня: {state.dailyGoal} XP</b>
          <p className="muted small">{goalPct >= 1 ? 'Цель выполнена 🎉 Ты в топе когорты!' : `Ещё ${state.dailyGoal - xpToday} XP, это примерно один урок`}</p>
        </div>
      </section>

      {atRisk.length > 0 && (
        <button className="card friends-risk" onClick={goFriends}>
          <div className="avatars">{atRisk.slice(0, 3).map((f) => <span key={f.id}>{f.avatar}</span>)}</div>
          <div>
            <b>{atRisk.length === 1 ? `Огонёк с ${atRisk[0].name} в опасности` : `${atRisk.length} огонька с друзьями в опасности`}</b>
            <p className="muted small">Нужно, чтобы сегодня занимались вы оба →</p>
          </div>
        </button>
      )}

      <section className="card next">
        <p className="label">Урок дня</p>
        <h3>{nextLesson.title}</h3>
        <p className="muted small">{nextLesson.minutes} мин · {nextLesson.questions.length} вопроса + дискуссия когорты</p>
        <button className="btn wide" onClick={() => openLesson(nextLesson)}>{doneToday ? 'Ещё урок' : 'Зажечь огонёк 🔥'}</button>
      </section>

      <p className="label">Спринт: {track.goal}</p>
      <div className="path">
        {track.lessons.map((l, i) => (
          <button key={l.id} className={`node ${state.completed.includes(l.id) ? 'done' : ''}`} onClick={() => openLesson(l)}>
            <span className="node-ic">{state.completed.includes(l.id) ? '✓' : i + 1}</span>
            <span>{l.title}<br /><span className="muted small">{l.minutes} мин</span></span>
          </button>
        ))}
        <div className="node locked"><span className="node-ic">🔒</span><span>Неделя 2<br /><span className="muted small">откроется по расписанию когорты</span></span></div>
      </div>
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

const initials = (name: string) => name.trim().slice(0, 1).toUpperCase() || '?'

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

function Friends({ state, social, update, toast }: { state: State; social: Social; update: (fn: (s: State) => State) => void; toast: (t: string) => void }) {
  const now = useNow(5_000)
  const today = dayKey(now)
  const sorted = [...state.friends].sort((a, b) => b.sharedStreak - a.sharedStreak)
  const [pending, setPending] = useState<string[]>([])
  const [nudged, setNudged] = useState<string[]>([])
  const [period, setPeriod] = useState<'today' | 'week'>('today')

  // симулированный друг (демо)
  const nudgeDemo = (f: Friend) => {
    setPending((p) => [...p, f.id])
    toast(`👉 ${f.name} получил(а) напоминание`)
    setTimeout(() => {
      update((s) => reconcile({ ...s, friends: s.friends.map((x) => (x.id === f.id ? { ...x, nudgedDay: dayKey() } : x)) }))
      setPending((p) => p.filter((id) => id !== f.id))
      toast(`🔥 ${f.name} зашёл(ла) и прошёл(ла) урок!`)
      haptic()
    }, 4000)
  }
  // реальный друг: «пинок» уходит на сервер, друг увидит его в приложении
  const nudgeReal = async (f: Profile) => {
    try {
      await social.nudge(f.id)
      setNudged((n) => [...n, f.id])
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
      <h1 className="h1">Огоньки с друзьями</h1>
      <p className="muted small">Огонёк растёт, только если <b>вы оба</b> занимаетесь каждый день. Пропустил один, и огонёк гаснет у обоих.</p>

      <div className="tiers">
        {[[1, 'Искра'], [3, 'Огонь'], [30, 'Пламя'], [100, 'Легенда']].map(([n, l]) => (
          <div key={n} className="tier"><span className={`mini-flame ${flameTier(n as number).cls}`}>🔥</span><b>{n}+</b><span className="muted small">{l}</span></div>
        ))}
      </div>

      {HAS_BACKEND && (
        <section className="card invite">
          <b>🤝 Позови друга по ссылке</b>
          <p className="muted small">Друг откроет ссылку, и вы сразу появитесь друг у друга в списке: будете видеть, кто сколько занимался, и держать общий огонёк.</p>
          <div className="link-row">
            <input className="input link-input" readOnly value={url} onFocus={(e) => e.target.select()} />
            <button className="btn small" onClick={copy}>Копировать</button>
          </div>
          <button className="btn wide" onClick={invite}>Отправить в Telegram</button>
          {!social.online && <p className="warn-text small">Нет связи с сервером, данные обновятся позже</p>}
        </section>
      )}

      {social.friends.length > 0 && (
        <>
          <div className="label-row">
            <p className="label">Кто сколько занимался</p>
            <div className="seg">
              <button className={period === 'today' ? 'on' : ''} onClick={() => setPeriod('today')}>Сегодня</button>
              <button className={period === 'week' ? 'on' : ''} onClick={() => setPeriod('week')}>Неделя</button>
            </div>
          </div>
          <div className="board">
            {rows.map((r, i) => (
              <div key={r.id} className={`row lb ${r.me ? 'me' : ''}`}>
                <span className="place">{i < 3 && r[period] > 0 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
                <div className="grow">
                  <div className="lb-top">
                    <span>{r.name}{r.me && ' (ты)'} {r.active ? '✅' : ''}</span>
                    <b>{r[period]} XP</b>
                  </div>
                  <div className="lb-bar"><div style={{ width: `${(r[period] / maxXp) * 100}%` }} /></div>
                  <span className="muted small">🔥 серия {r.streak} дн.</span>
                </div>
              </div>
            ))}
          </div>

          <p className="label">Общие огоньки</p>
          {social.friends.map((f) => {
            const st = realStatus(state, f, today)
            const tier = flameTier(st.streak)
            const canNudge = !f.active_days.includes(today) && !nudged.includes(f.id)
            return (
              <div key={f.id} className={`friend ${st.cls}`}>
                <div className="f-ava letter">{initials(f.name)}</div>
                <div className="f-main">
                  <b>{f.name}</b>
                  <span className={`f-status ${st.cls}`}>{st.text}</span>
                  <span className="muted small">Сегодня {xpOn(f, today)} XP · неделя {xpWeek(f, today)} XP</span>
                  {tier.next && st.streak > 0 && <div className="f-next"><div style={{ width: `${(st.streak / tier.next) * 100}%` }} /></div>}
                </div>
                <div className="f-right">
                  <div className={`f-flame ${st.bothToday ? tier.cls : st.streak > 0 ? tier.cls + ' faded' : 'tier-off'}`}>🔥<span>{st.streak}</span></div>
                  {canNudge && <button className="chip" onClick={() => nudgeReal(f)}>👉 Пнуть</button>}
                  {nudged.includes(f.id) && <span className="muted small">пнул ✓</span>}
                </div>
              </div>
            )
          })}
        </>
      )}

      {HAS_BACKEND && social.friends.length === 0 && (
        <p className="muted small center">Пока нет друзей. Отправь ссылку выше, и как только друг её откроет, он появится здесь.</p>
      )}

      {sorted.length > 0 && <p className="label">{HAS_BACKEND ? 'Демо-друзья' : 'Друзья'}</p>}
      {sorted.map((f) => {
        const st = friendStatus(state, f, now)
        const tier = flameTier(f.sharedStreak)
        const canNudge = !friendActiveOn(f, today, now) && !pending.includes(f.id) && f.nudgedDay !== today
        return (
          <div key={f.id} className={`friend ${st.cls}`}>
            <div className="f-ava">{f.avatar}</div>
            <div className="f-main">
              <b>{f.name}</b>
              <span className={`f-status ${st.cls}`}>{st.text}</span>
              {tier.next && f.sharedStreak > 0 && (
                <div className="f-next"><div style={{ width: `${(f.sharedStreak / tier.next) * 100}%` }} /></div>
              )}
              {f.lostStreak > 0 && f.sharedStreak === 0 && (
                <button className="chip warn" disabled={state.coins < FRIEND_RESTORE_PRICE} onClick={() => restore(f)}>
                  💔 Огонёк {f.lostStreak} дн. погас · вернуть за {FRIEND_RESTORE_PRICE} 🪙
                </button>
              )}
            </div>
            <div className="f-right">
              <div className={`f-flame ${f.lastBoth === today ? tier.cls : f.sharedStreak > 0 ? tier.cls + ' faded' : 'tier-off'}`}>
                🔥<span>{f.sharedStreak}</span>
              </div>
              {canNudge && <button className="chip" onClick={() => nudgeDemo(f)}>👉 Пнуть</button>}
              {pending.includes(f.id) && <span className="muted small">отправлено…</span>}
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
  const now = useNow(4_000)
  const weekXp = Object.entries(state.xpByDay).filter(([d]) => d > addDays(dayKey(), -7)).reduce((a, [, v]) => a + v, 0)
  const board = useMemo(() => {
    const rows = COHORT.map((n, i) => ({ name: n, xp: ((i * 73 + 41) % 260) + 20, me: false }))
    rows.push({ name: state.name || 'Ты', xp: weekXp, me: true })
    return rows.sort((a, b) => b.xp - a.xp)
  }, [state.name, weekXp])
  const myPlace = board.findIndex((r) => r.me) + 1
  const live = 3 + ((now.getMinutes() * 7 + Math.floor(now.getSeconds() / 4)) % 6)
  const nextMonday = new Date(now)
  nextMonday.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7))
  nextMonday.setHours(0, 0, 0, 0)

  const [focus, setFocus] = useState<number | null>(null) // время окончания
  const left = focus ? Math.max(0, focus - now.getTime()) : 0

  return (
    <div className="screen">
      <h1 className="h1">Когорта #42</h1>
      <p className="muted small">18 человек · одна цель · 4-недельный спринт</p>

      <section className="card live">
        <span className="live-dot" /> <b>{live} человек</b> прямо сейчас решают задачи
      </section>

      <section className="card">
        <b>⏰ Дедлайн недели 1</b>
        <p className="muted small">Модуль 2 откроется через {fmtDuration(nextMonday.getTime() - now.getTime())}. Успей пройти все уроки!</p>
      </section>

      <section className="card">
        <b>🍅 Комната фокуса</b>
        <p className="muted small">25 минут без отвлечений вместе с когортой</p>
        {focus && left > 0 ? (
          <div className="focus">
            <span className="focus-time">{String(Math.floor(left / 60000)).padStart(2, '0')}:{String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}</span>
            <button className="chip" onClick={() => setFocus(null)}>Стоп</button>
          </div>
        ) : (
          <button className="btn" onClick={() => setFocus(Date.now() + 25 * 60000)}>Войти в комнату ({live} внутри)</button>
        )}
      </section>

      <p className="label">Рейтинг недели · ты на {myPlace} месте</p>
      <div className="board">
        {board.map((r, i) => (
          <div key={r.name + i} className={`row ${r.me ? 'me' : ''}`}>
            <span className="place">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
            <span className="grow">{r.name}{r.me && ' (ты)'}</span>
            <b>{r.xp} XP</b>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ================= Профиль и магазин ================= */
function Profile({ state, update, reset, toast }: { state: State; update: (fn: (s: State) => State) => void; reset: () => void; toast: (t: string) => void }) {
  const today = dayKey()
  const dow = (new Date().getDay() + 6) % 7
  const start = addDays(today, -dow - 28)
  const days = Array.from({ length: 35 }, (_, i) => addDays(start, i))

  return (
    <div className="screen">
      <h1 className="h1">{state.name}</h1>
      <div className="stats">
        <div><b>🔥 {state.streak}</b><span>серия</span></div>
        <div><b>🏆 {state.longest}</b><span>рекорд</span></div>
        <div><b>⚡ {state.xp}</b><span>всего XP</span></div>
        <div><b>🪙 {state.coins}</b><span>Social Coins</span></div>
      </div>

      <p className="label">Последние 5 недель</p>
      <div className="calendar">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => <span key={d} className="cal-h">{d}</span>)}
        {days.map((d) => (
          <span key={d} className={`cal ${state.activeDays.includes(d) ? 'on' : state.frozenDays.includes(d) ? 'frozen' : ''} ${d === today ? 'today' : ''} ${d > today ? 'future' : ''}`}>
            {Number(d.slice(8))}
          </span>
        ))}
      </div>

      <p className="label">Магазин · Social Coins зарабатываются помощью сокурсникам</p>
      <div className="shop">
        <div className="item">
          <span className="emoji">❄️</span>
          <div className="grow"><b>Заморозка серии</b><p className="muted small">Спасёт огонёк, если пропустишь день. У тебя {state.freezes}/{MAX_FREEZES}</p></div>
          <button className="btn small" disabled={state.coins < FREEZE_PRICE || state.freezes >= MAX_FREEZES} onClick={() => {
            update((s) => ({ ...s, coins: s.coins - FREEZE_PRICE, freezes: s.freezes + 1 }))
            toast('❄️ Заморозка куплена')
          }}>{FREEZE_PRICE} 🪙</button>
        </div>
        <div className="item">
          <span className="emoji">🎙️</span>
          <div className="grow"><b>+10 мин голосового экзамена</b><p className="muted small">Скоро · ИИ-экзаменатор</p></div>
          <button className="btn small" disabled>200 🪙</button>
        </div>
        <div className="item">
          <span className="emoji">💎</span>
          <div className="grow"><b>Когортный Спринт Про</b><p className="muted small">ИИ-тьютор без лимита, сертификат</p></div>
          <button className="btn small" onClick={() => toast('💳 Оплата (Элкарт / Mbank) появится в следующей версии')}>1 990 с</button>
        </div>
      </div>

      <p className="label">Трек</p>
      <div className="track-list">
        {TRACKS.map((t) => (
          <button key={t.id} className={`track ${state.track === t.id ? 'sel' : ''}`} onClick={() => update((s) => ({ ...s, track: t.id }))}>
            <span className="emoji">{t.emoji}</span><span><b>{t.title}</b></span>
          </button>
        ))}
      </div>

      <div className="dev">
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
function Celebration({ result, realExt, state, onClose }: { result: LessonResult; realExt: { name: string; streak: number }[]; state: State; onClose: () => void }) {
  const tier = flameTier(result.newStreak)
  const milestone = [3, 7, 14, 30, 50, 100, 365].includes(result.newStreak)
  return (
    <div className="overlay" onClick={onClose}>
      <div className="celebrate" onClick={(e) => e.stopPropagation()}>
        {result.streakExtended ? (
          <>
            <div className={`big-flame ${tier.cls} pop`}>🔥</div>
            <div className="streak-num">{result.newStreak}</div>
            <h2>{milestone ? `Рубеж ${result.newStreak} дней! 🎉` : result.newStreak === 1 ? 'Огонёк зажжён!' : 'Серия продлена!'}</h2>
            <p className="muted">{result.newStreak === 1 ? 'Возвращайся завтра, чтобы он разгорелся' : `Ты занимаешься ${result.newStreak} дней подряд. Лучше, чем 80% когорты`}</p>
          </>
        ) : (
          <>
            <div className="big-flame tier-fire pop">⚡</div>
            <h2>Урок пройден!</h2>
          </>
        )}
        <div className="rewards">
          <span>+{result.xpGained} XP</span>
          <span>+15 🪙</span>
        </div>
        {(result.friendsExtended.length > 0 || realExt.length > 0) && (
          <div className="friend-ext">
            {realExt.map((r) => <div key={'r' + r.name}>🔥 Огонёк с <b>{r.name}</b> теперь <b>{r.streak}</b> дн.</div>)}
            {result.friendsExtended.map((n) => {
              const f = state.friends.find((x) => x.name === n)
              return <div key={n}>🔥 Огонёк с <b>{n}</b> теперь <b>{f?.sharedStreak ?? ''}</b> дн.</div>
            })}
          </div>
        )}
        {state.friends.some((f) => f.sharedStreak > 0 && f.lastBoth !== dayKey()) && (
          <p className="muted small">Некоторые друзья ещё не занимались. Пни их во вкладке «Огоньки» 👉</p>
        )}
        <button className="btn wide" onClick={onClose}>Продолжить</button>
      </div>
    </div>
  )
}
