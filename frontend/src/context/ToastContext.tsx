import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

interface ToastCtx {
  toast: (message: string, type?: Toast['type']) => void
}

const Ctx = createContext<ToastCtx>({ toast: () => {} })

export function useToast() { return useContext(Ctx) }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([])

  const add = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Date.now()
    setList(prev => [...prev, { id, message, type }])
    setTimeout(() => setList(prev => prev.filter(t => t.id !== id)), 3000)
  }, [])

  return (
    <Ctx.Provider value={{ toast: add }}>
      {children}
      <div style={{ position: 'fixed', top: 60, right: 12, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'none' }}>
        {list.map(t => (
          <div key={t.id} style={{
            padding: '10px 16px', borderRadius: 8, fontSize: 13,
            background: t.type === 'error' ? '#ff453a' : t.type === 'success' ? '#30d158' : '#4d8fff',
            color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            animation: 'slideIn 0.2s ease',
            maxWidth: 300,
          }}>{t.message}</div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
