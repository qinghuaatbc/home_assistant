import React from 'react'

// ─── Animated theme layers ────────────────────────────────────────────────────

export function AuroraLayer() {
  return (
    <>
      <div className="rti-aurora-bg" />
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 28% 55%, rgba(0,255,130,0.16) 0%, transparent 52%), radial-gradient(ellipse at 72% 38%, rgba(100,50,255,0.13) 0%, transparent 52%)',
        animation: 'auroraGlow 7s ease-in-out infinite alternate',
      }} />
    </>
  )
}

const STAR_DATA = Array.from({ length: 90 }, (_, i) => ({
  left: `${((i * 137.508) % 100).toFixed(2)}%`,
  top:  `${((i * 98.76)  % 100).toFixed(2)}%`,
  size: `${((i % 3) === 0 ? 2.4 : (i % 3) === 1 ? 1.6 : 1.0).toFixed(1)}px`,
  dur:  `${((i * 0.37) % 2.5 + 1.2).toFixed(2)}s`,
  del:  `${((i * 0.23) % 4).toFixed(2)}s`,
  hue:  (i * 43) % 360,
}))

export function StarField() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {STAR_DATA.map((s, i) => (
        <div key={i} style={{
          position: 'absolute', left: s.left, top: s.top,
          width: s.size, height: s.size, borderRadius: '50%',
          background: `hsl(${s.hue},70%,92%)`,
          animation: `twinkle ${s.dur} ${s.del} ease-in-out infinite`,
        }} />
      ))}
    </div>
  )
}

const DAY_PARTICLES = Array.from({ length: 28 }, (_, i) => ({
  left: `${((i * 137.5) % 100).toFixed(1)}%`,
  size: `${((i % 4) === 0 ? 32 : (i % 4) === 1 ? 22 : (i % 4) === 2 ? 14 : 8).toFixed(0)}px`,
  dur:  `${((i * 0.41) % 8 + 7).toFixed(1)}s`,
  del:  `${((i * 0.29) % 10).toFixed(1)}s`,
  hue:  200 + (i * 15) % 60,
}))

export function DayParticles() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {DAY_PARTICLES.map((p, i) => (
        <div key={i} style={{
          position: 'absolute', bottom: '-5%', left: p.left,
          width: p.size, height: p.size, borderRadius: '50%',
          background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.85), hsl(${p.hue},65%,80%,0.55))`,
          backdropFilter: 'blur(3px)',
          border: '1px solid rgba(255,255,255,0.75)',
          boxShadow: `0 2px 8px hsl(${p.hue},50%,70%,0.25)`,
          animation: `floatUp ${p.dur} ${p.del} ease-in-out infinite`,
        }} />
      ))}
    </div>
  )
}

const DARK_EMBERS = Array.from({ length: 28 }, (_, i) => ({
  left:  `${((i * 137.5) % 100).toFixed(1)}%`,
  size:  `${((i % 3) === 0 ? 4 : (i % 3) === 1 ? 3 : 2).toFixed(0)}px`,
  dur:   `${((i * 0.38) % 7 + 6).toFixed(1)}s`,
  del:   `${((i * 0.27) % 12).toFixed(1)}s`,
  ex:    `${((i * 23) % 80) - 40}px`,
  hue:   (i * 40) % 360,
}))

export function DarkEmbers() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {DARK_EMBERS.map((e, i) => (
        <div key={i} style={{
          position: 'absolute', bottom: '8%', left: e.left,
          width: e.size, height: e.size, borderRadius: '50%',
          background: `hsl(${e.hue},90%,65%)`,
          boxShadow: `0 0 6px 2px hsl(${e.hue},90%,55%)`,
          ['--ex' as any]: e.ex,
          animation: `emberFloat ${e.dur} ${e.del} ease-in-out infinite`,
        }} />
      ))}
    </div>
  )
}

const FW_CENTERS = [
  { x: 18, y: 28, hue: 5,   delay: 0   },
  { x: 78, y: 22, hue: 55,  delay: 1.2 },
  { x: 48, y: 18, hue: 270, delay: 2.4 },
  { x: 12, y: 62, hue: 175, delay: 3.6 },
  { x: 84, y: 58, hue: 120, delay: 0.8 },
  { x: 55, y: 72, hue: 320, delay: 2.0 },
]
const FW_SPARKS = 14

export function FireworksField() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {FW_CENTERS.map((c, ci) => (
        <div key={ci} style={{ position: 'absolute', left: `${c.x}%`, top: `${c.y}%` }}>
          <div style={{
            position: 'absolute', width: 10, height: 10, borderRadius: '50%',
            background: `hsl(${c.hue},100%,72%)`,
            boxShadow: `0 0 14px 5px hsl(${c.hue},100%,60%)`,
            animation: `fwFlash 3.2s ${c.delay}s ease-out infinite`,
          }} />
          {Array.from({ length: FW_SPARKS }, (_, si) => {
            const angle = (si / FW_SPARKS) * 360
            const sparkHue = c.hue + si * 10
            return (
              <div key={si} style={{
                position: 'absolute', width: 4, height: 4, borderRadius: '50%',
                background: `hsl(${sparkHue},100%,68%)`,
                boxShadow: `0 0 5px 2px hsl(${sparkHue},100%,55%)`,
                ['--fw-a' as any]: `${angle}deg`,
                animation: `fwSpark 3.2s ${c.delay + 0.05}s ease-out infinite`,
              }} />
            )
          })}
        </div>
      ))}
    </div>
  )
}
