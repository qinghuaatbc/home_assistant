interface Props {
  current: string
  onChange: (tab: string) => void
}

const TABS = [
  { id: 'dashboard',   icon: '⊞',  label: 'Home'    },
  { id: 'entities',    icon: '⚙️',  label: 'Devices' },
  { id: 'floorplan',   icon: '🏠',  label: '3D'      },
  { id: 'history',     icon: '📊',  label: 'History' },
  { id: 'events',      icon: '📋',  label: 'Events'  },
  { id: 'automations', icon: '⚡',  label: 'Auto'    },
  { id: 'settings',    icon: '☰',  label: 'More'    },
]

export default function TabBar({ current, onChange }: Props) {
  return (
    <nav className="tab-bar" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`tab-item ${current === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
          style={{ flex: '0 0 auto', padding: '6px 10px' }}
        >
          <span className="tab-icon">{t.icon}</span>
          <span className="tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
