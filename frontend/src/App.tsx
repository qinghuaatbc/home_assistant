import { useState, lazy, Suspense } from 'react'
import { HaProvider, useHa } from './context/HaContext'
import { ToastProvider } from './context/ToastContext'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import EntitiesPage from './pages/EntitiesPage'
import SettingsPage from './pages/SettingsPage'
import TabBar from './components/TabBar'
import AiChatPanel from './components/AiChatPanel'

const FloorPlanPage = lazy(() => import('./pages/FloorPlanPage'))
const AutomationsPage = lazy(() => import('./pages/AutomationsPage'))
const EventsPage = lazy(() => import('./pages/EventsPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const AreasPage = lazy(() => import('./pages/AreasPage'))
const IntegrationsPage = lazy(() => import('./pages/IntegrationsPage'))

type Tab = 'dashboard' | 'entities' | 'floorplan' | 'history' | 'events' | 'automations' | 'areas' | 'integrations' | 'settings'

function AppInner() {
  const { token } = useHa()
  const [tab, setTab] = useState<Tab>('dashboard')
  const [aiOpen, setAiOpen] = useState(false)
  const [hideTabBar, setHideTabBar] = useState(false)

  // Check for standalone 3D floorplan route
  const isFloorplanRoute = window.location.pathname === '/floorplan' || window.location.pathname === '/3d'
  const urlToken = new URLSearchParams(window.location.search).get('token')

  if (isFloorplanRoute && (token || urlToken)) {
    return <FloorPlanPage fullscreen={true} onFullscreenChange={() => {}} standaloneToken={urlToken || token} />
  }

  if (!token) return <LoginPage />

  const page = (el: React.ReactNode) =>
    <Suspense fallback={<div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontSize: 14 }}>Loading…</div>}>{el}</Suspense>

  return (
    <>
      {tab === 'dashboard' && page(<DashboardPage />)}
      {tab === 'entities' && page(<EntitiesPage />)}
      {tab === 'floorplan' && page(<FloorPlanPage fullscreen={hideTabBar} onFullscreenChange={setHideTabBar} />)}
      {tab === 'history' && page(<HistoryPage />)}
      {tab === 'events' && page(<EventsPage />)}
      {tab === 'automations' && page(<AutomationsPage />)}
      {tab === 'areas' && page(<AreasPage />)}
      {tab === 'integrations' && page(<IntegrationsPage />)}
      {tab === 'settings' && page(<SettingsPage />)}
      {!hideTabBar && <TabBar current={tab} onChange={(t) => setTab(t as Tab)} />}

      <button onClick={() => setAiOpen(!aiOpen)}
        style={{
          position: 'fixed', bottom: 80, right: 16, zIndex: 9997,
          width: 44, height: 44, borderRadius: 22, border: 'none',
          background: aiOpen ? '#ff453a' : '#4d8fff', color: '#fff',
          fontSize: 18, cursor: 'pointer', boxShadow: '0 4px 16px rgba(77,143,255,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title={aiOpen ? 'Close AI' : 'Open AI'}>
        {aiOpen ? '✕' : '✦'}
      </button>

      {aiOpen && <AiChatPanel onClose={() => setAiOpen(false)} />}
    </>
  )
}

export default function App() {
  return (
    <HaProvider>
      <ToastProvider>
        <AppInner />
      </ToastProvider>
    </HaProvider>
  )
}
