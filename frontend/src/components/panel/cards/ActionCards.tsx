import { useState, useEffect, useCallback, memo } from 'react'
import type { HaState } from '../../../context/HaContext'
import { useTh, useRestCall, useCardSize, tc1, tc2 } from '../PanelContext'
import { IconTile } from '../ui/IconTile'
import { FancySlider } from '../ui/FancySlider'

// ─── Button Tile ──────────────────────────────────────────────────────────────

export const ButtonTile = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const th = useTh()
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const icon = String(s.attributes.icon ?? '▶️')
  const domain = s.entity_id.split('.')[0]
  const [pressed, setPressed] = useState(false)

  const press = useCallback(() => {
    const svc = domain === 'script' ? 'turn_on' : 'press'
    callService(domain, svc, {}, s.entity_id)
    setPressed(true)
    setTimeout(() => setPressed(false), 700)
  }, [domain, s.entity_id, callService])

  return (
    <IconTile
      icon={
        <span style={{
          fontSize: 32,
          filter: pressed ? 'drop-shadow(0 0 10px rgba(10,132,255,0.85))' : 'none',
          transform: pressed ? 'scale(1.15)' : 'scale(1)',
          transition: 'all 0.2s', display: 'inline-block',
        }}>{icon}</span>
      }
      name={name}
      active={pressed}
      th={th}
      glowColor={pressed ? 'rgb(10,132,255)' : undefined}
      onClick={press}
      sub={
        <span style={{
          fontSize: 10, fontWeight: 700,
          color: pressed ? 'rgb(10,132,255)' : tc2(th),
          background: pressed ? 'rgba(10,132,255,0.15)' : 'rgba(128,128,128,0.12)',
          borderRadius: 6, padding: '1px 8px',
        }}>
          {pressed ? '✓ Done' : '▶ Press'}
        </span>
      }
    />
  )
})

// ─── Number Tile ──────────────────────────────────────────────────────────────

const TILE_H: Record<string, number> = { sm: 80, md: 92, lg: 110, xl: 130 }

export const NumberTile = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const th = useTh()
  const size = useCardSize()
  const name = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const min  = Number(s.attributes.min ?? 0)
  const max  = Number(s.attributes.max ?? 100)
  const step = Number(s.attributes.step ?? 1)
  const unit = String(s.attributes.unit_of_measurement ?? '')
  const value = Number(s.state)

  const [localVal, setLocalVal] = useState(value)
  const [dragging, setDragging] = useState(false)
  useEffect(() => { if (!dragging) setLocalVal(value) }, [value, dragging])

  const displayVal = dragging ? localVal : value
  const displayPct = max > min ? Math.round(((displayVal - min) / (max - min)) * 100) : 0

  const applyPct = useCallback((pct: number) => {
    const raw     = min + (pct / 100) * (max - min)
    const stepped = Math.round(raw / step) * step
    const clamped = Math.min(max, Math.max(min, Math.round(stepped * 10) / 10))
    setLocalVal(clamped)
    callService('number', 'set_value', { value: clamped }, s.entity_id)
  }, [min, max, step, s.entity_id, callService])

  return (
    <div style={{
      border: `1px solid ${th === 'day' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.10)'}`,
      borderRadius: 18,
      background: th === 'day' ? 'rgba(210,222,242,0.38)' : 'rgba(255,255,255,0.06)',
      backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
      boxShadow: `inset 0 1px 0 ${th === 'day' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.06)'}`,
      padding: '10px 8px 8px', width: '100%', minHeight: TILE_H[size] ?? 92,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: tc2(th), textAlign: 'center', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 4px' }}>
        {name}
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: tc1(th) }}>{displayVal}<span style={{ fontSize: 13, fontWeight: 500, marginLeft: 2 }}>{unit}</span></span>
      </div>
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', fontSize: 9, color: tc2(th), opacity: 0.6, padding: '0 2px' }}>
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
      <div style={{ width: '100%' }}>
        <FancySlider
          value={displayPct}
          color='rgb(10,132,255)'
          onChange={pct => { setDragging(true); applyPct(pct); setTimeout(() => setDragging(false), 300) }}
        />
      </div>
    </div>
  )
})

// ─── Select Tile ──────────────────────────────────────────────────────────────

export const SelectTile = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const th = useTh()
  const name    = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const options: string[] = (s.attributes.options as string[]) ?? []
  const current = String(s.state)
  const idx     = options.indexOf(current)

  const cycle = useCallback(() => {
    if (!options.length) return
    const next = options[(idx + 1) % options.length]
    callService('select', 'select_option', { option: next }, s.entity_id)
  }, [idx, options, s.entity_id, callService])

  return (
    <IconTile
      icon={<span style={{ fontSize: 26, display: 'inline-block' }}>☰</span>}
      name={name}
      active={false}
      th={th}
      onClick={cycle}
      sub={
        <span style={{
          fontSize: 10, fontWeight: 600,
          color: tc2(th),
          background: 'rgba(128,128,128,0.12)',
          borderRadius: 6, padding: '1px 8px',
          maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          display: 'block', textAlign: 'center',
        }}>
          {current || '—'}
        </span>
      }
    />
  )
})
