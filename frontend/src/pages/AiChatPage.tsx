import { useState, useRef, useEffect } from 'react'
import { useHa } from '../context/HaContext'

interface Message {
  role: 'user' | 'assistant'
  text: string
}

export default function AiChatPage() {
  const { token } = useHa()
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const text = prompt.trim()
    if (!text || loading) return
    setPrompt('')
    setMessages(prev => [...prev, { role: 'user', text }])
    setLoading(true)

    try {
      const r = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ prompt: text }),
      })
      const data = await r.json()
      setMessages(prev => [...prev, { role: 'assistant', text: data.response || data.hint || 'No response' }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Network error' }])
    }
    setLoading(false)
  }

  return (
    <div className="page">
      <div className="page-inner" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
        <div className="nav-header">
          <div className="nav-title">AI Assistant</div>
          {!token && <div style={{ fontSize: 11, color: 'var(--orange)' }}>Login required</div>}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '3rem 1rem', fontSize: 13, lineHeight: 1.8 }}>
              Ask about your home.<br />
              <span style={{ fontSize: 11 }}>e.g. "What's the temperature?" or "Turn on all lights"</span>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%', padding: '10px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.5,
              background: m.role === 'user' ? '#4d8fff' : 'var(--card)',
              color: m.role === 'user' ? '#fff' : 'var(--text)',
              borderBottomRightRadius: m.role === 'user' ? 4 : 12,
              borderBottomLeftRadius: m.role === 'user' ? 12 : 4,
            }}>{m.text}</div>
          ))}
          {loading && (
            <div style={{ alignSelf: 'flex-start', padding: '10px 14px', borderRadius: 12, background: 'var(--card)', fontSize: 13, color: 'var(--text2)' }}>
              Thinking…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '8px 0' }}>
          <input value={prompt} onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="Ask about your home…"
            style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13 }}
            disabled={loading || !token} />
          <button className="btn btn-accent" onClick={send} disabled={loading || !prompt.trim() || !token}
            style={{ fontSize: 13, padding: '10px 16px' }}>Send</button>
        </div>
      </div>
    </div>
  )
}
