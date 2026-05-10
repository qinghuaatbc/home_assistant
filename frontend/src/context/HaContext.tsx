import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react'
import { io, Socket } from 'socket.io-client'

export interface HaState {
  entity_id: string
  state: string
  attributes: Record<string, unknown>
  last_changed: string
  last_updated: string
}

interface HaHealth {
  status: string
  uptime: number
}

interface HaCtx {
  token: string | null
  login: (username: string, password: string) => Promise<string | null>
  logout: () => void
  wsConnected: boolean
  health: HaHealth | null
  states: Map<string, HaState>
  callService: (domain: string, service: string, data?: Record<string, unknown>, entityId?: string | string[]) => Promise<{ success: boolean; error?: string }>
  setEntityState: (entityId: string, state: string, attributes?: Record<string, unknown>) => Promise<void>
}

const Ctx = createContext<HaCtx | null>(null)

export function useHa() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useHa must be used inside HaProvider')
  return ctx
}

export function HaProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('ha_token'))
  const [wsConnected, setWsConnected] = useState(false)
  const [health, setHealth] = useState<HaHealth | null>(null)
  const [states, setStates] = useState<Map<string, HaState>>(new Map())
  const wsRef = useRef<Socket | null>(null)
  const cmdId = useRef(1)

  const applyTheme = (t: string) => {
    if (t === 'light') document.documentElement.classList.add('light')
    else document.documentElement.classList.remove('light')
  }

  // Apply saved theme on mount
  useEffect(() => {
    applyTheme(localStorage.getItem('ha_theme') || 'dark')
  }, [])

  const login = useCallback(async (username: string, password: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) return (await res.json())?.message ?? 'Login failed'
      const { access_token } = await res.json()
      localStorage.setItem('ha_token', access_token)
      setToken(access_token)
      return null
    } catch {
      return 'Network error'
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('ha_token')
    setToken(null)
    setStates(new Map())
    wsRef.current?.disconnect()
    wsRef.current = null
  }, [])

  const callService = useCallback(async (
    domain: string,
    service: string,
    data: Record<string, unknown> = {},
    entityId?: string | string[],
  ): Promise<{ success: boolean; error?: string }> => {
    if (!wsRef.current || !token) return { success: false, error: 'Not connected' }
    const id = cmdId.current++
    return new Promise(resolve => {
      const handler = (msg: any) => {
        if (msg.id === id && msg.type === 'result') {
          wsRef.current?.off('message', handler)
          resolve({ success: msg.success !== false, error: msg.error?.message })
        }
      }
      wsRef.current?.on('message', handler)
      wsRef.current?.emit('message', {
        id,
        type: 'call_service',
        domain,
        service,
        service_data: data,
        target: entityId ? { entity_id: entityId } : undefined,
      })
      setTimeout(() => { wsRef.current?.off('message', handler); resolve({ success: false, error: 'Timeout' }) }, 10000)
    })
  }, [token])

  const setEntityState = useCallback(async (
    entityId: string,
    state: string,
    attributes: Record<string, unknown> = {},
  ) => {
    if (!token) return
    const current = states.get(entityId)
    await fetch(`/api/states/${entityId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ state, attributes: { ...current?.attributes, ...attributes } }),
    })
  }, [token, states])

  // Poll health endpoint
  useEffect(() => {
    if (!token) return
    const fetchHealth = () => fetch('/api/health').then(r => r.json()).then(setHealth).catch(() => {})
    fetchHealth()
    const timer = setInterval(fetchHealth, 30000)
    return () => clearInterval(timer)
  }, [token])

  // Connect WebSocket when token is available
  useEffect(() => {
    if (!token) return

    const socket = io('/', {
      path: '/api/websocket',
      transports: ['websocket'],
      reconnectionDelay: 2000,
    })
    wsRef.current = socket

    socket.on('message', (msg: { type: string; result?: HaState[]; event?: { data?: { entity_id?: string; new_state?: HaState } } }) => {
      if (msg.type === 'auth_required') {
        socket.emit('message', { type: 'auth', access_token: token })
      }

      if (msg.type === 'auth_invalid') {
        // Token expired or invalid — force re-login
        socket.disconnect()
        localStorage.removeItem('ha_token')
        setToken(null)
        setWsConnected(false)
        setStates(new Map())
      }

      if (msg.type === 'auth_ok') {
        setWsConnected(true)
        // Load all states
        socket.emit('message', { id: cmdId.current++, type: 'get_states' })
        // Subscribe to state_changed
        socket.emit('message', { id: cmdId.current++, type: 'subscribe_events', event_type: 'state_changed' })
      }

      if (msg.type === 'result' && Array.isArray(msg.result)) {
        setStates(new Map(msg.result.map((s) => [s.entity_id, s])))
      }

      if (msg.type === 'event' && msg.event?.data) {
        const { entity_id, new_state } = msg.event.data
        if (entity_id && new_state) {
          setStates((prev) => {
            const next = new Map(prev)
            next.set(entity_id, new_state)
            return next
          })
        }
      }
    })

    socket.on('disconnect', () => setWsConnected(false))
    socket.on('connect_error', () => setWsConnected(false))

    return () => {
      socket.disconnect()
      wsRef.current = null
      setWsConnected(false)
    }
  }, [token])

  return (
    <Ctx.Provider value={{ token, login, logout, wsConnected, health, states, callService, setEntityState }}>
      {children}
    </Ctx.Provider>
  )
}
