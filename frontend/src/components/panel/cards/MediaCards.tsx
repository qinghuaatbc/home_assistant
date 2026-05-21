import { useState, useEffect, useCallback, memo, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { HaState } from '../../../context/HaContext'
import { useT, useTh, useSound, useRestCall, tc1, tc2 } from '../PanelContext'
import { FancySlider } from '../ui/FancySlider'

// ─── EQ Bars ───────────────────────────────────────────────────────────────────

export function EqBars({ active }: { active: boolean }) {
  const defs = [{ a: 'eqA', d: '0.55s' }, { a: 'eqB', d: '0.42s' }, { a: 'eqC', d: '0.68s' }, { a: 'eqD', d: '0.38s' }]
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 18, marginLeft: 4, flexShrink: 0 }}>
      {defs.map((d, i) => (
        <div key={i} style={{
          width: 3, alignSelf: 'flex-end', borderRadius: 2,
          background: active ? '#4d8fff' : 'rgba(128,128,128,0.3)',
          animation: active ? `${d.a} ${d.d} ease-in-out infinite alternate` : 'none',
          height: active ? undefined : 3, transition: 'background 0.3s',
        }} />
      ))}
    </div>
  )
}

// ─── Speaker fallback ─────────────────────────────────────────────────────────

export function SpeakerImg({ powered, playing, volume }: { powered: boolean; playing: boolean; volume: number }) {
  const v = volume / 100
  const glow = Math.round(10 + v * 26)
  const period = (0.28 + (1 - v) * 0.92).toFixed(2)   // 0.28s (100%) → 1.2s (0%)
  const scale  = (1.10 + v * 0.18).toFixed(3)           // 1.10 (0%) → 1.28 (100%)
  const filter = !powered
    ? 'grayscale(1) brightness(0.28) opacity(0.55)'
    : playing
      ? `drop-shadow(0 0 ${glow}px rgba(77,143,255,${0.4 + v * 0.5})) brightness(${1 + v * 0.28})`
      : `drop-shadow(0 0 ${Math.round(4 + v * 10)}px rgba(77,143,255,${0.1 + v * 0.3})) brightness(0.95)`
  const hasVol = powered && playing && v > 0.02
  return (
    <div style={{
      '--sp-scale': scale,
      animation: hasVol ? `speakerPulse ${period}s ease-in-out infinite` : 'none',
      display: 'inline-flex', width: 64, height: 64, alignItems: 'center', justifyContent: 'center',
    } as React.CSSProperties}>
      <img src="/speaker.png" style={{ width: 64, height: 64, objectFit: 'contain', filter, transition: 'filter 0.4s' }} />
    </div>
  )
}

// ─── Playback control button ───────────────────────────────────────────────────

function CtrlBtn({ icon, onTap, size = 20 }: { icon: string; onTap: () => void; size?: number }) {
  return (
    <button
      onPointerDown={e => { e.stopPropagation(); e.preventDefault() }}
      onClick={e => { e.stopPropagation(); onTap() }}
      style={{
        background: 'rgba(77,143,255,0.15)', border: 'none', borderRadius: 8,
        width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', fontSize: size, color: '#4d8fff', flexShrink: 0,
        transition: 'background 0.15s',
      }}
    >
      {icon}
    </button>
  )
}

// ─── Media Card (tile style) ──────────────────────────────────────────────────

