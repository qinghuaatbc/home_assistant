import { useState, useCallback, useEffect } from 'react'

const GITHUB_RAW = 'https://raw.githubusercontent.com/qinghuaatbc/home_assistant/main'

type NodeType = 'entry' | 'module' | 'service' | 'controller' | 'gateway' | 'integration' | 'context' | 'page' | 'component'

interface DiagramNode {
  id: string; label: string; type: NodeType
  file: string; desc: string
  x: number; y: number; w: number; h: number
}
interface Edge { from: string; to: string }

const TYPE_COLOR: Record<NodeType, { fill: string; stroke: string; text: string }> = {
  entry:       { fill: 'rgba(255,159,10,0.18)',  stroke: '#ff9f0a', text: '#ff9f0a' },
  module:      { fill: 'rgba(94,92,230,0.18)',   stroke: '#5e5ce6', text: '#a78bfa' },
  service:     { fill: 'rgba(48,209,88,0.18)',   stroke: '#30d158', text: '#30d158' },
  controller:  { fill: 'rgba(10,132,255,0.18)',  stroke: '#0a84ff', text: '#5ac8fa' },
  gateway:     { fill: 'rgba(255,159,10,0.18)',  stroke: '#ff9f0a', text: '#ff9f0a' },
  integration: { fill: 'rgba(255,69,58,0.15)',   stroke: '#ff453a', text: '#ff6b6b' },
  context:     { fill: 'rgba(191,90,242,0.18)',  stroke: '#bf5af2', text: '#bf5af2' },
  page:        { fill: 'rgba(48,209,88,0.15)',   stroke: '#30d158', text: '#34c759' },
  component:   { fill: 'rgba(10,132,255,0.15)',  stroke: '#0a84ff', text: '#5ac8fa' },
}

// ─── Backend diagram (700 × 370) ─────────────────────────────────────────────

