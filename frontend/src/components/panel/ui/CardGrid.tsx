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

export function SkeletonCard() {
  const th = useTh()
  const base = th === 'day' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'
  const shine = th === 'day' ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.12)'
  return (
    <div style={{
      borderRadius: 14, minHeight: 92,
      background: `linear-gradient(90deg, ${base} 25%, ${shine} 50%, ${base} 75%)`,
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s ease-in-out infinite',
      border: th === 'day' ? '1px solid rgba(255,255,255,0.7)' : '1px solid rgba(255,255,255,0.08)',
    }} />
  )
}

export function SkeletonGrid({ cols, count = 8 }: { cols: number; count?: number }) {
  return (
    <CardGrid cols={cols}>
      {Array.from({ length: count }, (_, i) => <SkeletonCard key={i} />)}
    </CardGrid>
  )
}
