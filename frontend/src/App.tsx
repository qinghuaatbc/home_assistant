import { useState, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { HaProvider, useHa } from './context/HaContext'
import { ToastProvider } from './context/ToastContext'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import EntitiesPage from './pages/EntitiesPage'
import SettingsPage from './pages/SettingsPage'
import TabBar from './components/TabBar'
import AiChatPanel from './components/AiChatPanel'

const FloorPlanPage = lazy(() => import('./pages/FloorPlanPage'))
const FloorPlan2DPage = lazy(() => import('./pages/FloorPlan2DPage'))
const AutomationsPage = lazy(() => import('./pages/AutomationsPage'))
const EventsPage = lazy(() => import('./pages/EventsPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const AreasPage = lazy(() => import('./pages/AreasPage'))
const IntegrationsPage = lazy(() => import('./pages/IntegrationsPage'))

type Tab = 'dashboard' | 'entities' | 'floorplan' | 'floorplan2d' | 'history' | 'events' | 'automations' | 'areas' | 'integrations' | 'settings'

function AppInner() {
  const { token } = useHa()
  const [tab, setTab] = useState<Tab>('dashboard')
  const [hideTabBar, setHideTabBar] = useState(false)

  // Standalone 3D/2D floorplan routes — uses token from URL param or localStorage
  const isFloorplanRoute = window.location.pathname === '/floorplan' || window.location.pathname === '/3d'
  const isFloorplan2DRoute = window.location.pathname === '/floorplan2d' || window.location.pathname === '/2d'
  const DEMO_TOKEN = '4e850946782c1e214827ba1ed5b18f33dcaca0182b8c13f66bd823b3b42fabce'
  const urlToken = new URLSearchParams(window.location.search).get('token') || localStorage.getItem('ha_token') || DEMO_TOKEN

  if (isFloorplanRoute) {
    localStorage.setItem('ha_token', urlToken)
    return (
      <HaProvider>
        <ToastProvider>
          <FloorPlanPage fullscreen={true} onFullscreenChange={() => {}} standaloneToken={urlToken} />
          <FloatingAiButton />
        </ToastProvider>
      </HaProvider>
    )
  }

  if (isFloorplan2DRoute) {
    localStorage.setItem('ha_token', urlToken)
    return (
      <HaProvider>
        <ToastProvider>
          <FloorPlan2DPage fullscreen={true} standaloneToken={urlToken} />
          <FloatingAiButton />
        </ToastProvider>
      </HaProvider>
    )
  }

  if (!token) return <LoginPage />

  const page = (el: React.ReactNode) =>
    <Suspense fallback={<div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontSize: 14 }}>Loading…</div>}>{el}</Suspense>

  return (
    <>
      {tab === 'dashboard' && page(<DashboardPage />)}
      {tab === 'entities' && page(<EntitiesPage />)}
      {tab === 'floorplan' && page(<FloorPlanPage fullscreen={hideTabBar} onFullscreenChange={setHideTabBar} />)}
      {tab === 'floorplan2d' && page(<FloorPlan2DPage fullscreen={hideTabBar} onFullscreenChange={setHideTabBar} />)}
      {tab === 'history' && page(<HistoryPage />)}
      {tab === 'events' && page(<EventsPage />)}
      {tab === 'automations' && page(<AutomationsPage />)}
      {tab === 'areas' && page(<AreasPage />)}
      {tab === 'integrations' && page(<IntegrationsPage />)}
      {tab === 'settings' && page(<SettingsPage />)}
      {!hideTabBar && <TabBar current={tab} onChange={(t) => setTab(t as Tab)} />}
    </>
  )
}

function FloatingAiButton() {
  const [open, setOpen] = useState(false)
  return createPortal(
    <>
      <button onClick={() => setOpen(!open)}
        style={{
          position: 'fixed', bottom: 140, right: 16, zIndex: 9999,
          width: 44, height: 44, borderRadius: 22, border: 'none',
          background: open ? '#ff453a' : '#4d8fff', color: '#fff',
          fontSize: 18, cursor: 'pointer', boxShadow: '0 4px 16px rgba(77,143,255,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title={open ? 'Close AI' : 'Open AI'}>
        {open ? '✕' : '✦'}
      </button>
      {open && <AiChatPanel onClose={() => setOpen(false)} />}
    </>,
    document.body,
  )
}

export default function App() {
  return (
    <HaProvider>
      <ToastProvider>
        <AppInner />
        <FloatingAiButton />
      </ToastProvider>
    </HaProvider>
  )
}
