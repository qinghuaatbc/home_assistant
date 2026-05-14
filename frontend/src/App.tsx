import { useState, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { HaProvider, useHa } from './context/HaContext'
import { getLang } from './utils/sounds'
import { ToastProvider } from './context/ToastContext'
import LoginPage from './pages/LoginPage'
import TabBar from './components/TabBar'
import AiChatPanel from './components/AiChatPanel'

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
const RtiPanelPage     = lazy(() => import('./pages/RtiPanelPage'))

function getToken(): string {
  return new URLSearchParams(window.location.search).get('token') || localStorage.getItem('ha_token') || ''
}

// ─── Global AI button — persistent across all pages ───────────────────────────

function FloatingAiButton({ rightEdge = 6 }: { rightEdge?: number }) {
  const [open, setOpen] = useState(false)
  const l = (en: string, zh: string, fa: string) => {
    const lang = getLang()
    return lang === 'zh' ? zh : lang === 'fa' ? fa : en
  }
  return createPortal(
    <>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 16, right: rightEdge, zIndex: 9999,
          width: 44, height: 44, borderRadius: 22, border: 'none',
          background: open ? '#ff453a' : 'rgba(210,140,0,0.88)', color: '#fff',
          fontSize: 18, cursor: 'pointer', boxShadow: '0 4px 16px rgba(210,140,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.2s',
        }}
        title={open ? l('Close AI', '关闭 AI', 'بستن AI') : l('Open AI', '打开 AI', 'باز کردن AI')}
      >
        {open ? '✕' : '✦'}
      </button>
      <div style={{ display: open ? 'block' : 'none', pointerEvents: open ? 'auto' : 'none' }}>
        <AiChatPanel onClose={() => setOpen(false)} rightEdge={rightEdge + 10} />
      </div>
    </>,
    document.body,
  )
}

// ─── Layout for authenticated pages ───────────────────────────────────────────

function AuthLayout() {
  const { token } = useHa()
  if (!token) return <LoginPage />
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, bottom: 'var(--tab-h)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Suspense fallback={<div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontSize: 14 }}>Loading…</div>}>
          <Routes>
            <Route index element={<DashboardPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="entities" element={<EntitiesPage />} />
            <Route path="floorplan" element={<FloorPlanPage />} />
            <Route path="floorplan2d" element={<FloorPlan2DPage />} />
            <Route path="app/floorplan" element={<FloorPlanPage />} />
            <Route path="app/floorplan2d" element={<FloorPlan2DPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="automations" element={<AutomationsPage />} />
            <Route path="areas" element={<AreasPage />} />
            <Route path="integrations" element={<IntegrationsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Routes>
        </Suspense>
      </div>
      <TabBar />
    </>
  )
}

// ─── RTI full panel (3D/2D + categories) — primary entry point ────────────────

function RtiPanel() {
  const t = getToken()
  if (t) localStorage.setItem('ha_token', t)
  return (
    <HaProvider>
      <ToastProvider>
        <Suspense fallback={<div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', color: '#666' }}>Loading…</div>}>
          <RtiPanelPage standaloneToken={t} />
        </Suspense>
        <FloatingAiButton rightEdge={60} />
      </ToastProvider>
    </HaProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Primary panel entry point */}
        <Route path="/panel"       element={<RtiPanel />} />

        {/* All legacy routes redirect to panel */}
        <Route path="/3d"          element={<Navigate to="/panel" replace />} />
        <Route path="/rti3d"       element={<Navigate to="/panel" replace />} />
        <Route path="/2d"          element={<Navigate to="/panel" replace />} />
        <Route path="/floorplan"   element={<Navigate to="/panel" replace />} />
        <Route path="/floorplan2d" element={<Navigate to="/panel" replace />} />

        {/* Full app with auth + tab bar */}
        <Route path="/*" element={
          <HaProvider>
            <ToastProvider>
              <AuthLayout />
              <FloatingAiButton />
            </ToastProvider>
          </HaProvider>
        } />
      </Routes>
    </BrowserRouter>
  )
}