const BE_NODES: DiagramNode[] = [
  { id:'main',  label:'main.ts',          type:'entry',       x:300, y:8,   w:120, h:30, file:'src/main.ts',                                                         desc:'Bootstrap, proxy middleware, static files, WebSocket adapter' },
  { id:'app',   label:'AppModule',         type:'module',      x:270, y:52,  w:180, h:30, file:'src/app.module.ts',                                                    desc:'Root NestJS module — wires all feature modules together' },
  // Level 3: modules
  { id:'core',  label:'CoreModule',        type:'module',      x:8,   y:106, w:110, h:30, file:'src/core/core.module.ts',                                              desc:'EventBus, StateMachine, ServiceRegistry infrastructure' },
  { id:'auth',  label:'AuthModule',        type:'module',      x:134, y:106, w:110, h:30, file:'src/auth/auth.module.ts',                                              desc:'JWT authentication, long-lived tokens, guards' },
  { id:'api',   label:'ApiModule',         type:'module',      x:260, y:106, w:110, h:30, file:'src/api/api.module.ts',                                                desc:'REST API — states, services, events, history, config' },
  { id:'ws',    label:'WebSocketModule',   type:'module',      x:386, y:106, w:120, h:30, file:'src/websocket/websocket.module.ts',                                    desc:'Socket.io gateway for real-time entity state push' },
  { id:'int',   label:'Integrations',      type:'module',      x:522, y:106, w:120, h:30, file:'src/integrations/integrations.module.ts',                              desc:'ISY-994, MQTT, Ecobee, Lutron, Yamaha, go2rtc camera' },
  // Level 4: services / controllers
  { id:'evtbus',label:'EventBus',          type:'service',     x:8,   y:156, w:110, h:26, file:'src/core/event-bus/event-bus.service.ts',                              desc:'In-process typed pub/sub event bus' },
  { id:'sm',    label:'StateMachine',      type:'service',     x:8,   y:190, w:110, h:26, file:'src/core/state-machine/state-machine.service.ts',                      desc:'Entity state storage, transitions & history' },
  { id:'sr',    label:'ServiceRegistry',   type:'service',     x:8,   y:224, w:110, h:26, file:'src/core/service-registry/service-registry.service.ts',                desc:'Dynamic integration service lookup & dispatch' },
  { id:'authc', label:'AuthController',    type:'controller',  x:134, y:156, w:110, h:26, file:'src/auth/auth.controller.ts',                                         desc:'Login, token create/revoke, profile endpoints' },
  { id:'guard', label:'JwtGuard',          type:'service',     x:134, y:190, w:110, h:26, file:'src/auth/guards/jwt.guard.ts',                                        desc:'Bearer token validation for protected routes' },
  { id:'stsc',  label:'StatesCtrl',        type:'controller',  x:260, y:156, w:110, h:26, file:'src/api/states/states.controller.ts',                                 desc:'GET /api/states — entity state queries' },
  { id:'svcc',  label:'ServicesCtrl',      type:'controller',  x:260, y:190, w:110, h:26, file:'src/api/services/services.controller.ts',                             desc:'POST /api/services — call HA-compatible services' },
  { id:'histc', label:'HistoryCtrl',       type:'controller',  x:260, y:224, w:110, h:26, file:'src/api/history/history.controller.ts',                               desc:'GET /api/history — time-series state history' },
  { id:'gw',    label:'HaGateway',         type:'gateway',     x:386, y:156, w:120, h:26, file:'src/websocket/websocket.gateway.ts',                                  desc:'Socket.io gateway — subscribe/state_changed events' },
  { id:'ioadp', label:'SocketIoAdapter',   type:'service',     x:386, y:190, w:120, h:26, file:'src/websocket/socket-io.adapter.ts',                                  desc:'Custom CORS-aware Socket.io server adapter' },
  { id:'isy',   label:'ISY-994',           type:'integration', x:522, y:156, w:120, h:26, file:'src/integrations/built-in/isy994/isy994.service.ts',                  desc:'Insteon ISY-994 smart home controller via REST/WebSocket' },
  { id:'mqtt',  label:'MQTT',              type:'integration', x:522, y:190, w:120, h:26, file:'src/integrations/built-in/mqtt/mqtt.service.ts',                      desc:'MQTT broker pub/sub for IoT devices' },
  { id:'eco',   label:'Ecobee',            type:'integration', x:522, y:224, w:120, h:26, file:'src/integrations/built-in/ecobee/ecobee.service.ts',                  desc:'Ecobee thermostat cloud OAuth API' },
  { id:'lut',   label:'Lutron',            type:'integration', x:522, y:258, w:120, h:26, file:'src/integrations/built-in/lutron-caseta/lutron-caseta.service.ts',    desc:'Lutron Caséta lighting & shade control' },
  { id:'cam',   label:'go2rtc/Camera',     type:'integration', x:522, y:292, w:120, h:26, file:'src/api/webrtc/webrtc.service.ts',                                    desc:'WebRTC camera streaming via go2rtc proxy' },
  // Level 5: supporting modules
  { id:'push',  label:'PushModule',        type:'module',      x:8,   y:278, w:110, h:28, file:'src/push/push.module.ts',                                             desc:'Web Push / VAPID notification subscriptions & rules' },
  { id:'comm',  label:'CommModule',        type:'module',      x:134, y:278, w:110, h:28, file:'src/comm/comm.module.ts',                                             desc:'Two-way user-to-user messaging over WebSocket' },
  { id:'geo',   label:'GeofenceModule',    type:'module',      x:260, y:278, w:110, h:28, file:'src/geofence/geofence.module.ts',                                     desc:'GPS geofence zones, person tracking, presence' },
  { id:'anom',  label:'AnomalyModule',     type:'module',      x:386, y:278, w:110, h:28, file:'src/anomaly/anomaly.module.ts',                                       desc:'Z-score sensor anomaly detection' },
]

const BE_EDGES: Edge[] = [
  {from:'main',to:'app'},
  {from:'app',to:'core'},{from:'app',to:'auth'},{from:'app',to:'api'},{from:'app',to:'ws'},{from:'app',to:'int'},
  {from:'app',to:'push'},{from:'app',to:'comm'},{from:'app',to:'geo'},{from:'app',to:'anom'},
  {from:'core',to:'evtbus'},{from:'core',to:'sm'},{from:'core',to:'sr'},
  {from:'auth',to:'authc'},{from:'auth',to:'guard'},
  {from:'api',to:'stsc'},{from:'api',to:'svcc'},{from:'api',to:'histc'},
  {from:'ws',to:'gw'},{from:'ws',to:'ioadp'},
  {from:'int',to:'isy'},{from:'int',to:'mqtt'},{from:'int',to:'eco'},{from:'int',to:'lut'},{from:'int',to:'cam'},
]

