import { FLAME_COLORS, FLAME_INNER, FLAME_OUTER } from './ui'

/* Карточка «мой огонёк» 1080×1920 для сторис (Telegram / Instagram / TikTok) */
export async function makeStreakCard(opts: { name: string; streak: number; tier: string; tierLabel: string; friends: number; url: string }): Promise<Blob> {
  const W = 1080, H = 1920
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  await document.fonts?.ready

  // фон
  const bg = g.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#1b1036')
  bg.addColorStop(0.55, '#2a1240')
  bg.addColorStop(1, '#5a1e0e')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  // свечение
  const [top, bottom, core] = FLAME_COLORS[opts.tier] ?? FLAME_COLORS['tier-fire']
  const glow = g.createRadialGradient(W / 2, 760, 50, W / 2, 760, 620)
  glow.addColorStop(0, bottom + 'aa')
  glow.addColorStop(1, 'transparent')
  g.fillStyle = glow
  g.fillRect(0, 0, W, H)

  // огонёк из тех же SVG-путей
  g.save()
  const scale = 9
  g.translate(W / 2 - 32 * scale, 380)
  g.scale(scale, scale)
  const og = g.createLinearGradient(0, 0, 0, 80)
  og.addColorStop(0, top)
  og.addColorStop(1, bottom)
  g.fillStyle = og
  g.fill(new Path2D(FLAME_OUTER))
  const ig = g.createLinearGradient(0, 36, 0, 78)
  ig.addColorStop(0, '#ffffff')
  ig.addColorStop(1, core)
  g.fillStyle = ig
  g.fill(new Path2D(FLAME_INNER))
  g.restore()

  const font = (w: number, s: number) => `${w} ${s}px Nunito, system-ui, sans-serif`
  // текст, который ужимается, чтобы влезть по ширине
  const fit = (text: string, weight: number, size: number, y: number, maxW = W - 120) => {
    let sz = size
    g.font = font(weight, sz)
    while (g.measureText(text).width > maxW && sz > 20) g.font = font(weight, --sz)
    g.fillText(text, W / 2, y)
  }
  g.textAlign = 'center'
  g.fillStyle = '#fff'
  g.font = font(900, 300)
  g.fillText(String(opts.streak), W / 2, 1420)
  g.font = font(800, 72)
  g.fillStyle = top
  const n = opts.streak % 100, n1 = n % 10
  const word = n1 === 1 && n !== 11 ? 'день' : n1 >= 2 && n1 <= 4 && (n < 12 || n > 14) ? 'дня' : 'дней'
  g.fillText(`${word} подряд`, W / 2, 1520)
  g.fillStyle = 'rgba(255,255,255,.85)'
  fit(`${opts.name} · уровень «${opts.tierLabel}»`, 700, 52, 1610)
  if (opts.friends) {
    g.fillStyle = 'rgba(255,255,255,.6)'
    fit(`держит общий огонёк с ${opts.friends} ${opts.friends === 1 ? 'другом' : 'друзьями'}`, 700, 40, 1670)
  }

  // плашка бренда
  g.fillStyle = 'rgba(255,255,255,.1)'
  roundRect(g, 140, 120, W - 280, 120, 60)
  g.fill()
  g.fillStyle = '#fff'
  g.font = font(900, 56)
  g.fillText('AkylFlow', W / 2, 200)

  g.font = font(700, 40)
  g.fillStyle = 'rgba(255,255,255,.7)'
  g.fillText('Учусь каждый день. Сможешь обогнать?', W / 2, 1760)
  g.fillStyle = top
  fit(opts.url.replace(/^https?:\/\//, '').replace(/\?.*$/, ''), 800, 40, 1830)

  return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'))
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/* поделиться файлом, если браузер умеет; иначе скачать */
export async function shareOrDownload(blob: Blob, text: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], 'akylflow-streak.png', { type: 'image/png' })
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text })
      return 'shared'
    }
  } catch {
    return 'cancelled'
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  return 'downloaded'
}