export const MediaRtiCard = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const th = useTh(); const sound = useSound()
  const playing  = s.state === 'playing'
  const powered  = s.state !== 'off' && s.state !== 'unavailable'
  const vol      = Math.round(Number(s.attributes.volume_level ?? 0) * 100)
  const name     = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const title    = String(s.attributes.media_title ?? '')
  const artist   = String(s.attributes.media_artist ?? '')
  const sources: string[] = (s.attributes.source_list as string[]) ?? []
  const source   = String(s.attributes.source ?? '')
  const entityPicture = s.attributes.entity_picture as string | undefined
  const sf       = Number(s.attributes.supported_features ?? 0)
  const hasPrev  = !!(sf & 16)
  const hasNext  = !!(sf & 32)
  const hasPlay  = powered && (!sf || !!(sf & (1 | 16384)))  // show if no feature info or explicitly supported
  const v        = vol / 100

  const call = useCallback((svc: string, data: Record<string, unknown> = {}) => {
    callService('media_player', svc, data, s.entity_id)
  }, [s.entity_id, callService])

  const dragRef = useRef<{ startY: number; startVol: number; moved: boolean; lastCall: number } | null>(null)
  const [dragging, setDragging]   = useState(false)
  const [localVol, setLocalVol]   = useState(vol)
  const [showSources, setShowSources] = useState(false)
  const sourceButtonRef = useRef<HTMLButtonElement>(null)
  const [sourceRect, setSourceRect] = useState<DOMRect | null>(null)
  useEffect(() => { if (!dragging) setLocalVol(vol) }, [vol, dragging])

  const displayVol = dragging ? localVol : vol
  const bg = powered
    ? th === 'day'
      ? `linear-gradient(to top, rgba(77,143,255,0.40) 0%, rgba(77,143,255,0.18) ${displayVol}%, rgba(210,222,242,0.38) 100%)`
      : `linear-gradient(to top, rgba(77,143,255,0.35) 0%, rgba(77,143,255,0.14) ${displayVol}%, rgba(255,255,255,0.05) 100%)`
    : th === 'day' ? 'rgba(210,222,242,0.38)' : 'rgba(255,255,255,0.06)'

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startY: e.clientY, startVol: displayVol, moved: false, lastCall: 0 }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const delta = dragRef.current.startY - e.clientY
    if (Math.abs(delta) > 6) dragRef.current.moved = true
    if (!dragRef.current.moved) return
    setDragging(true)
    const nv = Math.min(100, Math.max(0, Math.round(dragRef.current.startVol + delta / 1.8)))
    setLocalVol(nv)
    const now = Date.now()
    if (now - dragRef.current.lastCall > 80) {
      dragRef.current.lastCall = now
      call('volume_set', { volume_level: nv / 100 })
    }
  }
  const onPointerUp = () => {
    if (!dragRef.current) return
    if (!dragRef.current.moved) {
      call(powered ? 'turn_off' : 'turn_on')
      sound('media', !powered, name)
    } else {
      call('volume_set', { volume_level: localVol / 100 })
    }
    dragRef.current = null
    setDragging(false)
  }

  const albumArt = entityPicture && powered

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onTouchStart={e => e.stopPropagation()}
      onTouchMove={e => e.stopPropagation()}
      onTouchEnd={e => e.stopPropagation()}
      style={{
        border: powered ? '1px solid rgba(77,143,255,0.55)' : `1px solid ${th === 'day' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.10)'}`,
        borderRadius: 18, background: bg,
        backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        boxShadow: playing
          ? `0 4px 22px rgba(77,143,255,${0.25 + v * 0.25}), inset 0 1px 0 rgba(255,255,255,0.30)`
          : `inset 0 1px 0 ${th === 'day' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.06)'}`,
        padding: '10px 8px 8px', width: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        cursor: dragging ? 'ns-resize' : 'pointer',
        userSelect: 'none', touchAction: 'none', position: 'relative',
        transition: dragging ? 'none' : 'all 0.22s',
        overflow: 'hidden',
      }}
    >
      {dragging && <div style={{ position: 'absolute', inset: 0, borderRadius: 18, border: '2px solid rgba(77,143,255,0.7)', pointerEvents: 'none' }} />}

      {/* Album art background blur */}
      {albumArt && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 18, overflow: 'hidden', pointerEvents: 'none',
          backgroundImage: `url(${entityPicture})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
          opacity: 0.15, filter: 'blur(8px)',
        }} />
      )}

      {/* Art thumbnail or speaker */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {albumArt ? (
          <img src={entityPicture} style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', display: 'block', boxShadow: '0 4px 14px rgba(0,0,0,0.4)' }} />
        ) : (
          <SpeakerImg powered={powered} playing={playing} volume={displayVol} />
        )}
        {playing && albumArt && (
          <div style={{ position: 'absolute', bottom: -4, right: -4, background: 'rgba(77,143,255,0.9)', borderRadius: 8, padding: '2px 4px' }}>
            <EqBars active={true} />
          </div>
        )}
      </div>

      {/* Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', justifyContent: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: powered ? 'rgb(77,143,255)' : tc2(th), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '90%' }}>{name}</div>
        {playing && !albumArt && <EqBars active={true} />}
      </div>

      {/* Track info */}
      {powered && (title || artist) && (
        <div style={{ width: '100%', textAlign: 'center' }}>
          {title && <div style={{ fontSize: 10, color: playing ? 'rgb(110,170,255)' : tc2(th), overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontWeight: 600 }}>♪ {title}</div>}
          {artist && <div style={{ fontSize: 9, color: tc2(th), overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginTop: 1 }}>{artist}</div>}
        </div>
      )}

      {/* Playback controls */}
      {powered && (hasPrev || hasPlay || hasNext) && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onPointerDown={e => e.stopPropagation()}>
          {hasPrev && <CtrlBtn icon="⏮" onTap={() => call('media_previous_track')} size={14} />}
          {hasPlay && (
            <CtrlBtn
              icon={playing ? '⏸' : '▶'}
              onTap={() => call('media_play_pause')}
              size={16}
            />
          )}
          {hasNext && <CtrlBtn icon="⏭" onTap={() => call('media_next_track')} size={14} />}
        </div>
      )}

      {/* Volume */}
      <div style={{ fontSize: 10, fontWeight: 700, color: powered ? 'rgb(77,143,255)' : tc2(th), opacity: powered ? 1 : 0.4 }}>
        {powered ? `${displayVol}%` : '—'}
      </div>

      {/* Volume slider */}
      <div style={{ width: '100%' }} onPointerDown={e => e.stopPropagation()}>
        {powered
          ? <FancySlider value={displayVol} color="rgb(77,143,255)" onChange={nv => { setLocalVol(nv); call('volume_set', { volume_level: nv / 100 }) }} />
          : <div style={{ height: 10, borderRadius: 8, background: th === 'day' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)' }} />
        }
      </div>

      {/* Source selector — portal dropdown to avoid grid clipping */}
      {sources.length > 0 && powered && (
        <div style={{ width: '100%' }} onPointerDown={e => e.stopPropagation()}>
          <button
            ref={sourceButtonRef}
            onClick={e => {
              e.stopPropagation()
              const rect = sourceButtonRef.current?.getBoundingClientRect() ?? null
              setSourceRect(rect)
              setShowSources(v => !v)
            }}
            style={{
              width: '100%', background: th === 'day' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
              border: `1px solid ${th === 'day' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)'}`,
              borderRadius: 8, color: tc1(th), fontSize: 10, padding: '4px 8px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
              {source || '— source —'}
            </span>
            <span style={{ opacity: 0.5, flexShrink: 0 }}>{showSources ? '▲' : '▼'}</span>
          </button>
          {showSources && sourceRect && createPortal(
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 9000 }} onClick={() => setShowSources(false)} />
              <div style={{
                position: 'fixed',
                left: sourceRect.left, right: `calc(100vw - ${sourceRect.right}px)`,
                bottom: `calc(100vh - ${sourceRect.top}px + 4px)`,
                zIndex: 9001,
                background: th === 'day' ? 'rgba(255,255,255,0.96)' : 'rgba(20,22,35,0.96)',
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                border: `1px solid ${th === 'day' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)'}`,
                borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                maxHeight: 200, overflowY: 'auto',
              }}>
                {sources.map(src => (
                  <button key={src}
                    onClick={e => { e.stopPropagation(); call('select_source', { source: src }); setShowSources(false) }}
                    style={{
                      width: '100%', padding: '7px 12px', border: 'none', cursor: 'pointer', textAlign: 'left',
                      background: src === source ? 'rgba(77,143,255,0.18)' : 'transparent',
                      color: src === source ? 'rgb(77,143,255)' : tc1(th), fontSize: 11, fontWeight: src === source ? 700 : 400,
                      borderBottom: `1px solid ${th === 'day' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}`,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    {src === source && <span>✓</span>}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{src}</span>
                  </button>
                ))}
              </div>
            </>,
            document.body
          )}
        </div>
      )}
    </div>
  )
})

