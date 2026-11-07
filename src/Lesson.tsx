import { useMemo, useState } from 'react'
import { PEER_ANSWERS, type Lesson } from './content'
import { Flame, sfx } from './ui'

type Props = {
  lesson: Lesson
  onClose: () => void
  onDone: (xp: number, coins: number, perfect: boolean) => void
}

// Микро-урок: вопросы → при ошибке наводящий вопрос ИИ-тьютора → дискуссия под уроком → ревью сокурсника
export default function LessonView({ lesson, onClose, onDone }: Props) {
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [wrongTries, setWrongTries] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [combo, setCombo] = useState(0)
  const [bestCombo, setBestCombo] = useState(0)
  const [xp, setXp] = useState(0)
  const [gain, setGain] = useState<string | null>(null)
  const [phase, setPhase] = useState<'quiz' | 'discuss' | 'review'>('quiz')
  const [answer, setAnswer] = useState('')
  const [rated, setRated] = useState<number | null>(null)

  const peers = useMemo(() => [...PEER_ANSWERS].sort(() => Math.random() - 0.5).slice(0, 3), [])
  const total = lesson.questions.length
  const q = lesson.questions[i]
  const solved = picked === q?.correct
  const progress = phase === 'quiz' ? (i + (solved ? 1 : 0)) / (total + 1) : phase === 'discuss' ? total / (total + 1) : 1

  const pick = (idx: number) => {
    if (solved) return
    setPicked(idx)
    if (idx === q.correct) {
      const firstTry = wrongTries === 0
      const c = firstTry ? combo + 1 : 0
      const bonus = c >= 3 ? 5 : 0
      const add = (firstTry ? 10 : 5) + bonus
      setCombo(c)
      setBestCombo((b) => Math.max(b, c))
      setXp((v) => v + add)
      setGain(`+${add} XP${bonus ? ' · комбо!' : ''}`)
      c >= 2 ? sfx.combo() : sfx.correct()
    } else {
      setWrongTries((w) => w + 1)
      setMistakes((m) => m + 1)
      setCombo(0)
      sfx.wrong()
    }
  }
  const next = () => {
    setPicked(null)
    setWrongTries(0)
    setGain(null)
    if (i + 1 < total) setI(i + 1)
    else setPhase('discuss')
  }

  return (
    <div className="lesson">
      <div className="lesson-top">
        <button className="icon-btn" onClick={onClose} aria-label="Закрыть">✕</button>
        <div className="bar"><div className="bar-fill" style={{ width: `${progress * 100}%` }} /></div>
        <span className={`combo ${combo >= 2 ? 'on' : ''}`} key={combo}>
          <Flame tier={combo >= 3 ? 'tier-hot' : combo >= 2 ? 'tier-fire' : 'tier-off'} size={18} animate={combo >= 2} />
          {combo >= 2 ? `x${combo}` : xp}
        </span>
      </div>

      {phase === 'quiz' && (
        <div className="lesson-body" key={i}>
          <p className="eyebrow">Вопрос {i + 1} из {total} · {lesson.title}</p>
          <h2 className="question">{q.q}</h2>
          <div className="options">
            {q.options.map((o, idx) => {
              const state = picked === idx ? (idx === q.correct ? 'ok' : 'bad') : solved && idx === q.correct ? 'ok' : ''
              return (
                <button key={idx} className={`option ${state}`} onClick={() => pick(idx)} disabled={solved}>
                  <span className="opt-key">{'ABCD'[idx]}</span>
                  {o}
                </button>
              )
            })}
          </div>

          {picked !== null && !solved && (
            <div className="tutor" key={wrongTries}>
              <div className="tutor-ava">🤖</div>
              <div>
                <b>ИИ-тьютор</b>
                <p>{q.hint}</p>
                <p className="muted small">Попробуй ещё раз. Ответ я не скажу, но ты справишься 💪</p>
              </div>
            </div>
          )}
        </div>
      )}

      {phase === 'quiz' && solved && (
        <div className="sheet ok">
          <div>
            <b>{wrongTries === 0 ? (combo >= 3 ? `🔥 Комбо x${combo}!` : 'Отлично!') : 'Верно!'}</b>
            <span className="gain">{gain}</span>
          </div>
          <button className="btn btn-ok" onClick={next}>Дальше</button>
        </div>
      )}

      {phase === 'discuss' && (
        <div className="lesson-body">
          <p className="eyebrow">💬 Дискуссия когорты · обязательно, чтобы открыть следующий шаг</p>
          <h2 className="question">{lesson.discussion}</h2>
          <textarea
            className="input"
            rows={4}
            placeholder="Твой ответ видят 17 сокурсников из когорты #42…"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <button className="btn wide" disabled={answer.trim().length < 3} onClick={() => { sfx.tap(); setPhase('review') }}>
            Отправить · +10 🪙
          </button>
        </div>
      )}

      {phase === 'review' && (
        <div className="lesson-body">
          <p className="eyebrow">🤝 Оцени ответ сокурсника, за это получишь Social Coins</p>
          <div className="peer mine"><b>Ты</b>{answer}</div>
          {peers.map((p, idx) => (
            <div key={p.name} className={`peer ${rated === idx ? 'rated' : ''}`}>
              <b>{p.name}</b>
              {p.text}
              <button className="chip" disabled={rated !== null} onClick={() => { setRated(idx); sfx.correct() }}>
                {rated === idx ? '👍 Полезно · +5 🪙' : '👍 Полезно'}
              </button>
            </div>
          ))}
          <div className="summary">
            <span>⚡ {xp + 10} XP</span>
            <span>🎯 {mistakes === 0 ? 'без ошибок' : `${mistakes} ош.`}</span>
            <span>🔥 комбо x{bestCombo}</span>
          </div>
          <button className="btn wide" disabled={rated === null} onClick={() => onDone(xp + 10, 15, mistakes === 0)}>
            Завершить урок
          </button>
        </div>
      )}
    </div>
  )
}