// ─── Frontend diagram (680 × 360) ────────────────────────────────────────────

const FE_NODES: DiagramNode[] = [
  { id:'app',   label:'App.tsx',           type:'entry',     x:270, y:8,   w:120, h:30, file:'frontend/src/App.tsx',                                                         desc:'Root — BrowserRouter, lazy page loading, FloatingMic' },
  // Contexts
  { id:'hactx', label:'HaContext',         type:'context',   x:8,   y:60,  w:110, h:28, file:'frontend/src/context/HaContext.tsx',                                            desc:'WebSocket connection, entity states Map, token & auth' },
  { id:'comctx',label:'CommContext',       type:'context',   x:130, y:60,  w:110, h:28, file:'frontend/src/context/CommContext.tsx',                                          desc:'Messaging panel open state & unread count badge' },
  { id:'toast', label:'ToastContext',      type:'context',   x:252, y:60,  w:110, h:28, file:'frontend/src/context/ToastContext.tsx',                                         desc:'Global toast/snackbar notification system' },
  { id:'mic',   label:'FloatingMic',       type:'component', x:374, y:60,  w:110, h:28, file:'frontend/src/App.tsx',                                                          desc:'Siri-style voice control with silence detection' },
  { id:'commp', label:'CommPanel',         type:'component', x:496, y:60,  w:120, h:28, file:'frontend/src/components/comm/CommPanel.tsx',                                    desc:'Slide-in messaging panel with WebSocket updates' },
  // Auth layout
  { id:'authl', label:'AuthLayout',        type:'component', x:8,   y:112, w:110, h:28, file:'frontend/src/App.tsx',                                                          desc:'Admin app shell — LoginPage guard + TabBar + Routes' },
  { id:'tabbar',label:'TabBar',            type:'component', x:8,   y:150, w:110, h:26, file:'frontend/src/components/TabBar.tsx',                                            desc:'15-tab scrollable navigation bar (bottom on mobile)' },
  // Pages (admin)
  { id:'dash',  label:'DashboardPage',     type:'page',      x:130, y:112, w:110, h:26, file:'frontend/src/pages/DashboardPage.tsx',                                         desc:'Configurable entity card dashboard with YAML editor' },
  { id:'ent',   label:'EntitiesPage',      type:'page',      x:252, y:112, w:110, h:26, file:'frontend/src/pages/EntitiesPage.tsx',                                          desc:'Full entity state browser, filter, and inline editor' },
  { id:'auto',  label:'AutomationsPage',   type:'page',      x:374, y:112, w:110, h:26, file:'frontend/src/pages/AutomationsPage.tsx',                                       desc:'Trigger→Condition→Action automation rule editor' },
  { id:'hist',  label:'HistoryPage',       type:'page',      x:496, y:112, w:110, h:26, file:'frontend/src/pages/HistoryPage.tsx',                                           desc:'Time-series entity history charts' },
  { id:'sec',   label:'SecurityPage',      type:'page',      x:130, y:147, w:110, h:26, file:'frontend/src/pages/SecurityPage.tsx',                                          desc:'Camera grid, alarm panel, lock status' },
  { id:'int',   label:'IntegrationsPage',  type:'page',      x:252, y:147, w:110, h:26, file:'frontend/src/pages/IntegrationsPage.tsx',                                      desc:'Integration config, entity mapping, connection status' },
  { id:'sett',  label:'SettingsPage',      type:'page',      x:374, y:147, w:110, h:26, file:'frontend/src/pages/SettingsPage.tsx',                                          desc:'App settings, tokens, push notifs, dashboard editor' },
  // RTI Panel
  { id:'rti',   label:'RtiPanelPage',      type:'page',      x:8,   y:202, w:130, h:28, file:'frontend/src/pages/RtiPanelPage.tsx',                                          desc:'Full-screen end-user control panel at /panel' },
  { id:'catnav',label:'CategoryNav',       type:'component', x:150, y:202, w:120, h:28, file:'frontend/src/components/panel/ui/CategoryNav.tsx',                              desc:'Category tabs — Lights/Media/Climate/Security/etc' },
  { id:'rsb',   label:'RightSidebar',      type:'component', x:282, y:202, w:120, h:28, file:'frontend/src/components/panel/ui/RightSidebar.tsx',                             desc:'Time, weather widget, theme/lang/sound controls' },
  { id:'pctx',  label:'PanelContext',      type:'context',   x:414, y:202, w:120, h:28, file:'frontend/src/components/panel/PanelContext.tsx',                                desc:'Panel state, hooks (useT/useTh/useSound/useRestCall)' },
  // Panel cards
  { id:'lcards',label:'LightCards',        type:'component', x:8,   y:252, w:120, h:26, file:'frontend/src/components/panel/cards/LightCards.tsx',                            desc:'LightRtiCard + LightTile — brightness drag & glow FX' },
  { id:'mcards',label:'MediaCards',        type:'component', x:140, y:252, w:120, h:26, file:'frontend/src/components/panel/cards/MediaCards.tsx',                            desc:'Media player with album art, seek, volume slider' },
  { id:'ccards',label:'ClimateCards',      type:'component', x:272, y:252, w:120, h:26, file:'frontend/src/components/panel/cards/ClimateCards.tsx',                          desc:'Climate sensor tiles — temp/humidity display' },
  { id:'camv',  label:'CameraView',        type:'component', x:404, y:252, w:120, h:26, file:'frontend/src/components/panel/views/CameraView.tsx',                            desc:'HLS/WebRTC camera grid in panel' },
  { id:'fp3d',  label:'FloorPlan3D',       type:'component', x:8,   y:288, w:120, h:26, file:'frontend/src/components/FloorPlan3DScene.tsx',                                  desc:'Three.js 3D floor plan with clickable entity objects' },
  { id:'fp2d',  label:'FloorPlan2D',       type:'component', x:140, y:288, w:120, h:26, file:'frontend/src/pages/FloorPlan2DPage.tsx',                                        desc:'SVG 2D floor plan overlay with entity state layers' },
  { id:'slider',label:'FancySlider',       type:'component', x:272, y:288, w:120, h:26, file:'frontend/src/components/panel/ui/FancySlider.tsx',                              desc:'Custom touch slider for brightness/volume controls' },
]

