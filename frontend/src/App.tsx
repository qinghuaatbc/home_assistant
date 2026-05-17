import { useState, useRef, useCallback, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { HaProvider, useHa } from './context/HaContext'
import { getLang, playDone, speakAndThen } from './utils/sounds'
import { ToastProvider } from './context/ToastContext'
import { CommProvider } from './context/CommContext'
import { CommPanel } from './components/comm/CommPanel'
import DoorbellOverlay from './components/DoorbellOverlay'
import LoginPage from './pages/LoginPage'
import TabBar from './components/TabBar'

const DashboardPage    = lazy(() => import('./pages/DashboardPage'))
const EntitiesPage     = lazy(() => import('./pages/EntitiesPage'))
const FloorPlanPage    = lazy(() => import('./pages/FloorPlanPage'))
const FloorPlan2DPage  = lazy(() => import('./pages/FloorPlan2DPage'))
const AutomationsPage  = lazy(() => import('./pages/AutomationsPage'))
const EventsPage       = lazy(() => import('./pages/EventsPage'))
const HistoryPage      = lazy(() => import('./pages/HistoryPage'))
const AreasPage        = lazy(() => import('./pages/AreasPage'))
const IntegrationsPage = lazy(() => import('./pages/IntegrationsPage'))
const SettingsPage     = lazy(() => import('./pages/SettingsPage'))
const RtiPanelPage        = lazy(() => import('./pages/RtiPanelPage'))
const NotificationsPage   = lazy(() => import('./pages/NotificationsPage'))
const GeofencePage        = lazy(() => import('./pages/GeofencePage'))
const OtaPage             = lazy(() => import('./pages/OtaPage'))
const PersonsPage         = lazy(() => import('./pages/PersonsPage'))
const EnergyPage          = lazy(() => import('./pages/EnergyPage'))
const ThermostatPage      = lazy(() => import('./pages/ThermostatPage'))
const ScenesPage          = lazy(() => import('./pages/ScenesPage'))
const SecurityPage        = lazy(() => import('./pages/SecurityPage'))

function getToken(): string {
  const stored = localStorage.getItem('ha_token')
  if (stored) return stored
  const urlToken = new URLSearchParams(window.location.search).get('token') || ''
  if (urlToken) localStorage.setItem('ha_token', urlToken)
  return urlToken
}

// ─── Siri-style wave overlay styles ──────────────────────────────────────────

if (typeof document !== 'undefined' && !document.getElementById('siri-styles')) {
  const s = document.createElement('style')
  s.id = 'siri-styles'
  s.textContent = `
    @keyframes siriWave{0%,100%{transform:scaleY(0.1)}50%{transform:scaleY(1)}}
    @keyframes siriIdle{0%,100%{transform:scaleY(0.12)}50%{transform:scaleY(0.4)}}
    @keyframes siriSlideUp{from{transform:translateY(110%)}to{transform:translateY(0)}}
    @keyframes siriOrb{0%,100%{box-shadow:0 0 0 0 rgba(175,82,222,0.6)}65%{box-shadow:0 0 0 16px rgba(175,82,222,0)}}
    @keyframes siriOrbSpin{from{filter:hue-rotate(0deg)}to{filter:hue-rotate(360deg)}}
  `
  document.head.appendChild(s)
}

const WAVE_COLS = ['#ff3b30','#ff6b3d','#ff9500','#ffd60a','#34c759','#5ac8fa','#007aff','#5856d6','#af52de','#ff2d55','#ff3b30','#ff6b3d','#ff9500']
const WAVE_DURS = [0.55,0.42,0.60,0.48,0.52,0.45,0.58,0.50,0.44,0.56,0.52,0.48,0.54]
const WAVE_DELS = [0.00,0.08,0.16,0.04,0.12,0.20,0.06,0.14,0.18,0.02,0.10,0.22,0.08]

// ─── Floating Mic (Siri-style) ────────────────────────────────────────────────

type MicState = 'idle' | 'listening' | 'processing' | 'done'

function FloatingMic() {
  const { token } = useHa()
  const [micState, setMicState] = useState<MicState>('idle')
  const [lastReply, setLastReply] = useState('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef        = useRef<Blob[]>([])
  const timerRef         = useRef<any>(null)
  const startTimeRef     = useRef(0)
  const audioCtxRef      = useRef<AudioContext | null>(null)
  const cancelSilenceRef = useRef<(() => void) | null>(null)
  const silenceStartRef  = useRef<number | null>(null)
  const cancelledRef     = useRef(false)
  const startRecordingRef = useRef<(() => Promise<void>) | null>(null)
  const restartTimerRef  = useRef<any>(null)

  const stopRecording = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (cancelSilenceRef.current) { cancelSilenceRef.current(); cancelSilenceRef.current = null }
    silenceStartRef.current = null
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null }
    const mr = mediaRecorderRef.current
    if (mr && mr.state === 'recording') mr.stop()
  }, [])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    if (restartTimerRef.current) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null }
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
    stopRecording()
    setMicState('idle')
  }, [stopRecording])

  const sendAudio = useCallback(async (blob: Blob) => {
    setMicState('processing')
    const lang = getLang()
    try {
      const form = new FormData()
      form.append('audio', blob, 'audio.webm')
      form.append('lang', lang)
      const r = await fetch('/api/ai/voice', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      const data = await r.json()
      const reply = data.response || data.hint || '…'
      setLastReply(reply)
      setMicState('done')
      playDone()
      speakAndThen(reply, () => {
        restartTimerRef.current = setTimeout(() => { restartTimerRef.current = null; startRecordingRef.current?.() }, 400)
      })
    } catch {
      setLastReply('Error')
      setMicState('done')
      playDone()
      restartTimerRef.current = setTimeout(() => { restartTimerRef.current = null; startRecordingRef.current?.() }, 2000)
    }
  }, [token])

  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return
    cancelledRef.current = false
    // Unlock speechSynthesis on iOS (requires user gesture context)
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel()
      speechSynthesis.speak(new SpeechSynthesisUtterance(''))
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setMicState('listening')
      chunksRef.current = []
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : ''
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {})
      mediaRecorderRef.current = mr

      mr.ondataavailable = (e: BlobEvent) => { if (e.data.size > 0) chunksRef.current.push(e.data) }

      mr.onstop = () => {
        stream.getTracks().forEach(tk => tk.stop())
        if (cancelledRef.current) return
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
        if (blob.size > 200) sendAudio(blob)
        else setMicState('idle')
      }

      mr.start(100)
      startTimeRef.current = Date.now()

      // Silence detection — Float32 RMS, threshold 0.015
      try {
        const audioCtx = new AudioContext()
        audioCtxRef.current = audioCtx
        await audioCtx.resume()
        const source = audioCtx.createMediaStreamSource(stream)
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 512
        analyser.smoothingTimeConstant = 0
        source.connect(analyser)
        const buf = new Float32Array(analyser.fftSize)
        let cancelled = false
        cancelSilenceRef.current = () => { cancelled = true }
        const check = () => {
          if (cancelled) return
          analyser.getFloatTimeDomainData(buf)
          let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
          const rms = Math.sqrt(sum / buf.length)
          if (Date.now() - startTimeRef.current > 800) {
            if (rms < 0.015) {
              if (silenceStartRef.current === null) silenceStartRef.current = Date.now()
              else if (Date.now() - silenceStartRef.current > 1500) { stopRecording(); return }
            } else silenceStartRef.current = null
          }
          setTimeout(check, 80)
        }
        setTimeout(check, 80)
      } catch { /* no AudioContext */ }

      // 8s hard limit
      timerRef.current = setInterval(() => {
        if (Date.now() - startTimeRef.current >= 8000) stopRecording()
      }, 200)
    } catch { setMicState('idle') }
  }, [sendAudio, stopRecording])

  // Keep ref in sync so sendAudio can call startRecording without circular dep
  startRecordingRef.current = startRecording

  return createPortal(
    <>
      {/* Siri overlay */}
      {micState !== 'idle' && (
        <>
          <div onClick={cancel} style={{ position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(0,0,0,0.25)' }} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9991,
            background: 'rgba(48,50,65,0.48)',
            backdropFilter: 'blur(40px) saturate(1.8)', WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
            borderRadius: '18px 18px 0 0',
            padding: `10px 18px calc(76px + env(safe-area-inset-bottom, 0px))`,
            animation: 'siriSlideUp 0.28s cubic-bezier(0.25,0.46,0.45,0.94)',
          }}>
            {/* Status */}
            <div style={{ textAlign: 'center', marginBottom: 10 }}>
              <span style={{
                fontSize: 15, fontWeight: 600,
                color: micState === 'listening' ? 'rgba(255,255,255,0.92)' : micState === 'processing' ? 'rgba(255,255,255,0.45)' : '#30d158',
              }}>
                {micState === 'listening' ? 'Listening…' : micState === 'processing' ? 'Thinking…' : lastReply}
              </span>
            </div>
            {/* Wave bars */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 38 }}>
              {WAVE_COLS.map((color, i) => (
                <div key={i} style={{
                  width: 4, height: 38, borderRadius: 2,
                  background: micState === 'done' ? '#30d158' : color,
                  transformOrigin: 'center',
                  transform: micState === 'done' ? 'scaleY(0.12)' : undefined,
                  animation: micState === 'listening'
                    ? `siriWave ${WAVE_DURS[i]}s ${WAVE_DELS[i]}s ease-in-out infinite`
                    : micState === 'processing'
                      ? `siriIdle 1.8s ${WAVE_DELS[i] * 2}s ease-in-out infinite`
                      : 'none',
                }} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Mic button — Siri-style orb */}
      <button
        onClick={micState === 'idle' ? startRecording : cancel}
        style={{
          position: 'fixed', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)', left: 16, zIndex: 9999,
          width: 56, height: 56, borderRadius: 28, border: 'none',
          background: 'linear-gradient(135deg, #ff9500 0%, #ff2d78 50%, #af52de 100%)',
          color: '#fff', fontSize: 24, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(175,82,222,0.5)',
          animation: micState === 'listening' ? 'siriOrb 1s ease-in-out infinite, siriOrbSpin 3s linear infinite' : 'none',
          transition: 'transform 0.15s',
          transform: micState !== 'idle' ? 'scale(1.08)' : 'scale(1)',
        }}
      >
        🎤
      </button>
    </>,
    document.body,
  )
}

// ─── Layout for authenticated pages ───────────────────────────────────────────

function AuthLayout() {
  const { token, wsConnected } = useHa()
  if (!token) return <LoginPage />
  return (
    <>
      {!wsConnected && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9980,
          background: '#ff453a', color: '#fff', fontSize: 12, fontWeight: 600,
          textAlign: 'center', padding: '4px 0', letterSpacing: 0.2,
        }}>
          ⚡ Reconnecting…
        </div>
      )}
      <div style={{ position: 'absolute', inset: 0, top: wsConnected ? 0 : 22, bottom: 'var(--tab-h)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Suspense fallback={<div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontSize: 14 }}>Loading…</div>}>
          <Routes>
            <Route index element={<Navigate to="integrations" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="entities" element={<EntitiesPage />} />
            <Route path="floorplan" element={<FloorPlanPage />} />
            <Route path="userpanel" element={<FloorPlan2DPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="automations" element={<AutomationsPage />} />
            <Route path="areas" element={<AreasPage />} />
            <Route path="integrations" element={<IntegrationsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="geofence" element={<GeofencePage />} />
            <Route path="ota" element={<OtaPage />} />
            <Route path="persons" element={<PersonsPage />} />
            <Route path="energy" element={<EnergyPage />} />
            <Route path="thermostat" element={<ThermostatPage />} />
            <Route path="scenes" element={<ScenesPage />} />
            <Route path="security" element={<SecurityPage />} />
          </Routes>
        </Suspense>
      </div>
      <TabBar />
    </>
  )
}

// ─── RTI full panel ───────────────────────────────────────────────────────────

function RtiPanel() {
  const t = getToken()
  return (
    <HaProvider>
      <ToastProvider>
        <CommProvider>
          <Suspense fallback={<div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', color: '#666' }}>Loading…</div>}>
            <RtiPanelPage standaloneToken={t} />
          </Suspense>
          <FloatingMic />
          <CommPanel />
          <DoorbellOverlay />
        </CommProvider>
      </ToastProvider>
    </HaProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/panel" element={<RtiPanel />} />
        <Route path="/3d"          element={<Navigate to="/panel" replace />} />
        <Route path="/rti3d"       element={<Navigate to="/panel" replace />} />
        <Route path="/2d"          element={<Navigate to="/panel" replace />} />
        <Route path="/*" element={
          <HaProvider>
            <ToastProvider>
              <CommProvider>
                <AuthLayout />
                <CommPanel />
                <DoorbellOverlay />
              </CommProvider>
            </ToastProvider>
          </HaProvider>
        } />
      </Routes>
    </BrowserRouter>
  )
}
