import { useState, useEffect } from 'react'

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - base64.length % 4) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr.buffer as ArrayBuffer
}

const supported = typeof window !== 'undefined'
  && 'serviceWorker' in navigator
  && 'PushManager' in window
  && 'Notification' in window

export function usePushSubscription(token: string | null) {
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supported) return
    navigator.serviceWorker.ready
      .then(r => r.pushManager.getSubscription())
      .then(s => { if (s) setSubscribed(true) })
      .catch(() => {})
  }, [])

  const toggle = async () => {
    if (!supported || !token || loading) return
    setLoading(true)
    setError('')
    try {
      // Always use navigator.serviceWorker.ready for the active registration
      await navigator.serviceWorker.register('/sw.js')
      const reg = await navigator.serviceWorker.ready

      const existing = await reg.pushManager.getSubscription()

      if (subscribed && existing) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        })
        await existing.unsubscribe()
        setSubscribed(false)
      } else {
        // Request permission explicitly first
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          setError('Permission denied')
          setLoading(false)
          return
        }

        const kr = await fetch('/api/push/vapid-public-key')
        const { key } = await kr.json()

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToBuffer(key),
        })

        const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
        const r = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys }),
        })
        if (!r.ok) throw new Error('Save failed')
        setSubscribed(true)
        // Notify CommContext so it can register this endpoint for call notifications
        window.dispatchEvent(new CustomEvent('push-subscribed', { detail: j.endpoint }))
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed')
    }
    setLoading(false)
  }

  const test = async () => {
    if (!token) return
    await fetch('/api/push/test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
  }

  return { supported, subscribed, loading, error, toggle, test }
}