const FE_EDGES: Edge[] = [
  {from:'app',to:'hactx'},{from:'app',to:'comctx'},{from:'app',to:'toast'},{from:'app',to:'mic'},{from:'app',to:'commp'},
  {from:'app',to:'authl'},{from:'app',to:'rti'},
  {from:'authl',to:'tabbar'},
  {from:'authl',to:'dash'},{from:'authl',to:'ent'},{from:'authl',to:'auto'},{from:'authl',to:'hist'},
  {from:'authl',to:'sec'},{from:'authl',to:'int'},{from:'authl',to:'sett'},
  {from:'rti',to:'catnav'},{from:'rti',to:'rsb'},{from:'rti',to:'pctx'},
  {from:'rti',to:'lcards'},{from:'rti',to:'mcards'},{from:'rti',to:'ccards'},{from:'rti',to:'camv'},
  {from:'rti',to:'fp3d'},{from:'rti',to:'fp2d'},
  {from:'pctx',to:'slider'},
]

// ─── Node tree data (for accordion list) ─────────────────────────────────────

interface TreeGroup { label: string; icon: string; nodes: DiagramNode[] }

const BE_GROUPS: TreeGroup[] = [
  { label: 'Entry', icon: '⚡', nodes: BE_NODES.filter(n => ['main','app'].includes(n.id)) },
  { label: 'Core Infrastructure', icon: '🔧', nodes: BE_NODES.filter(n => ['core','evtbus','sm','sr'].includes(n.id)) },
  { label: 'Auth', icon: '🔐', nodes: BE_NODES.filter(n => ['auth','authc','guard'].includes(n.id)) },
  { label: 'REST API', icon: '🌐', nodes: BE_NODES.filter(n => ['api','stsc','svcc','histc'].includes(n.id)) },
  { label: 'WebSocket', icon: '⚡', nodes: BE_NODES.filter(n => ['ws','gw','ioadp'].includes(n.id)) },
  { label: 'Integrations', icon: '🔌', nodes: BE_NODES.filter(n => ['int','isy','mqtt','eco','lut','cam'].includes(n.id)) },
  { label: 'Feature Modules', icon: '📦', nodes: BE_NODES.filter(n => ['push','comm','geo','anom'].includes(n.id)) },
]

