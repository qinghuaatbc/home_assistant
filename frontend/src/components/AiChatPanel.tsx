import { useState, useRef, useEffect, useCallback } from 'react'
import { useHa } from '../context/HaContext'
import { getLang, setLang } from '../utils/sounds'

type Lang = 'en' | 'zh' | 'fa'

const T: Record<Lang, { placeholder: string; send: string; thinking: string; noResponse: string; error: string;
  hint: string; langLabel: string; recording: string; processing: string; noMic: string }> = {
  en: {
    placeholder: 'Ask AI…', send: 'Send', thinking: 'Thinking…', noResponse: 'No response',
    error: 'Error', hint: 'Ask about your home', langLabel: 'EN',
    recording: 'Recording…', processing: 'Processing…', noMic: 'Mic',
  },
  zh: {
    placeholder: '问 AI…', send: '发送', thinking: '思考中…', noResponse: '无回复',
    error: '错误', hint: '询问您的家', langLabel: '中文',
    recording: '录音中…', processing: '处理中…', noMic: '语音',
  },
  fa: {
    placeholder: 'از AI بپرس…', send: 'ارسال', thinking: 'در حال فکر…', noResponse: 'پاسخی نیست',
    error: 'خطا', hint: 'از خانه خود بپرسید', langLabel: 'فارسی',
    recording: 'در حال ضبط…', processing: 'در حال پردازش…', noMic: 'صدا',
  },
}

const LANG_LIST: Lang[] = ['en', 'zh', 'fa']
const RECORDING_DURATION_MS = 5000

export default function AiChatPanel({ onClose }: { onClose: () => void }) {
  const { token } = useHa()
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<any>(null)
  const startTimeRef = useRef(0)
  const lang = getLang() as Lang
  const t = T[lang]

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { if (inputRef.current) inputRef.current.focus() }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [])

  const send = useCallback(async (text?: string) => {
    const msg = (text ?? prompt).trim()
    if (!msg || loading) return
    setPrompt('')
    setMessages(prev => [...prev, { role: 'user', text: msg }])
    setLoading(true)
    try {
      const r = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ prompt: msg, lang }),
      })
      const data = await r.json()
      setMessages(prev => [...prev, { role: 'assistant', text: data.response || data.hint || t.noResponse }])
    } catch { setMessages(prev => [...prev, { role: 'assistant', text: t.error }]) }
    setLoading(false)
  }, [prompt, loading, token, lang, t])

  const sendAudio = useCallback(async (blob: Blob) => {
    setMessages(prev => [...prev, { role: 'user', text: '🎤 …' }])
    setLoading(true)
    try {
      const form = new FormData()
      form.append('audio', blob, 'audio.webm')
      form.append('lang', lang)
      const r = await fetch('/api/ai/voice', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      const data = await r.json()
      const spoken = data.text || ''
      const reply = data.response || data.hint || t.noResponse
      setMessages(prev => {
        const msgs = [...prev]
        if (msgs.length > 0 && msgs[msgs.length - 1].text === '🎤 …') {
          msgs[msgs.length - 1] = { role: 'user', text: '🎤 ' + spoken }
        }
        msgs.push({ role: 'assistant', text: reply })
        return msgs
      })
    } catch { setMessages(prev => [...prev, { role: 'assistant', text: t.error }]) }
    setLoading(false)
  }, [token, lang, t])

  const stopRecording = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    const mr = mediaRecorderRef.current
    if (mr && mr.state === 'recording') {
      mr.stop()
    }
    setRecording(false)
  }, [])

  const startRecording = useCallback(async () => {
    if (recording || loading) return
    if (!navigator.mediaDevices?.getUserMedia) {
      const isSecure = window.isSecureContext
      setMessages(prev => [...prev, { role: 'assistant', text: isSecure ? 'Mic API not available in this browser' : 'Mic requires HTTPS. Use the Cloudflare tunnel URL.' }])
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunksRef.current = []
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : ''
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {})
      mediaRecorderRef.current = mr

      mr.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
        if (blob.size > 200) {
          sendAudio(blob)
        } else {
          setMessages(prev => [...prev, { role: 'assistant', text: t.noMic + ': too short' }])
        }
      }

      mr.onerror = () => {
        stream.getTracks().forEach(t => t.stop())
        setRecording(false)
        setMessages(prev => [...prev, { role: 'assistant', text: t.error + ': recording failed' }])
      }

      mr.start(100)
      startTimeRef.current = Date.now()
      setRecording(true)
      setRecordingTime(0)

      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current
        setRecordingTime(elapsed)
        if (elapsed >= RECORDING_DURATION_MS) {
          stopRecording()
        }
      }, 200)
    } catch (err: any) {
      const name = err?.name || 'unknown'
      const msg = name === 'NotAllowedError' || name === 'PermissionDeniedError'
        ? 'Microphone permission denied'
        : name === 'TypeError'
          ? 'Microphone not available (HTTP or unsupported browser)'
          : `Mic error: ${name}`
      setMessages(prev => [...prev, { role: 'assistant', text: msg }])
    }
  }, [recording, loading, stopRecording, sendAudio, t])

  const cycleLang = useCallback(() => {
    const idx = LANG_LIST.indexOf(lang)
    const next = LANG_LIST[(idx + 1) % LANG_LIST.length]
    setLang(next)
  }, [lang])

  return (
    <div style={{
      position: 'fixed', bottom: 70, right: 16, width: 280,
      background: '#1c1c1e', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      zIndex: 9999, display: 'flex', flexDirection: 'column', maxHeight: 360, overflow: 'hidden',
      border: '1px solid #333',
    }} onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #333' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 12, color: '#fff' }}>✦ AI</span>
          <button onClick={cycleLang} style={{
            background: '#2c2c2e', border: '1px solid #444', borderRadius: 4, color: '#aaa',
            fontSize: 10, cursor: 'pointer', padding: '2px 5px', lineHeight: 1,
          }}>{t.langLabel}</button>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 100 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#888', padding: '1.5rem 0', fontSize: 12 }}>
            {t.hint}<br/>"turn on lights"
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
        {loading && <div style={{ alignSelf: 'flex-start', padding: '6px 10px', fontSize: 12, color: '#888' }}>{t.processing}</div>}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: 'flex', gap: 4, padding: '4px 6px', borderTop: '1px solid #333', alignItems: 'center' }}>
        <input ref={inputRef} value={prompt} onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder={t.placeholder} style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #555', background: '#222', color: '#fff', fontSize: 16, minWidth: 0 }}
          disabled={loading || recording || !token} />
        {recording ? (
          <button onClick={stopRecording}
            style={{
              background: '#ff453a', border: 'none', borderRadius: 6,
              color: '#fff', fontSize: 11, cursor: 'pointer',
              padding: '6px 7px', lineHeight: 1, minWidth: 28, fontWeight: 600,
            }}
            title={t.recording}>
            {Math.max(0, Math.ceil((RECORDING_DURATION_MS - recordingTime) / 1000))}s
          </button>
        ) : (
          <button onClick={startRecording} disabled={loading || !token}
            style={{
              background: '#2c2c2e', border: 'none', borderRadius: 6,
              color: '#aaa', fontSize: 14, cursor: loading || !token ? 'not-allowed' : 'pointer',
              padding: '6px 7px', lineHeight: 1, minWidth: 28, opacity: loading || !token ? 0.4 : 1,
            }}
            title={t.noMic}>
            🎤
          </button>
        )}
        <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }}
          onClick={() => send()} disabled={loading || recording || !prompt.trim()}>{t.send}</button>
      </div>
    </div>
  )
}
