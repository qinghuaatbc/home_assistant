import { useState, useEffect, useRef } from 'react'
import { useTh } from '../PanelContext'

export interface FancySliderProps {
  value: number; min?: number; max?: number
  onChange: (v: number) => void
  color: string; unit?: string
}

export function FancySlider({ value, min = 0, max = 100, onChange, color, unit = '%' }: FancySliderProps) {
  const th = useTh()
  const [dragging, setDragging] = useState(false)
  const [local, setLocal] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!dragging) setLocal(value) }, [value, dragging])

  const pct = Math.round(((local - min) / (max - min)) * 100)
  const inactive = th === 'day' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)'
  const trackBg = `linear-gradient(to right,${color} ${pct}%,${inactive} ${pct}%)`

  useEffect(() => {
    if (ref.current) ref.current.style.background = trackBg
  }, [trackBg])

  return (
    <div
      style={{ position: 'relative', paddingTop: dragging ? 22 : 0, transition: 'padding 0.1s' }}
      onTouchStart={e => e.stopPropagation()}
      onTouchMove={e => e.stopPropagation()}
      onTouchEnd={e => e.stopPropagation()}
    >
      {dragging && (
        <div style={{
          position: 'absolute', top: 0,
          left: `clamp(14px, calc(${pct}% - 0px), calc(100% - 18px))`,
          transform: 'translateX(-50%)',
          background: color, color: '#fff',
          borderRadius: 6, padding: '2px 7px', fontSize: 11, fontWeight: 700,
          pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap',
        }}>{local}{unit}</div>
      )}
      <input
        ref={ref} type="range" min={min} max={max} value={local}
        className="rti-slider"
        onChange={e => setLocal(Number(e.target.value))}
        onPointerDown={e => { e.stopPropagation(); setDragging(true) }}
        onPointerUp={e => { e.stopPropagation(); setDragging(false); onChange(Number((e.target as HTMLInputElement).value)) }}
        onClick={e => e.stopPropagation()}
        style={{ width: '100%' }}
      />
    </div>
  )
}
