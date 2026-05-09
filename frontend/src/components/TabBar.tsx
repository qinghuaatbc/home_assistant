interface Props {
  current: string
  onChange: (tab: string) => void
}

const TABS = [
  { id: 'dashboard',   icon: '⊞',  label: 'Home'       },
  { id: 'entities',    icon: '⚙️',  label: 'Devices'    },
  { id: 'floorplan',   icon: '🏠',  label: '3D Plan'    },
  { id: 'events',      icon: '📋',  label: 'Events'     },
  { id: 'settings',    icon: '☰',  label: 'More'       },
]

export default function TabBar({ current, onChange }: Props) {
  return (
    <nav className="tab-bar">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`tab-item ${current === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          <span className="tab-icon">{t.icon}</span>
          <span className="tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
