import { useState, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { HaProvider, useHa } from './context/HaContext'
import { getLang } from './utils/sounds'
import { ToastProvider } from './context/ToastContext'
import LoginPage from './pages/LoginPage'
import TabBar from './components/TabBar'
import AiChatPanel from './components/AiChatPanel'

const DashboardPage   = lazy(() => import('./pages/DashboardPage'))
const EntitiesPage    = lazy(() => import('./pages/EntitiesPage'))
const FloorPlanPage   = lazy(() => import('./pages/FloorPlanPage'))
const FloorPlan2DPage = lazy(() => import('./pages/FloorPlan2DPage'))
const AutomationsPage = lazy(() => import('./pages/AutomationsPage'))
const EventsPage      = lazy(() => import('./pages/EventsPage'))
const HistoryPage     = lazy(() => import('./pages/HistoryPage'))
const AreasPage       = lazy(() => import('./pages/AreasPage'))
const IntegrationsPage = lazy(() => import('./pages/IntegrationsPage'))
const SettingsPage    = lazy(() => import('./pages/SettingsPage'))

const DEMO_TOKEN = 'bd811f7d72f5e7010b1712cf6e4c44dd891ca20ee452e0c6cf8eec2b2ee596af'

function getToken(): string {
  return new URLSearchParams(window.location.search).get('token') || localStorage.getItem('ha_token') || DEMO_TOKEN
}

// Layout for authenticated pages with TabBar
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

// Standalone floorplan (no TabBar, uses URL/localStorage token)
function StandaloneFloorPlan() {
  const t = getToken()
  localStorage.setItem('ha_token', t)
  return (
    <HaProvider>
      <ToastProvider>
        <FloorPlanPage fullscreen={true} onFullscreenChange={() => {}} standaloneToken={t} />
        <FloatingAiButton />
      </ToastProvider>
    </HaProvider>
  )
}

function StandaloneFloorPlan2D() {
  const t = getToken()
  localStorage.setItem('ha_token', t)
  return (
    <HaProvider>
      <ToastProvider>
        <FloorPlan2DPage fullscreen={true} standaloneToken={t} />
        <FloatingAiButton />
      </ToastProvider>
    </HaProvider>
  )
}

function FloatingAiButton() {
  const [open, setOpen] = useState(false)
  const l = (en: string, zh: string, fa: string) => {
    const lang = getLang()
    return lang === 'zh' ? zh : lang === 'fa' ? fa : en
  }
  return createPortal(
    <>
      <button onClick={() => setOpen(!open)}
        style={{
          position: 'fixed', bottom: 200, right: 16, zIndex: 9999,
          width: 44, height: 44, borderRadius: 22, border: 'none',
          background: open ? '#ff453a' : '#4d8fff', color: '#fff',
          fontSize: 18, cursor: 'pointer', boxShadow: '0 4px 16px rgba(77,143,255,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title={open ? l('Close AI', '关闭 AI', 'بستن AI') : l('Open AI', '打开 AI', 'باز کردن AI')}>
        {open ? '✕' : '✦'}
      </button>
      {open && <AiChatPanel onClose={() => setOpen(false)} />}
    </>,
    document.body,
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/3d" element={<StandaloneFloorPlan />} />
        <Route path="/2d" element={<StandaloneFloorPlan2D />} />
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
