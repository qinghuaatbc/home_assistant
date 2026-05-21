import { memo } from 'react'
import type { HaState } from '../../../context/HaContext'
import { useTh, useRestCall } from '../PanelContext'

const W = 300, H = 192
// Room perspective corners
const BX1 = 48, BY1 = 17, BX2 = 252, BY2 = 150

function TheaterSVG({ state }: { state: string }) {
  const playing = state === 'playing'
  const on      = state === 'playing' || state === 'paused'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', borderRadius: 10 }}>
      <defs>
        {/* Screen */}
        <linearGradient id="thScr" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%"   stopColor={playing ? '#080e1e' : '#060606'} />
          <stop offset="45%"  stopColor={playing ? '#0c1c3e' : '#090909'} />
          <stop offset="100%" stopColor={playing ? '#06101a' : '#060606'} />
        </linearGradient>
        {/* Projector beam */}
        <linearGradient id="thBeam" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="rgba(235,215,185,0.22)" />
          <stop offset="100%" stopColor="rgba(235,215,185,0.01)" />
        </linearGradient>
        {/* Room surfaces */}
        <linearGradient id="thCeil" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"  stopColor={on ? '#1a1a30' : '#6868a0'} />
          <stop offset="100%" stopColor={on ? '#101020' : '#50507e'} />
        </linearGradient>
        <linearGradient id="thFloor" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"  stopColor={on ? '#0e0e1c' : '#484870'} />
          <stop offset="100%" stopColor={on ? '#080810' : '#343458'} />
        </linearGradient>
        <linearGradient id="thWL" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"  stopColor={on ? '#101018' : '#505088'} />
          <stop offset="100%" stopColor={on ? '#16162a' : '#606098'} />
        </linearGradient>
        <linearGradient id="thWR" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"  stopColor={on ? '#16162a' : '#606098'} />
          <stop offset="100%" stopColor={on ? '#101018' : '#505088'} />
        </linearGradient>
        {/* Speaker driver */}
        <radialGradient id="thCone" cx="38%" cy="35%" r="65%">
          <stop offset="0%"   stopColor="#282838" />
          <stop offset="100%" stopColor="#0e0e18" />
        </radialGradient>
        {/* Speaker LED glow */}
        <radialGradient id="thSpkGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={on ? 'rgba(30,110,255,0.28)' : 'transparent'} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        {/* Projector lens glow */}
        <filter id="thGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        {/* Screen bloom */}
        <filter id="thBloom" x="-8%" y="-8%" width="116%" height="116%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* ── Room ── */}
      <polygon points={`0,0 ${W},0 ${BX2},${BY1} ${BX1},${BY1}`}          fill="url(#thCeil)" />
      <polygon points={`0,${H} ${W},${H} ${BX2},${BY2} ${BX1},${BY2}`}    fill="url(#thFloor)" />
      <polygon points={`0,0 ${BX1},${BY1} ${BX1},${BY2} 0,${H}`}          fill="url(#thWL)" />
      <polygon points={`${W},0 ${BX2},${BY1} ${BX2},${BY2} ${W},${H}`}    fill="url(#thWR)" />
      <rect x={BX1} y={BY1} width={BX2-BX1} height={BY2-BY1} fill={on ? '#0c0c1c' : '#1e1e3a'} />

      {/* Carpet runner */}
      <polygon points={`75,${H} 225,${H} ${BX2-22},${BY2} ${BX1+22},${BY2}`} fill={on ? 'rgba(38,18,58,0.45)' : 'rgba(80,40,120,0.55)'} />

      {/* Acoustic panels left */}
      {[13, 27].map(x => <rect key={x} x={x} y={36} width={9} height={78} rx={2} fill={on ? '#111124' : '#303060'} stroke={on ? '#1c1c30' : '#484880'} strokeWidth={0.5} />)}
      {/* Acoustic panels right */}
      {[264, 278].map(x => <rect key={x} x={x} y={36} width={9} height={78} rx={2} fill={on ? '#111124' : '#303060'} stroke={on ? '#1c1c30' : '#484880'} strokeWidth={0.5} />)}

      {/* Ceiling recessed lights */}
      {[80, 150, 220].map(cx => (
        <g key={cx}>
          <ellipse cx={cx} cy={3} rx={7} ry={2.5} fill="#101022" stroke="#1e1e34" strokeWidth={0.5} />
          {on && <ellipse cx={cx} cy={3} rx={4} ry={1.5} fill="rgba(255,245,210,0.09)" />}
        </g>
      ))}

      {/* ── Ambient standby lighting (always visible when off) ── */}
      {!on && (
        <>
          {/* Wall sconces left */}
          <rect x={2} y={70} width={10} height={5} rx={2} fill="#1a1a2e" />
          <ellipse cx={7} cy={70} rx={8} ry={14} fill="rgba(255,200,100,0.08)" />
          {/* Wall sconces right */}
          <rect x={288} y={70} width={10} height={5} rx={2} fill="#1a1a2e" />
          <ellipse cx={293} cy={70} rx={8} ry={14} fill="rgba(255,200,100,0.08)" />
          {/* Aisle LED strips along floor */}
          {[80,100,120,140,160,180,200,220].map(x => (
            <rect key={x} x={x} y={H-4} width={12} height={2} rx={1} fill="rgba(60,80,255,0.35)" />
          ))}
          {/* Exit sign top-right */}
          <rect x={270} y={18} width={22} height={9} rx={2} fill="rgba(180,0,0,0.7)" />
          <text x={281} y={25} textAnchor="middle" fontSize={5} fill="rgba(255,255,255,0.9)" fontWeight="bold">EXIT</text>
        </>
      )}

      {/* ── Screen bloom ── */}
      {playing && (
        <rect x={56} y={20} width={188} height={118} rx={2}
          fill="none" stroke="rgba(50,90,255,0.22)" strokeWidth={12}
          filter="url(#thBloom)" />
      )}

      {/* Screen frame */}
      <rect x={61} y={23} width={178} height={113} rx={1} fill="#040408" />
      {/* Screen surface */}
      <rect x={64} y={26} width={172} height={107} fill="url(#thScr)" />

      {/* ── Movie scene (playing) ── */}
      {playing && (
        <>
          {/* Sky */}
          <rect x={64} y={26} width={172} height={52} fill="rgba(4,8,22,0.85)" />
          {/* Horizon atmospheric glow */}
          <rect x={64} y={68} width={172} height={20} fill="rgba(18,55,180,0.22)" />
          {/* Stars */}
          {[[78,32],[105,28],[138,36],[162,30],[195,34],[218,29],[94,44],[172,40],[185,27],[145,35]].map(([sx,sy],i) => (
            <circle key={i} cx={sx} cy={sy} r={0.7} fill="rgba(255,255,255,0.55)" />
          ))}
          {/* Cityscape silhouette */}
          {[[66,78,8,22],[76,72,12,28],[90,80,7,20],[99,66,20,34],[122,74,10,26],[134,70,6,30],[222,74,14,26],[238,70,8,30],[248,76,5,24]].map(([x,y,w,h],i) => (
            <rect key={i} x={x} y={y} width={w} height={h} fill="rgba(3,3,16,0.92)" />
          ))}
          {/* Building windows */}
          {[[102,69],[106,69],[110,69],[102,75],[106,75],[110,75],[102,81],[106,81]].map(([wx,wy],i) => (
            <rect key={i} x={wx} y={wy} width={2.5} height={3} fill="rgba(255,220,140,0.65)" />
          ))}
          {/* Water reflection */}
          <rect x={64} y={88} width={172} height={22} fill="rgba(8,22,80,0.42)" />
          <rect x={64} y={92} width={172} height={4} fill="rgba(25,60,180,0.15)" />
          {/* Cinematic black bars */}
          <rect x={64} y={26} width={172} height={11} fill="rgba(0,0,0,0.92)" />
          <rect x={64} y={122} width={172} height={11} fill="rgba(0,0,0,0.92)" />
          {/* VU meter inside bottom bar */}
          {[0,5,10,15,20,25,30,35,40].map((x, i) => {
            const h = 3 + (i % 4) + (i % 3 === 0 ? 2 : 0)
            return <rect key={x} x={67+x} y={122+11-h-1} width={4} height={h} rx={0.5}
              fill={`rgba(70,160,255,${0.28 + i * 0.03})`} />
          })}
        </>
      )}

      {/* Standby screen — show when on but not yet playing/paused */}
      {(state === 'off' || state === 'on' || state === 'idle') && (
        <>
          <rect x={64} y={26} width={172} height={107} fill="rgba(0,0,0,0.6)" />
          <text x={150} y={74} textAnchor="middle" fill="rgba(255,255,255,0.12)" fontSize={11} letterSpacing={3} fontFamily="'Helvetica Neue',sans-serif">STANDBY</text>
          <ellipse cx={150} cy={88} rx={5} ry={5} fill="rgba(255,80,80,0.45)" />
          <ellipse cx={150} cy={88} rx={8} ry={8} fill="rgba(255,60,60,0.12)" />
        </>
      )}

      {/* Paused overlay */}
      {state === 'paused' && (
        <>
          <rect x={64} y={26} width={172} height={107} fill="rgba(0,0,0,0.55)" />
          <text x={150} y={83} textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize={30}>⏸</text>
        </>
      )}

      {/* Screen glare */}
      <line x1={67} y1={29} x2={118} y2={29} stroke="rgba(255,255,255,0.05)" strokeWidth={1.5} />

      {/* ── Projector beam ── */}
      {on && (
        <polygon points={`143,16 157,16 ${BX2-6},${BY1+2} ${BX1+6},${BY1+2}`}
          fill="url(#thBeam)" />
      )}

      {/* Projector ceiling mount */}
      <rect x={141} y={0} width={18} height={3} fill="#1a1a2a" />
      {/* Projector body */}
      <rect x={132} y={3} width={36} height={13} rx={2} fill="#22222e" stroke="#2c2c3c" strokeWidth={0.5} />
      {/* Vent slots */}
      {[136,140,144,148,152,156].map(x => (
        <line key={x} x1={x} y1={4} x2={x} y2={15} stroke="#16161e" strokeWidth={0.8} />
      ))}
      {/* Lens */}
      <ellipse cx={150} cy={16} rx={6} ry={4} fill={on ? '#d0a018' : '#141420'} />
      {on && <ellipse cx={150} cy={16} rx={7} ry={5} fill="rgba(255,195,50,0.45)" filter="url(#thGlow)" />}
      {/* Status LED */}
      <rect x={158} y={7} width={4} height={4} rx={2} fill={on ? '#00cc44' : '#0e0e18'} />

      {/* ── Left tower speaker ── */}
      <g transform="translate(5, 35)">
        {on && <rect x={-3} y={-3} width={28} height={104} rx={4} fill="url(#thSpkGlow)" />}
        <rect x={0} y={0} width={22} height={100} rx={3} fill="#191928" stroke="#232334" strokeWidth={0.7} />
        <ellipse cx={11} cy={10}  rx={6}  ry={6}  fill="url(#thCone)" stroke="#16161e" strokeWidth={0.5} />
        <ellipse cx={11} cy={10}  rx={2}  ry={2}  fill="#07070e" />
        <ellipse cx={11} cy={34}  rx={9}  ry={9}  fill="url(#thCone)" stroke="#16161e" strokeWidth={0.5} />
        <ellipse cx={11} cy={34}  rx={3.5} ry={3.5} fill="#07070e" />
        <ellipse cx={11} cy={64}  rx={9}  ry={9}  fill="url(#thCone)" stroke="#16161e" strokeWidth={0.5} />
        <ellipse cx={11} cy={64}  rx={3.5} ry={3.5} fill="#07070e" />
        <rect x={4} y={80} width={14} height={5} rx={2.5} fill="#07070c" stroke="#161620" strokeWidth={0.4} />
        <rect x={6} y={92} width={10} height={2.5} rx={1.2} fill={on ? '#0077ff' : '#0c0c18'} />
        {on && <rect x={6} y={92} width={10} height={2.5} rx={1.2} fill="rgba(0,110,255,0.6)" filter="url(#thGlow)" />}
      </g>

      {/* ── Right tower speaker ── */}
      <g transform={`translate(${W-27}, 35)`}>
        {on && <rect x={-3} y={-3} width={28} height={104} rx={4} fill="url(#thSpkGlow)" />}
        <rect x={0} y={0} width={22} height={100} rx={3} fill="#191928" stroke="#232334" strokeWidth={0.7} />
        <ellipse cx={11} cy={10}  rx={6}  ry={6}  fill="url(#thCone)" stroke="#16161e" strokeWidth={0.5} />
        <ellipse cx={11} cy={10}  rx={2}  ry={2}  fill="#07070e" />
        <ellipse cx={11} cy={34}  rx={9}  ry={9}  fill="url(#thCone)" stroke="#16161e" strokeWidth={0.5} />
        <ellipse cx={11} cy={34}  rx={3.5} ry={3.5} fill="#07070e" />
        <ellipse cx={11} cy={64}  rx={9}  ry={9}  fill="url(#thCone)" stroke="#16161e" strokeWidth={0.5} />
        <ellipse cx={11} cy={64}  rx={3.5} ry={3.5} fill="#07070e" />
        <rect x={4} y={80} width={14} height={5} rx={2.5} fill="#07070c" stroke="#161620" strokeWidth={0.4} />
        <rect x={6} y={92} width={10} height={2.5} rx={1.2} fill={on ? '#0077ff' : '#0c0c18'} />
        {on && <rect x={6} y={92} width={10} height={2.5} rx={1.2} fill="rgba(0,110,255,0.6)" filter="url(#thGlow)" />}
      </g>

      {/* ── Center channel (below screen, on back wall) ── */}
      <g transform="translate(88, 140)">
        <rect x={0} y={0} width={124} height={18} rx={3} fill="#191928" stroke="#232334" strokeWidth={0.7} />
        {[22, 57, 92].map(cx => (
          <g key={cx}>
            <ellipse cx={cx} cy={9} rx={8} ry={7} fill="url(#thCone)" stroke="#16161e" strokeWidth={0.5} />
            <ellipse cx={cx} cy={9} rx={3} ry={3} fill="#07070e" />
          </g>
        ))}
        <rect x={110} y={5} width={8} height={8} rx={4} fill="#07070c" />
        <rect x={2} y={14} width={10} height={2} rx={1} fill={on ? '#0077ff' : '#0c0c18'} />
        {on && <rect x={2} y={14} width={10} height={2} rx={1} fill="rgba(0,110,255,0.5)" filter="url(#thGlow)" />}
      </g>

      {/* ── Subwoofer (left floor) ── */}
      <g transform="translate(4, 156)">
        <rect x={0} y={0} width={30} height={30} rx={3} fill="#141420" stroke="#1e1e2c" strokeWidth={0.7} />
        <ellipse cx={15} cy={14} rx={12} ry={12} fill="url(#thCone)" stroke="#16161e" strokeWidth={0.5} />
        <ellipse cx={15} cy={14} rx={4.5} ry={4.5} fill="#060610" />
        <rect x={4} y={27} width={8} height={2.5} rx={1.2} fill="#07070c" />
        {on && <ellipse cx={15} cy={14} rx={13} ry={13} fill="rgba(0,40,200,0.14)" filter="url(#thGlow)" />}
      </g>

      {/* ── Seating row ── */}
      {[55, 102, 149, 196].map(sx => (
        <g key={sx} transform={`translate(${sx}, 158)`}>
          <rect x={0} y={0} width={38} height={24} rx={3} fill="#14102a" stroke="#201638" strokeWidth={0.5} />
          <rect x={4} y={2} width={30} height={10} rx={2} fill="#1c1440" />
          <rect x={-3} y={2} width={4} height={22} rx={2} fill="#0e0c1e" />
          <rect x={37} y={2} width={4} height={22} rx={2} fill="#0e0c1e" />
          <rect x={1} y={22} width={36} height={9} rx={2} fill="#14102a" stroke="#201638" strokeWidth={0.5} />
        </g>
      ))}
    </svg>
  )
}

