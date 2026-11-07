import { useId, useMemo } from 'react'

/* ---------- SVG-огонёк: одинаково выглядит на всех устройствах, цвет зависит от уровня ---------- */
export const FLAME_OUTER = 'M32 2C35 18 53 27 55 47C57 65 45 78 32 78C19 78 7 66 9 48C10 38 17 31 21 21C23 30 27 34 30 35C28 25 29 12 32 2Z'
export const FLAME_INNER = 'M32 36C34 45 43 50 43 61C43 71 38 77 32 77C25 77 21 71 21 63C21 55 27 52 29 44C30 48 32 50 34 50C32 46 31 41 32 36Z'

export const FLAME_COLORS: Record<string, [string, string, string]> = {
  'tier-off': ['#d4d9e1', '#9aa5b5', '#eef1f5'],
  'tier-spark': ['#ffd166', '#ff9f1c', '#fff4c2'],
  'tier-fire': ['#ffbe0b', '#fb5607', '#ffe45e'],
  'tier-hot': ['#ff5d8f', '#d00050', '#ffc2d4'],
  'tier-legend': ['#c77dff', '#5a189a', '#f0d9ff'],
}

export function Flame({ tier = 'tier-fire', size = 64, animate = true, className = '' }: { tier?: string; size?: number; animate?: boolean; className?: string }) {
  const id = useId().replace(/:/g, '')
  const [top, bottom, core] = FLAME_COLORS[tier] ?? FLAME_COLORS['tier-fire']
  return (
    <svg
      className={`flame ${tier} ${animate && tier !== 'tier-off' ? 'flicker' : ''} ${className}`}
      width={size}
      height={size * 1.25}
      viewBox="0 0 64 80"
      aria-hidden
    >
      <defs>
        <linearGradient id={`o${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
        <linearGradient id={`i${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor={core} />
        </linearGradient>
      </defs>
      <path d={FLAME_OUTER} fill={`url(#o${id})`} />
      <path className="flame-core" d={FLAME_INNER} fill={`url(#i${id})`} />
    </svg>
  )
}

/* ---------- конфетти ---------- */
const CONFETTI = ['#ff9f1c', '#fb5607', '#6366f1', '#22c55e', '#ff5d8f', '#ffd166', '#38bdf8']
export function Confetti({ count = 60 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        dur: 1.8 + Math.random() * 1.6,
        drift: (Math.random() - 0.5) * 160,
        rot: Math.random() * 720,
        color: CONFETTI[i % CONFETTI.length],
        w: 6 + Math.random() * 6,
        round: Math.random() < 0.3,
      })),
    [count],
  )
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p, i) => (
        <i
          key={i}
          style={{
            left: `${p.left}%`,
            width: p.w,
            height: p.round ? p.w : p.w * 1.8,
            background: p.color,
            borderRadius: p.round ? '50%' : 2,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            ['--drift' as string]: `${p.drift}px`,
            ['--rot' as string]: `${p.rot}deg`,
          }}
        />
      ))}
    </div>
  )
}

/* ---------- звуки (WebAudio, без файлов) и вибрация ---------- */
let ctx: AudioContext | null = null
let soundOn = true
export const setSoundOn = (v: boolean) => (soundOn = v)

function tone(freqs: number[], step = 0.09, type: OscillatorType = 'sine', vol = 0.12) {
  if (!soundOn) return
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const t0 = ctx.currentTime
    freqs.forEach((f, i) => {
      const o = ctx!.createOscillator()
      const g = ctx!.createGain()
      o.type = type
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t0 + i * step)
      g.gain.exponentialRampToValueAtTime(vol, t0 + i * step + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * step + step * 1.8)
      o.connect(g).connect(ctx!.destination)
      o.start(t0 + i * step)
      o.stop(t0 + i * step + step * 2)
    })
  } catch {
    /* звук не поддерживается */
  }
}
const vibrate = (p: number | number[]) => {
  try { navigator.vibrate?.(p) } catch { /* ignore */ }
}
export const sfx = {
  correct: () => { tone([660, 880]); vibrate(15) },
  combo: () => { tone([660, 880, 1175], 0.07); vibrate([15, 30, 15]) },
  wrong: () => { tone([220, 180], 0.11, 'triangle', 0.1); vibrate(60) },
  streak: () => { tone([523, 659, 784, 1047], 0.11, 'triangle'); vibrate([30, 40, 30, 40, 80]) },
  chest: () => { tone([392, 523, 659, 784, 1047, 1319], 0.07, 'triangle'); vibrate([20, 30, 20, 30, 120]) },
  tap: () => tone([520], 0.05, 'sine', 0.05),
}
