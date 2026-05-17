import { useNavigate, useLocation } from 'react-router-dom'

const TABS = [
  { id: 'dashboard',    icon: '⊞',  label: 'Home'    },
  { id: 'entities',     icon: '⚙️',  label: 'Devices' },
  { id: 'floorplan',    icon: '🏠',  label: '3D'      },
  { id: 'userpanel',    icon: '🎛️',  label: 'Panel'   },
  { id: 'history',      icon: '📊',  label: 'History' },
  { id: 'automations',  icon: '⚡',  label: 'Auto'    },
  { id: 'integrations', icon: '🔌',  label: 'Config'  },
  { id: 'notifications', icon: '🔔',  label: 'Alerts'  },
  { id: 'geofence',     icon: '📍',  label: 'Zones'   },
  { id: 'persons',      icon: '👥',  label: 'People'  },
  { id: 'energy',       icon: '⚡',  label: 'Energy'  },
  { id: 'thermostat',   icon: '🌡️',  label: 'Climate' },
  { id: 'scenes',       icon: '🎬',  label: 'Scenes'  },
  { id: 'security',     icon: '📷',  label: 'Security'},
  { id: 'codeanalysis', icon: '🔍',  label: 'Code'    },
  { id: 'settings',     icon: '☰',  label: 'More'    },
]

export default function TabBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const current = location.pathname.replace('/app/', '') || ''
  return (
    <nav className="tab-bar">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`tab-item ${current === t.id || current.replace('/','') === t.id ? 'active' : ''}`}
          onClick={() => navigate('/' + t.id)}
        >
          <span className="tab-icon">{t.icon}</span>
          <span className="tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
