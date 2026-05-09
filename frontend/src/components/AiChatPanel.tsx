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
    <>
      <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 9998 }} />
      <div style={{
        position: 'fixed', bottom: 80, right: 16, width: 360, maxWidth: 'calc(100vw - 32px)',
        background: 'var(--card)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        zIndex: 9999, display: 'flex', flexDirection: 'column', maxHeight: '70vh', overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>✦ AI</span>
          <button onClick={onClose} className="modal-close" style={{ fontSize: 16 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '2rem 0', fontSize: 12 }}>
              Ask about your home —<br />"what's on?" "turn off lights"
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%',
              padding: '8px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.4,
              background: m.role === 'user' ? '#4d8fff' : 'var(--surface2)',
              color: m.role === 'user' ? '#fff' : 'var(--text)',
            }}>{m.text}</div>
          ))}
          {loading && <div style={{ alignSelf: 'flex-start', padding: '8px 12px', fontSize: 13, color: 'var(--text2)' }}>Thinking…</div>}
          <div ref={bottomRef} />
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
          <input ref={inputRef} value={prompt} onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Ask AI…" style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
            disabled={loading || !token} />
          <button className="btn btn-accent" onClick={send} disabled={loading || !prompt.trim()}
            style={{ fontSize: 12, padding: '8px 12px' }}>→</button>
        </div>
      </div>
    </>
  )
}
