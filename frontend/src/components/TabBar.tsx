import { useNavigate, useLocation } from 'react-router-dom'

const TABS = [
  { id: 'dashboard',    icon: '⊞',  label: 'Home'    },
  { id: 'entities',     icon: '⚙️',  label: 'Devices' },
  { id: 'floorplan',    icon: '🏠',  label: '3D'      },
  { id: 'floorplan2d',  icon: '🗺️',  label: '2D'      },
  { id: 'history',      icon: '📊',  label: 'History' },
  { id: 'events',       icon: '📋',  label: 'Events'  },
  { id: 'automations',  icon: '⚡',  label: 'Auto'    },
  { id: 'areas',        icon: '🏠',  label: 'Areas'   },
  { id: 'integrations', icon: '🔌',  label: 'Integ'   },
  { id: 'settings',     icon: '☰',  label: 'More'    },
]

export default function TabBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const current = location.pathname.replace('/app/', '') || ''
  return (
    <nav className="tab-bar" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`tab-item ${current === t.id || current.replace('/','') === t.id ? 'active' : ''}`}
          onClick={() => navigate(t.id === 'floorplan' || t.id === 'floorplan2d' ? '/app/' + t.id : '/' + t.id)}
          style={{ flex: '0 0 auto', padding: '6px 10px' }}
        >
          <span className="tab-icon">{t.icon}</span>
          <span className="tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
