import { useState, lazy, Suspense } from 'react'
import { HaProvider, useHa } from './context/HaContext'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import EntitiesPage from './pages/EntitiesPage'
import SettingsPage from './pages/SettingsPage'
import TabBar from './components/TabBar'

const FloorPlanPage = lazy(() => import('./pages/FloorPlanPage'))
const AutomationsPage = lazy(() => import('./pages/AutomationsPage'))
const EventsPage = lazy(() => import('./pages/EventsPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))

type Tab = 'dashboard' | 'entities' | 'floorplan' | 'history' | 'events' | 'automations' | 'settings'

function AppInner() {
  const { token } = useHa()
  const [tab, setTab] = useState<Tab>('dashboard')

  if (!token) return <LoginPage />

  const page = (el: React.ReactNode) =>
    <Suspense fallback={<div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontSize: 14 }}>Loading…</div>}>{el}</Suspense>

  return (
    <>
      {tab === 'dashboard' && page(<DashboardPage />)}
      {tab === 'entities' && page(<EntitiesPage />)}
      {tab === 'floorplan' && page(<FloorPlanPage />)}
      {tab === 'history' && page(<HistoryPage />)}
      {tab === 'events' && page(<EventsPage />)}
      {tab === 'automations' && page(<AutomationsPage />)}
      {tab === 'settings' && page(<SettingsPage />)}
      <TabBar current={tab} onChange={(t) => setTab(t as Tab)} />
    </>
  )
}

export default function App() {
  return (
    <HaProvider>
      <AppInner />
    </HaProvider>
  )
}
