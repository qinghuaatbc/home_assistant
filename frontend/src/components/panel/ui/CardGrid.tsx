import React from 'react'
import { type Cat, useT, useTh, tc2 } from '../PanelContext'

export function CardGrid({ children, cols }: { children: React.ReactNode; cols: number }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 8,
      padding: '8px 8px', alignContent: 'start', minHeight: '100%',
    }}>{children}</div>
  )
}

export function EmptyState({ icon, cat }: { icon: string; cat: Cat }) {
  const t = useT(); const th = useTh()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, opacity: 0.4 }}>
      <span style={{ fontSize: 40 }}>{icon}</span>
      <span style={{ fontSize: 13, color: tc2(th) }}>{t.cats[cat]}</span>
    </div>
  )
}