const FE_GROUPS: TreeGroup[] = [
  { label: 'Application Root', icon: '⚡', nodes: FE_NODES.filter(n => ['app','mic','commp'].includes(n.id)) },
  { label: 'Contexts', icon: '🔗', nodes: FE_NODES.filter(n => ['hactx','comctx','toast'].includes(n.id)) },
  { label: 'Admin Layout & Nav', icon: '🗂', nodes: FE_NODES.filter(n => ['authl','tabbar'].includes(n.id)) },
  { label: 'Admin Pages', icon: '📄', nodes: FE_NODES.filter(n => ['dash','ent','auto','hist','sec','int','sett'].includes(n.id)) },
  { label: 'RTI Panel', icon: '🎛️', nodes: FE_NODES.filter(n => ['rti','catnav','rsb','pctx','slider'].includes(n.id)) },
  { label: 'Panel Cards & Views', icon: '🃏', nodes: FE_NODES.filter(n => ['lcards','mcards','ccards','camv','fp3d','fp2d'].includes(n.id)) },
]

// ─── SVG Diagram ─────────────────────────────────────────────────────────────

function nodeCenter(n: DiagramNode) {
  return { cx: n.x + n.w / 2, cy: n.y + n.h / 2 }
}

function DiagramSvg({ nodes, edges, onSelect, selected, vw, vh }: {
  nodes: DiagramNode[]; edges: Edge[]
  onSelect: (n: DiagramNode) => void
  selected: string | null
  vw: number; vh: number
}) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  return (
    <svg
      viewBox={`0 0 ${vw} ${vh}`}
      style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
    >
      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 Z" fill="rgba(255,255,255,0.25)" />
        </marker>
      </defs>
      {/* Edges */}
      {edges.map((e, i) => {
        const a = nodeMap.get(e.from); const b = nodeMap.get(e.to)
        if (!a || !b) return null
        const { cx: ax, cy: ay } = nodeCenter(a)
        const bx = b.x + b.w / 2; const by = b.y
        const mx = (ax + bx) / 2; const my = (ay + a.h / 2 + by) / 2
        return (
          <path key={i}
            d={`M${ax},${ay + a.h / 2} C${ax},${my} ${bx},${my} ${bx},${by}`}
            fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={1.2}
            markerEnd="url(#arrow)"
          />
        )
      })}
      {/* Nodes */}
      {nodes.map(n => {
        const c = TYPE_COLOR[n.type]
        const active = selected === n.id
        return (
          <g key={n.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(n)}>
            <rect
              x={n.x} y={n.y} width={n.w} height={n.h} rx={7}
              fill={active ? c.stroke + '55' : c.fill}
              stroke={active ? c.stroke : c.stroke + '88'}
              strokeWidth={active ? 2 : 1}
            />
            <text
              x={n.x + n.w / 2} y={n.y + n.h / 2 + 1}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={9.5} fontWeight={active ? 700 : 500} fill={active ? '#fff' : c.text}
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            >
              {n.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── Node Tree Accordion ──────────────────────────────────────────────────────

function NodeTree({ groups, onSelect, selected }: {
  groups: TreeGroup[]; onSelect: (n: DiagramNode) => void; selected: string | null
}) {
  const [open, setOpen] = useState<Set<string>>(new Set([groups[0]?.label]))
  const toggle = (label: string) => setOpen(s => { const n = new Set(s); n.has(label) ? n.delete(label) : n.add(label); return n })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 16 }}>
      {groups.map(g => (
        <div key={g.label} style={{ border: '1px solid var(--sep)', borderRadius: 10, overflow: 'hidden' }}>
          <button
            onClick={() => toggle(g.label)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface)', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 13, fontWeight: 600 }}
          >
            <span>{g.icon}</span>
            <span style={{ flex: 1, textAlign: 'left' }}>{g.label}</span>
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>{g.nodes.length} files</span>
            <span style={{ color: 'var(--text2)', fontSize: 12 }}>{open.has(g.label) ? '▲' : '▼'}</span>
          </button>
          {open.has(g.label) && (
            <div style={{ background: 'var(--bg)', padding: '4px 0' }}>
              {g.nodes.map(n => {
                const c = TYPE_COLOR[n.type]
                const active = selected === n.id
                return (
                  <button
                    key={n.id}
                    onClick={() => onSelect(n)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '8px 14px', border: 'none', cursor: 'pointer', textAlign: 'left',
                      background: active ? c.stroke + '18' : 'transparent',
                      borderLeft: active ? `3px solid ${c.stroke}` : '3px solid transparent',
                      transition: 'background 0.15s',
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: c.stroke, flexShrink: 0, marginTop: 5 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: active ? c.text : 'var(--text)' }}>{n.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1, fontFamily: 'monospace', opacity: 0.8 }}>{n.file}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{n.desc}</div>
                    </div>
                    <span style={{
                      fontSize: 10, padding: '2px 6px', borderRadius: 4,
                      background: c.stroke + '22', color: c.text, flexShrink: 0, marginTop: 2,
                    }}>{n.type}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Code Modal ───────────────────────────────────────────────────────────────

function CodeModal({ node, onClose }: { node: DiagramNode; onClose: () => void }) {
  const [code, setCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const c = TYPE_COLOR[node.type]

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch(`${GITHUB_RAW}/${node.file}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setCode(await r.text())
    } catch (e: any) {
      setError(e?.message ?? 'Failed to fetch')
    }
    setLoading(false)
  }, [node.file])

  useEffect(() => { load() }, [load])

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9800, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'fixed', inset: '5vh 4vw', zIndex: 9801,
        background: 'var(--bg)', border: `1px solid ${c.stroke}55`,
        borderRadius: 16, display: 'flex', flexDirection: 'column',
        boxShadow: `0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px ${c.stroke}33`,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--sep)', flexShrink: 0, background: 'var(--surface)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: c.stroke, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: c.text }}>{node.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'monospace', marginTop: 1 }}>{node.file}</div>
          </div>
          <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: c.stroke + '22', color: c.text }}>{node.type}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>
        {/* Description */}
        <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text2)', borderBottom: '1px solid var(--sep)', flexShrink: 0 }}>
          {node.desc}
        </div>
        {/* Code */}
        <div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text2)', fontSize: 13 }}>
              Loading source…
            </div>
          )}
          {error && (
            <div style={{ padding: 20 }}>
              <div style={{ color: '#ff453a', fontSize: 13, marginBottom: 8 }}>Failed to load: {error}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
                Direct link: <a href={`${GITHUB_RAW}/${node.file}`} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>{GITHUB_RAW}/{node.file}</a>
              </div>
              <button onClick={load} style={{ background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, cursor: 'pointer' }}>Retry</button>
            </div>
          )}
          {code !== null && !loading && (
            <pre style={{
              margin: 0, padding: '14px 16px',
              fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace",
              fontSize: 12, lineHeight: 1.65,
              color: 'var(--text)', whiteSpace: 'pre',
              overflow: 'visible',
            }}>
              {code}
            </pre>
          )}
        </div>
        {/* Footer */}
        {code !== null && (
          <div style={{ padding: '6px 16px', borderTop: '1px solid var(--sep)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)' }}>
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>{code.split('\n').length} lines</span>
            <a href={`${GITHUB_RAW}/${node.file}`} target="_blank" rel="noreferrer"
              style={{ fontSize: 11, color: 'var(--blue)', textDecoration: 'none', marginLeft: 'auto' }}>
              Open raw ↗
            </a>
            <button
              onClick={() => navigator.clipboard.writeText(code)}
              style={{ fontSize: 11, color: 'var(--text2)', background: 'none', border: '1px solid var(--sep)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}
            >
              Copy
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Legend ───────────────────────────────────────────────────────────────────

const LEGEND: { type: NodeType; label: string }[] = [
  { type:'entry',       label:'Entry Point' },
  { type:'module',      label:'NestJS Module' },
  { type:'service',     label:'Service' },
  { type:'controller',  label:'Controller' },
  { type:'gateway',     label:'WS Gateway' },
  { type:'integration', label:'Integration' },
  { type:'context',     label:'React Context' },
  { type:'page',        label:'Page' },
  { type:'component',   label:'Component' },
]

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CodeAnalysisPage() {
  const [tab, setTab] = useState<'backend' | 'frontend'>('backend')
  const [selected, setSelected] = useState<DiagramNode | null>(null)
  const [modalNode, setModalNode] = useState<DiagramNode | null>(null)

  const nodes = tab === 'backend' ? BE_NODES : FE_NODES
  const edges = tab === 'backend' ? BE_EDGES : FE_EDGES
  const groups = tab === 'backend' ? BE_GROUPS : FE_GROUPS
  const vw = tab === 'backend' ? 660 : 660
  const vh = tab === 'backend' ? 330 : 330

  const handleSelect = useCallback((n: DiagramNode) => {
    setSelected(prev => prev?.id === n.id ? null : n)
  }, [])

  const handleViewCode = useCallback((n: DiagramNode) => {
    setModalNode(n)
  }, [])

  return (
    <div className="page">
      <div className="page-inner">
        <div className="nav-header">
          <div className="nav-title">Code Analysis</div>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 6, marginTop: 16, background: 'var(--surface)', borderRadius: 12, padding: 4 }}>
          {(['backend', 'frontend'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setSelected(null) }} style={{
              flex: 1, padding: '8px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 13,
              background: tab === t ? 'var(--blue)' : 'transparent',
              color: tab === t ? '#fff' : 'var(--text2)',
              transition: 'all 0.2s',
            }}>
              {t === 'backend' ? '⚙️ Backend (NestJS)' : '⚛️ Frontend (React)'}
            </button>
          ))}
        </div>

        {/* Diagram */}
        <div style={{ marginTop: 16, background: 'var(--surface)', borderRadius: 14, padding: '12px 10px', border: '1px solid var(--sep)' }}>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8, fontWeight: 600, letterSpacing: 0.4 }}>
            ARCHITECTURE FLOW — click a node to select, double-click to view source
          </div>
          <div onDoubleClick={e => { if (selected) { e.preventDefault(); handleViewCode(selected) } }}>
            <DiagramSvg nodes={nodes} edges={edges} onSelect={handleSelect} selected={selected?.id ?? null} vw={vw} vh={vh} />
          </div>

          {/* Selected node info bar */}
          {selected && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg)', borderRadius: 10, border: `1px solid ${TYPE_COLOR[selected.type].stroke}44` }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: TYPE_COLOR[selected.type].stroke, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: TYPE_COLOR[selected.type].text }}>{selected.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'monospace', marginTop: 1 }}>{selected.file}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{selected.desc}</div>
              </div>
              <button onClick={() => handleViewCode(selected)} style={{ background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                View Source
              </button>
            </div>
          )}

          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {LEGEND.filter(l => nodes.some(n => n.type === l.type)).map(l => {
              const c = TYPE_COLOR[l.type]
              return (
                <span key={l.type} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: c.text, background: c.fill, border: `1px solid ${c.stroke}66`, borderRadius: 5, padding: '2px 7px' }}>
                  <span style={{ width: 5, height: 5, borderRadius: 2.5, background: c.stroke }} />
                  {l.label}
                </span>
              )
            })}
          </div>
        </div>

        {/* Node tree */}
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', letterSpacing: 0.4, marginBottom: 4 }}>
            ALL FILES — click to highlight on diagram, then "View Source"
          </div>
          <NodeTree groups={groups} onSelect={n => { setSelected(n); handleViewCode(n) }} selected={selected?.id ?? null} />
        </div>

        <div style={{ height: 40 }} />
      </div>

      {modalNode && <CodeModal node={modalNode} onClose={() => setModalNode(null)} />}
    </div>
  )
}
