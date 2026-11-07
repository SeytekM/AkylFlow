import { useMemo, useState } from 'react'
import { PEER_ANSWERS, type Lesson } from './content'

type Props = {
  lesson: Lesson
  onClose: () => void
  onDone: (xp: number, coins: number) => void
}

// Микро-урок: вопросы → при ошибке наводящий вопрос ИИ-тьютора → дискуссия под уроком → ревью сокурсника
export default function LessonView({ lesson, onClose, onDone }: Props) {
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [wrongTries, setWrongTries] = useState(0)
  const [xp, setXp] = useState(0)
  const [phase, setPhase] = useState<'quiz' | 'discuss' | 'review'>('quiz')
  const [answer, setAnswer] = useState('')
  const [rated, setRated] = useState<number | null>(null)

  const peers = useMemo(() => [...PEER_ANSWERS].sort(() => Math.random() - 0.5).slice(0, 3), [])
  const total = lesson.questions.length
  const q = lesson.questions[i]
  const solved = picked === q?.correct
  const progress = phase === 'quiz' ? i / (total + 1) : phase === 'discuss' ? total / (total + 1) : 1

  const pick = (idx: number) => {
    if (solved) return
    setPicked(idx)
    if (idx === q.correct) setXp((v) => v + (wrongTries === 0 ? 10 : 5))
    else setWrongTries((w) => w + 1)
  }
  const next = () => {
    setPicked(null)
    setWrongTries(0)
    if (i + 1 < total) setI(i + 1)
    else setPhase('discuss')
  }

  return (
    <div className="lesson">
      <div className="lesson-top">
        <button className="icon-btn" onClick={onClose} aria-label="Закрыть">✕</button>
        <div className="bar"><div className="bar-fill" style={{ width: `${progress * 100}%` }} /></div>
        <span className="xp-pill">+{xp} XP</span>
      </div>

      {phase === 'quiz' && (
        <div className="lesson-body">
          <p className="muted small">Вопрос {i + 1} из {total} · {lesson.title}</p>
          <h2 className="question">{q.q}</h2>
          <div className="options">
            {q.options.map((o, idx) => {
              const state = picked === idx ? (idx === q.correct ? 'ok' : 'bad') : solved && idx === q.correct ? 'ok' : ''
              return (
                <button key={idx} className={`option ${state}`} onClick={() => pick(idx)} disabled={solved}>
                  {o}
                </button>
              )
            })}
          </div>

          {picked !== null && !solved && (
            <div className="tutor">
              <div className="tutor-ava">🤖</div>
              <div>
                <b>ИИ-тьютор</b>
                <p>{q.hint}</p>
                <p className="muted small">Попробуй ещё раз. Ответ я не скажу, но ты справишься 💪</p>
              </div>
            </div>
          )}
          {solved && (
            <div className="feedback ok">
              <b>{wrongTries === 0 ? 'Отлично! +10 XP' : 'Верно! +5 XP'}</b>
              <button className="btn" onClick={next}>Дальше</button>
            </div>
          )}
        </div>
      )}

      {phase === 'discuss' && (
        <div className="lesson-body">
          <p className="muted small">💬 Дискуссия когорты · обязательно, чтобы открыть следующий шаг</p>
          <h2 className="question">{lesson.discussion}</h2>
          <textarea
            className="input"
            rows={4}
            placeholder="Твой ответ видят 17 сокурсников из когорты #42…"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <button className="btn wide" disabled={answer.trim().length < 3} onClick={() => setPhase('review')}>
            Отправить · +10 🪙
          </button>
        </div>
      )}

      {phase === 'review' && (
        <div className="lesson-body">
          <p className="muted small">🤝 Оцени ответ одного сокурсника, получишь Social Coins</p>
          <div className="peer mine"><b>Ты:</b> {answer}</div>
          {peers.map((p, idx) => (
            <div key={p.name} className={`peer ${rated === idx ? 'rated' : ''}`}>
              <b>{p.name}:</b> {p.text}
              <button className="chip" disabled={rated !== null} onClick={() => setRated(idx)}>
                {rated === idx ? '👍 Полезно (+5 🪙)' : '👍 Полезно'}
              </button>
            </div>
          ))}
          <button className="btn wide" disabled={rated === null} onClick={() => onDone(xp + 10, 15)}>
            Завершить урок · +10 XP бонус
          </button>
        </div>
      )}
    </div>
  )
}
