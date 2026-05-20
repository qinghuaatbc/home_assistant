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
const RECORDING_DURATION_MS = 8000

// Inject keyframe animation once
if (typeof document !== 'undefined' && !document.getElementById('ai-mic-styles')) {
  const s = document.createElement('style')
  s.id = 'ai-mic-styles'
  s.textContent = `@keyframes micPulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(255,59,48,0.6)}60%{transform:scale(1.18);box-shadow:0 0 0 10px rgba(255,59,48,0)}}`
  document.head.appendChild(s)
}

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
  const autoSendTimerRef = useRef<any>(null)
  const startTimeRef = useRef(0)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const cancelSilenceRef = useRef<(() => void) | null>(null)
  const silenceStartRef = useRef<number | null>(null)
  const [lang, setLangState] = useState<Lang>(() => getLang() as Lang)
  const t = T[lang]

  // Stay in sync when panel language button changes
  useEffect(() => {
    const handler = (e: Event) => {
      const l = (e as CustomEvent).detail as Lang
      setLangState(l)
      setLang(l)
    }
    window.addEventListener('ha-lang', handler)
    return () => window.removeEventListener('ha-lang', handler)
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { if (inputRef.current) inputRef.current.focus() }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current)
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

  useEffect(() => {
    if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current)
    if (prompt.trim() && !loading && !recording) {
      autoSendTimerRef.current = setTimeout(() => send(), 5000)
    }
    return () => { if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current) }
  }, [prompt, loading, recording, send])

  const wrappedSend = useCallback((text?: string) => {
    if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current)
    send(text)
  }, [send])

  const sendAudio = useCallback(async (blob: Blob, fileName?: string) => {
    setMessages(prev => [...prev, { role: 'user', text: '🎤 …' }])
    setLoading(true)
    try {
      const form = new FormData()
      form.append('audio', blob, fileName || 'audio.webm')
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
    if (cancelSilenceRef.current) { cancelSilenceRef.current(); cancelSilenceRef.current = null }
    silenceStartRef.current = null
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null }
    const mr = mediaRecorderRef.current
    if (mr && mr.state === 'recording') mr.stop()
    setRecording(false)
  }, [])

  const startRecording = useCallback(async () => {
    if (recording || loading) return
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessages(prev => [...prev, { role: 'assistant', text: window.isSecureContext ? 'Mic not available' : 'Mic requires HTTPS' }])
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunksRef.current = []
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : ''
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {})
      mediaRecorderRef.current = mr

      mr.ondataavailable = (e: BlobEvent) => { if (e.data.size > 0) chunksRef.current.push(e.data) }

      mr.onstop = () => {
        stream.getTracks().forEach(tk => tk.stop())
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
        if (blob.size > 200) sendAudio(blob)
        else setMessages(prev => [...prev, { role: 'assistant', text: t.noMic + ': too short' }])
      }

      mr.onerror = () => {
        stream.getTracks().forEach(tk => tk.stop())
        setRecording(false)
        setMessages(prev => [...prev, { role: 'assistant', text: t.error + ': recording failed' }])
      }

      mr.start(100)
      startTimeRef.current = Date.now()
      setRecording(true)
      setRecordingTime(0)

      // Silence detection using Float32 time domain — threshold 0.015 (~1.5% amplitude)
      try {
        const audioCtx = new AudioContext()
        audioCtxRef.current = audioCtx
        await audioCtx.resume()
        const source = audioCtx.createMediaStreamSource(stream)
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 512
        analyser.smoothingTimeConstant = 0
        source.connect(analyser)
        const floatBuf = new Float32Array(analyser.fftSize)
        let cancelled = false
        cancelSilenceRef.current = () => { cancelled = true }

        const check = () => {
          if (cancelled) return
          analyser.getFloatTimeDomainData(floatBuf)
          let sum = 0
          for (let i = 0; i < floatBuf.length; i++) sum += floatBuf[i] * floatBuf[i]
          const rms = Math.sqrt(sum / floatBuf.length)
          if (Date.now() - startTimeRef.current > 800) {
            if (rms < 0.015) {
              if (silenceStartRef.current === null) silenceStartRef.current = Date.now()
              else if (Date.now() - silenceStartRef.current > 1500) { stopRecording(); return }
            } else {
              silenceStartRef.current = null
            }
          }
          setTimeout(check, 80)
        }
        setTimeout(check, 80)
      } catch { /* AudioContext not available */ }

      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current
        setRecordingTime(elapsed)
        if (elapsed >= RECORDING_DURATION_MS) stopRecording()
      }, 200)
    } catch (err: any) {
      const name = err?.name || ''
      setMessages(prev => [...prev, { role: 'assistant', text:
        name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'Microphone permission denied' :
        name === 'TypeError' ? 'Microphone not available' : `Mic error: ${name}` }])
    }
  }, [recording, loading, stopRecording, sendAudio, t])

  // Auto-start mic when panel opens
  const autoStartedRef = useRef(false)
  useEffect(() => {
    if (!autoStartedRef.current) {
      autoStartedRef.current = true
      startRecording()
    }
  }, [startRecording])

  const cycleLang = useCallback(() => {
    const next = LANG_LIST[(LANG_LIST.indexOf(lang) + 1) % LANG_LIST.length]
    setLang(next)
  }, [lang])

  const micBtnStyle: React.CSSProperties = {
    background: '#ff3b30',
    border: 'none', borderRadius: 10, cursor: 'pointer',
    color: '#fff', fontSize: 22,
    padding: '6px 9px', lineHeight: 1,
    minWidth: 40, minHeight: 36,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    animation: recording ? 'micPulse 0.9s ease-in-out infinite' : 'none',
    transition: 'opacity 0.15s',
  }

  return (
    <div style={{
      position: 'fixed', bottom: 86, left: 16, width: 290,
      background: 'rgba(220,240,255,0.97)',
      borderRadius: 14, boxShadow: '0 8px 32px rgba(0,100,200,0.22)',
      zIndex: 9999, display: 'flex', flexDirection: 'column', maxHeight: 280, overflow: 'hidden',
      border: '1px solid rgba(100,180,255,0.45)',
    }} onClick={e => e.stopPropagation()}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', borderBottom: '1px solid rgba(100,180,255,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#1a6fb3' }}>✦ AI</span>
          <button onClick={cycleLang} style={{
            background: 'rgba(100,180,255,0.2)', border: '1px solid rgba(100,180,255,0.4)',
            borderRadius: 4, color: '#1a6fb3', fontSize: 10, cursor: 'pointer', padding: '2px 5px', lineHeight: 1,
          }}>{t.langLabel}</button>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#5a8ab0', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 100 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#5a8ab0', padding: '1.5rem 0', fontSize: 12 }}>
            {t.hint}<br/>"turn on lights"
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%',
            padding: '6px 10px', borderRadius: 8, fontSize: 12, lineHeight: 1.4,
            background: m.role === 'user' ? '#2680eb' : 'rgba(180,220,255,0.75)',
            color: m.role === 'user' ? '#fff' : '#0a2540',
          }}>{m.text}</div>
        ))}
        {loading && <div style={{ alignSelf: 'flex-start', padding: '6px 10px', fontSize: 12, color: '#5a8ab0' }}>{t.processing}</div>}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div style={{ display: 'flex', gap: 4, padding: '5px 7px', borderTop: '1px solid rgba(100,180,255,0.3)', alignItems: 'center' }}>
        <input ref={inputRef} value={prompt} onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && wrappedSend()}
          placeholder={t.placeholder}
          style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(100,180,255,0.4)', background: 'rgba(255,255,255,0.85)', color: '#0a2540', fontSize: 16, minWidth: 0 }}
          disabled={loading || recording || !token} />
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={!recording && (loading || !token)}
          style={{ ...micBtnStyle, opacity: !recording && (loading || !token) ? 0.4 : 1 }}
          title={recording ? t.recording : t.noMic}
        >
          🎤
        </button>
        <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }}
          onClick={() => wrappedSend()} disabled={loading || recording || !prompt.trim()}>{t.send}</button>
      </div>
    </div>
  )
}
