import { useState, FormEvent } from 'react'
import { useHa } from '../context/HaContext'

export default function LoginPage() {
  const { login } = useHa()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const err = await login(username, password)
    if (err) setError(err)
    setLoading(false)
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-logo">🏠</div>
        <div className="login-title">Home Assistant</div>
        <div className="login-sub">Sign in to continue</div>

        <form onSubmit={submit}>
          <div className="ios-field">
            <label>Username</label>
            <input
              className="ios-input"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="ios-field">
            <label>Password</label>
            <input
              className="ios-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="ios-btn" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
          {error && <div className="login-error">{error}</div>}
        </form>
      </div>
    </div>
  )
}