export const HomeTheaterCard = memo(({ s }: { s: HaState }) => {
  const callService = useRestCall()
  const th = useTh()

  const state   = s.state ?? 'off'
  const playing = state === 'playing'
  const on      = state !== 'off' && state !== 'unavailable'
  const volume  = Number(s.attributes.volume_level ?? 0.5)
  const muted   = Boolean(s.attributes.is_volume_muted)
  const title   = String(s.attributes.media_title ?? '')
  const artist  = String(s.attributes.media_artist ?? '')
  const name    = String(s.attributes.friendly_name ?? 'Home Theater')

  // Button colours adapt: bright bg when off, dark bg when on
  const offBg   = 'rgba(255,255,255,0.18)'
  const offBdr  = 'rgba(255,255,255,0.30)'
  const offTxt  = 'rgba(255,255,255,0.85)'
  const onBg    = 'rgba(255,255,255,0.07)'
  const onBdr   = 'rgba(255,255,255,0.12)'
  const onTxt   = 'rgba(255,255,255,0.70)'
  const btnBase: React.CSSProperties = {
    border: `1px solid ${on ? onBdr : offBdr}`, borderRadius: 8,
    fontSize: 14, padding: '6px 10px', cursor: 'pointer', transition: 'all 0.2s',
    background: on ? onBg : offBg, color: on ? onTxt : offTxt,
  }

  return (
    <div style={{
      gridColumn: 'span 2',
      background: on ? '#0d0d20' : '#5050a0',
      border: `1px solid ${on ? 'rgba(50,100,255,0.28)' : 'rgba(255,255,255,0.25)'}`,
      borderRadius: 20, padding: '14px 12px 12px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      boxShadow: on ? '0 4px 32px rgba(25,70,255,0.18)' : '0 4px 20px rgba(0,0,0,0.3)',
      transition: 'all 0.5s',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '2px', textTransform: 'uppercase', color: on ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.85)', fontFamily: "'Helvetica Neue', sans-serif" }}>
          {name}
        </span>
        {title ? (
          <span style={{ fontSize: 10, color: on ? 'rgba(100,170,255,0.7)' : 'rgba(255,255,255,0.7)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {artist ? `${artist} — ` : ''}{title}
          </span>
        ) : (
          <span style={{ fontSize: 10, color: on ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.7)' }}>
            {state === 'off' ? 'Off' : state === 'idle' ? 'Idle' : state}
          </span>
        )}
      </div>

      {/* Theater visual */}
      <div style={{ width: '100%', position: 'relative' }}>
        <TheaterSVG state={state} />
        {/* YouTube video overlaid exactly on the SVG screen area
            Screen in 300×192 viewBox: x=64 y=26 w=172 h=107
            As %: left=21.33% top=13.54% w=57.33% h=55.73% */}
        {playing && (
          <iframe
            key="yt"
            src="https://www.youtube.com/embed/aqz-KE-bpKQ?autoplay=1&mute=1&loop=1&playlist=aqz-KE-bpKQ&controls=0&modestbranding=1&rel=0&iv_load_policy=3"
            style={{
              position: 'absolute',
              left: '21.33%', top: '13.54%',
              width: '57.33%', height: '55.73%',
              border: 'none', borderRadius: 2,
            }}
            allow="autoplay; encrypted-media"
          />
        )}
        {/* Paused: dim glass overlay so video freezes visually */}
        {state === 'paused' && (
          <div style={{
            position: 'absolute',
            left: '21.33%', top: '13.54%',
            width: '57.33%', height: '55.73%',
            background: 'rgba(0,0,0,0.45)',
            borderRadius: 2,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, color: 'rgba(255,255,255,0.3)',
          }}>⏸</div>
        )}
      </div>

      {/* Volume bar */}
      <div style={{ width: '100%', height: 3, background: on ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.30)', borderRadius: 2 }}>
        <div style={{ height: '100%', width: `${muted ? 0 : volume * 100}%`, background: on ? 'rgba(80,140,255,0.8)' : 'rgba(255,255,255,0.9)', borderRadius: 2, transition: 'width 0.3s' }} />
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
        <button onClick={() => callService('media_player', on ? 'turn_off' : 'turn_on', {}, s.entity_id)}
          style={{ ...btnBase, background: on ? 'rgba(255,55,55,0.22)' : offBg, borderColor: on ? 'rgba(255,55,55,0.45)' : offBdr, color: on ? '#ff7070' : offTxt }}>
          ⏻
        </button>
        <button onClick={() => callService('media_player', 'media_previous_track', {}, s.entity_id)}
          disabled={!on} style={{ ...btnBase, opacity: on ? 1 : 0.45 }}>⏮</button>
        <button onClick={() => callService('media_player', playing ? 'media_pause' : 'media_play', {}, s.entity_id)}
          disabled={!on}
          style={{ ...btnBase, fontSize: 16, padding: '6px 14px', opacity: on ? 1 : 0.45,
            background: on ? 'rgba(55,110,255,0.28)' : offBg,
            borderColor: on ? 'rgba(55,110,255,0.5)' : offBdr,
            color: on ? '#80aaff' : offTxt }}>
          {playing ? '⏸' : '▶'}
        </button>
        <button onClick={() => callService('media_player', 'media_next_track', {}, s.entity_id)}
          disabled={!on} style={{ ...btnBase, opacity: on ? 1 : 0.45 }}>⏭</button>
        <button onClick={() => callService('media_player', 'volume_down', {}, s.entity_id)}
          disabled={!on} style={{ ...btnBase, fontSize: 12, opacity: on ? 1 : 0.45 }}>🔉</button>
        <button onClick={() => callService('media_player', 'volume_up', {}, s.entity_id)}
          disabled={!on} style={{ ...btnBase, fontSize: 12, opacity: on ? 1 : 0.45 }}>🔊</button>
        <button onClick={() => callService('media_player', 'volume_mute', { is_volume_muted: !muted }, s.entity_id)}
          disabled={!on} style={{ ...btnBase, fontSize: 12, opacity: on ? 1 : 0.45,
            background: muted ? 'rgba(255,200,0,0.25)' : (on ? onBg : offBg),
            borderColor: muted ? 'rgba(255,200,0,0.5)' : (on ? onBdr : offBdr),
            color: muted ? '#ffcc44' : (on ? onTxt : offTxt) }}>🔇</button>
      </div>
    </div>
  )
})
