import { useState } from 'react'
import { HaProvider, useHa } from './context/HaContext'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import EntitiesPage from './pages/EntitiesPage'
import AutomationsPage from './pages/AutomationsPage'
import SettingsPage from './pages/SettingsPage'
import TabBar from './components/TabBar'

type Tab = 'dashboard' | 'entities' | 'automations' | 'settings'

function AppInner() {
  const { token } = useHa()
  const [tab, setTab] = useState<Tab>('dashboard')

  if (!token) return <LoginPage />

  return (
    <>
      {tab === 'dashboard'    && <DashboardPage />}
      {tab === 'entities'     && <EntitiesPage />}
      {tab === 'automations'  && <AutomationsPage />}
      {tab === 'settings'     && <SettingsPage />}
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