// ─── Media Player Ring Card (card_type: media-player-ring) ───────────────────

const SR_S = 160; const SR_CX = 80; const SR_CY = 80
const SR_R_OUT = 72; const SR_R_ARC = 64; const SR_R_FACE = 54
const SR_START = 135; const SR_SPAN = 270

function srPolar(angle: number, r: number): [number, number] {
  const a = angle * Math.PI / 180
  return [SR_CX + r * Math.cos(a), SR_CY + r * Math.sin(a)]
}
function srArc(startAngle: number, spanDeg: number, r: number): string {
  if (spanDeg <= 0) return ''
  const clipped = Math.min(spanDeg, SR_SPAN - 0.1)
  const [sx, sy] = srPolar(startAngle, r)
  const [ex, ey] = srPolar(startAngle + clipped, r)
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r} ${r} 0 ${clipped > 180 ? 1 : 0} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`
}
function srAngleToProgress(raw: number): number {
  if (raw >= SR_START) return Math.min((raw - SR_START) / SR_SPAN, 1)
  if (raw <= SR_START - 360 + SR_SPAN) return Math.min((raw + 360 - SR_START) / SR_SPAN, 1)
  return raw <= 90 ? 1 : 0
}
function playSpeakerTick(ctx: AudioContext) {
  const now = ctx.currentTime, sr = ctx.sampleRate
  const nLen = Math.floor(sr * 0.002)
  const nBuf = ctx.createBuffer(1, nLen, sr)
  const nd = nBuf.getChannelData(0)
  for (let i = 0; i < nLen; i++) nd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.0003))
  const nSrc = ctx.createBufferSource(); nSrc.buffer = nBuf
  const nG = ctx.createGain(); nG.gain.value = 0.14
  nSrc.connect(nG); nG.connect(ctx.destination); nSrc.start(now)
  const tLen = Math.floor(sr * 0.018)
  const tBuf = ctx.createBuffer(1, tLen, sr)
  const td = tBuf.getChannelData(0)
  for (let i = 0; i < tLen; i++) td[i] = Math.sin(2 * Math.PI * 2200 * i / sr) * Math.exp(-i / (sr * 0.004))
  const tSrc = ctx.createBufferSource(); tSrc.buffer = tBuf
  const tG = ctx.createGain(); tG.gain.value = 0.06
  tSrc.connect(tG); tG.connect(ctx.destination); tSrc.start(now)
}

export const MediaRingCard = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const th = useTh()
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const didDrag = useRef(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const lastTickVol = useRef<number | null>(null)

  const playing = s.state === 'playing'
  const active  = s.state !== 'off' && s.state !== 'unavailable'
  const muted   = Boolean(s.attributes.is_volume_muted)
  const volPct  = Math.round(Number(s.attributes.volume_level ?? 0) * 100)
  const name    = String(s.attributes.friendly_name ?? s.entity_id.split('.')[1].replace(/_/g, ' '))
  const title   = String(s.attributes.media_title ?? '')

  const [localVol, setLocalVol] = useState(volPct)
  useEffect(() => { if (!dragging.current) setLocalVol(volPct) }, [volPct])

  const displayVol = dragging.current ? localVol : volPct
  const displayActive = active || (dragging.current && localVol > 0)
  const v = displayVol / 100

  // Cool blue-cyan palette
  const arcR = Math.round(40  + v * 80)   // 40→120
  const arcG = Math.round(120 + v * 80)   // 120→200
  const arcColor  = displayActive && !muted ? `rgb(${arcR},${arcG},255)` : (th === 'day' ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.28)')
  const glowColor = `rgba(${arcR},${arcG},255,${0.12 + v * 0.55})`

  const getProgress = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return displayVol / 100
    const rect = svgRef.current.getBoundingClientRect()
    const scale = rect.width / SR_S
    const raw = ((Math.atan2(
      e.clientY - rect.top  - SR_CY * scale,
      e.clientX - rect.left - SR_CX * scale
    ) * 180 / Math.PI) + 360) % 360
    return srAngleToProgress(raw)
  }, [displayVol])

  const isDay = th === 'day'
  const faceColor = displayActive
    ? isDay ? `rgba(${arcR},${arcG},255,0.14)` : `rgba(${arcR},${arcG},255,0.20)`
    : isDay ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)'
  const trackColor = isDay ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.22)'
  const [thumbX, thumbY] = srPolar(SR_START + v * SR_SPAN, SR_R_ARC)
  const stopTouch = (e: React.TouchEvent) => e.stopPropagation()

  return (
    <div onTouchStart={stopTouch} onTouchMove={stopTouch} onTouchEnd={stopTouch}
      style={{
        border: displayActive ? `1px solid rgba(${arcR},${arcG},255,0.35)` : `1px solid ${isDay ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.22)'}`,
        borderRadius: 18,
        background: isDay
          ? (displayActive ? `rgba(${arcR},${arcG},255,0.06)` : 'rgba(255,255,255,0.85)')
          : (displayActive ? `rgba(${arcR},${arcG},255,0.09)` : 'rgba(255,255,255,0.10)'),
        boxShadow: displayActive ? `0 4px 24px ${glowColor}` : (isDay ? '0 2px 10px rgba(0,0,0,0.07)' : 'none'),
        padding: '10px 6px 10px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        cursor: 'pointer', userSelect: 'none', touchAction: 'none',
        transition: 'all 0.3s',
      }}>
      <svg ref={svgRef} viewBox={`0 0 ${SR_S} ${SR_S}`}
        style={{ width: '100%', height: 'auto', aspectRatio: '1', touchAction: 'none', userSelect: 'none', overflow: 'visible' }}
        onPointerDown={e => {
          e.stopPropagation(); dragging.current = true; didDrag.current = false
          svgRef.current?.setPointerCapture(e.pointerId)
          if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
          lastTickVol.current = null
        }}
        onPointerMove={e => {
          if (!dragging.current) return; e.stopPropagation(); didDrag.current = true
          const prog = getProgress(e)
          const newVol = Math.round(prog * 100)
          setLocalVol(newVol)
          if (lastTickVol.current === null || Math.abs(newVol - lastTickVol.current) >= 4) {
            lastTickVol.current = newVol
            if (audioCtxRef.current) audioCtxRef.current.resume().then(() => playSpeakerTick(audioCtxRef.current!))
          }
          callService('media_player', 'volume_set', { volume_level: prog }, s.entity_id)
        }}
        onPointerUp={e => {
          e.stopPropagation()
          if (!dragging.current) return
          dragging.current = false
          if (!didDrag.current) {
            // tap = play/pause toggle
            if (playing) callService('media_player', 'media_pause', {}, s.entity_id)
            else callService('media_player', active ? 'media_play' : 'turn_on', {}, s.entity_id)
          }
        }}
        onClick={e => e.stopPropagation()}>
        <defs>
          <radialGradient id={`srFace_${s.entity_id}`} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor={isDay ? '#fff' : '#333'} />
            <stop offset="100%" stopColor={isDay ? '#f0f0f0' : '#1a1a1a'} />
          </radialGradient>
          <filter id={`srGlow_${s.entity_id}`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <circle cx={SR_CX} cy={SR_CY} r={SR_R_OUT} fill={isDay ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'} />
        <path d={srArc(SR_START, SR_SPAN, SR_R_ARC)} fill="none" stroke={trackColor} strokeWidth={6} strokeLinecap="round" />
        {displayVol > 1 && (
          <path d={srArc(SR_START, v * SR_SPAN, SR_R_ARC)}
            fill="none" stroke={arcColor} strokeWidth={6} strokeLinecap="round"
            style={{ transition: dragging.current ? 'none' : 'stroke 0.4s' }} />
        )}

        {/* Thumb — red blink when playing */}
        {(displayActive || displayVol > 1) && (
          <circle cx={thumbX} cy={thumbY} r={11}
            fill={playing ? '#ff3b30' : (displayActive ? `rgb(${arcR},${arcG},255)` : '#888')}
            stroke="rgba(255,255,255,0.92)" strokeWidth={2.5}
            filter={`url(#srGlow_${s.entity_id})`}
            style={{ cursor: 'grab', transition: dragging.current ? 'none' : 'cx 0.15s, cy 0.15s' }}>
            {playing && (
              <animate attributeName="opacity" values="1;0.15;1" dur="1.1s" repeatCount="indefinite" />
            )}
          </circle>
        )}

        <circle cx={SR_CX} cy={SR_CY} r={SR_R_FACE}
          fill={displayActive ? faceColor : `url(#srFace_${s.entity_id})`}
          style={{ transition: dragging.current ? 'none' : 'fill 0.4s' }} />
        {displayActive && !muted && (
          <circle cx={SR_CX} cy={SR_CY} r={SR_R_FACE - 2}
            fill={`rgba(${arcR},${arcG},255,${(v * 0.35).toFixed(2)})`}
            filter={`url(#srGlow_${s.entity_id})`}
            style={{ transition: dragging.current ? 'none' : 'fill 0.4s' }} />
        )}
        {/* Speaker image — opacity + pulse animation follows volume */}
        <image href="/speaker.png"
          x={SR_CX - 24} y={SR_CY - 28} width={48} height={56}
          style={{
            opacity: displayActive && !muted ? Math.max(0.25, v) : 0.15,
            transition: dragging.current ? 'none' : 'opacity 0.4s',
            transformBox: 'fill-box',
            transformOrigin: 'center',
            '--sp-scale': (1.10 + v * 0.18).toFixed(3),
            animation: (displayActive && !muted && playing && !dragging.current)
              ? `speakerPulse ${(0.28 + (1 - v) * 0.92).toFixed(2)}s ease-in-out infinite`
              : 'none',
          } as React.CSSProperties} />
        {/* Blue glow over speaker when active */}
        <ellipse cx={SR_CX} cy={SR_CY} rx={16} ry={18}
          fill={`rgba(${arcR},${arcG},255,${((displayActive && !muted ? v : 0) * 0.70).toFixed(2)})`}
          filter={`url(#srGlow_${s.entity_id})`}
          style={{ pointerEvents: 'none', transition: dragging.current ? 'none' : 'fill 0.4s' }} />
      </svg>

      {/* Volume % */}
      <div style={{
        fontSize: 18, fontWeight: 300, textAlign: 'center', lineHeight: 1,
        color: displayActive ? (isDay ? `rgb(${arcR - 20},${arcG - 20},200)` : `rgb(${arcR},${arcG},255)`) : (isDay ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)'),
        fontFamily: "'Helvetica Neue', -apple-system, sans-serif",
        transition: 'color 0.4s',
      }}>{muted ? '🔇' : (displayActive ? `${displayVol}%` : '—')}</div>

      {/* Name / title */}
      <div style={{
        fontSize: 11, fontWeight: 600, textAlign: 'center',
        color: displayActive ? (isDay ? `rgb(${arcR - 20},${arcG - 20},180)` : `rgb(${arcR},${arcG},255)`) : (isDay ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)'),
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        width: '100%', padding: '0 4px', transition: 'color 0.4s',
      }}>{title || name}</div>
    </div>
  )
})
