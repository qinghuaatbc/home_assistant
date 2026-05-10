import { useState, useRef, useEffect } from 'react'
import { useHa } from '../context/HaContext'

export default function AiChatPanel({ onClose }: { onClose: () => void }) {
  const { token } = useHa()
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([])
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { if (inputRef.current) inputRef.current.focus() }, [])
  useEffect(() => {
    const html = document.documentElement
    const origOverflow = html.style.overflow
    const origHeight = html.style.height
    const scrollY = window.scrollY
    html.style.overflow = 'hidden'
    html.style.height = '100vh'
    return () => { html.style.overflow = origOverflow; html.style.height = origHeight; window.scrollTo(0, scrollY) }
  }, [])

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
    } catch { setMessages(prev => [...prev, { role: 'assistant', text: 'Error' }]) }
    setLoading(false)
  }

  return (
    <div style={{
      position: 'fixed', bottom: 70, right: 16, width: 260,
      background: '#1c1c1e', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      zIndex: 9999, display: 'flex', flexDirection: 'column', maxHeight: 320, overflow: 'hidden',
      border: '1px solid #333',
    }} onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #333' }}>
        <span style={{ fontWeight: 600, fontSize: 12, color: '#fff' }}>✦ AI</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 100 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#888', padding: '1.5rem 0', fontSize: 12 }}>
            Ask about your home<br/>"turn on lights"
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%',
            padding: '6px 10px', borderRadius: 8, fontSize: 12, lineHeight: 1.4,
            background: m.role === 'user' ? '#4d8fff' : '#2c2c2e',
            color: '#fff',
          }}>{m.text}</div>
        ))}
        {loading && <div style={{ alignSelf: 'flex-start', padding: '6px 10px', fontSize: 12, color: '#888' }}>Thinking…</div>}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: 'flex', gap: 4, padding: '4px 6px', borderTop: '1px solid #333', alignItems: 'center' }}>
        <input ref={inputRef} value={prompt} onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Ask AI…" style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #555', background: '#222', color: '#fff', fontSize: 16, minWidth: 0 }}
          disabled={loading || !token} />
        <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }}
          onClick={send} disabled={loading || !prompt.trim()}>Send</button>
      </div>
    </div>
  )
}
