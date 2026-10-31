import { useState } from 'react'
import { api, isDemo } from '../lib/backend'
import { useApp } from '../lib/store'
import { brand } from '../brand'
import { DEMO_PASSWORD } from '../lib/demoBackend'

export function Login() {
  const { signedIn } = useApp()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState(isDemo ? 'alex@example.com' : '')
  const [password, setPassword] = useState(isDemo ? DEMO_PASSWORD : '')
  const [name, setName] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    try { if (mode === 'in') await api.signIn(email, password); else await api.signUp(email, password, name); signedIn(true) }
    catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <form onSubmit={go} className="w-full max-w-sm space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <div className="text-center">
          <img src={brand.logo} alt="" className="mx-auto mb-3 h-14 w-14" />
          <h1 className="text-2xl font-bold">{brand.appName}</h1>
          <p className="text-sm text-slate-400">{brand.companyName} · {brand.tagline}</p>
        </div>
        {mode === 'up' && <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />}
        <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        {err && <p className="text-sm text-rose-400">{err}</p>}
        <button className="btn w-full py-2" disabled={busy}>{mode === 'in' ? 'Sign in' : 'Create account'}</button>
        {!isDemo && <button type="button" className="w-full text-sm text-slate-400 hover:text-white" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}</button>}
        {isDemo && <p className="text-center text-xs text-slate-500">Demo mode: sample data only, stored in this browser.<br />Try alex@ (owner), jordan@ (manager) or taylor@example.com.</p>}
      </form>
    </div>
  )
}
