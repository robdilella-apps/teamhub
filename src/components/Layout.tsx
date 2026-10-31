import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { api, isDemo } from '../lib/backend'
import { useApp } from '../lib/store'
import { brand } from '../brand'
import { Avatar } from './Avatar'

const link = ({ isActive }: { isActive: boolean }) =>
  `flex items-center justify-between rounded-md px-2 py-1 text-sm ${isActive ? 'bg-brand text-white' : 'text-slate-300 hover:bg-slate-800'}`

function Badge({ n }: { n?: number }) { return n ? <span className="rounded-full bg-rose-500 px-1.5 text-xs font-semibold text-white">{n}</span> : null }

export function Layout() {
  const { me, channels, memberOf, conversations, unread, person, alerts, rank, signedIn } = useApp()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const pending = alerts.filter((a) => !a.acked)
  const myChannels = channels.filter((c) => memberOf.includes(c.id))
  const dmName = (ids: string[]) => ids.filter((i) => i !== me?.id).map((i) => person(i)?.full_name ?? '?').join(', ') || 'Just you'

  return (
    <div className="flex h-full">
      <aside className={`${open ? 'flex' : 'hidden'} fixed inset-y-0 left-0 z-20 w-64 flex-col border-r border-slate-800 bg-slate-950 md:static md:flex`}>
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
          <img src={brand.logo} className="h-8 w-8" alt="" />
          <div className="min-w-0"><div className="truncate font-bold">{brand.companyName}</div><div className="text-xs text-slate-500">{brand.appName}{isDemo && ' · demo'}</div></div>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto p-3" onClick={() => setOpen(false)}>
          <div className="space-y-0.5">
            <NavLink to="/" end className={link}>🏠 Home</NavLink>
            <NavLink to="/notifications" className={link}>🔔 Notifications <Badge n={unread.notifications} /></NavLink>
            <NavLink to="/announcements" className={link}>📣 Announcements</NavLink>
            <NavLink to="/alerts" className={link}>🚨 Urgent alerts <Badge n={pending.length} /></NavLink>
            <NavLink to="/kudos" className={link}>🏆 Kudos</NavLink>
            <NavLink to="/search" className={link}>🔍 Search</NavLink>
            <NavLink to="/people" className={link}>👥 People</NavLink>
            {rank >= 90 && <NavLink to="/admin" className={link}>⚙️ Admin</NavLink>}
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Channels <NavLink to="/channels" className="text-base text-slate-400 hover:text-white" title="Browse / create">＋</NavLink></div>
            {myChannels.map((c) => <NavLink key={c.id} to={`/c/${c.id}`} className={link}><span>{c.type === 'private' ? '🔒' : '#'} {c.name}</span><Badge n={unread[c.id]} /></NavLink>)}
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Direct messages <NavLink to="/people" className="text-base text-slate-400 hover:text-white" title="New message">＋</NavLink></div>
            {conversations.map((c) => <NavLink key={c.id} to={`/dm/${c.id}`} className={link}><span className="truncate">💬 {c.title || dmName(c.member_ids)}</span><Badge n={unread[c.id]} /></NavLink>)}
          </div>
        </nav>
        <div className="flex items-center gap-2 border-t border-slate-800 p-3">
          <Avatar p={me ?? undefined} size={8} />
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{me?.full_name}</div><div className="text-xs text-slate-500">{me?.title || me?.role}</div></div>
          <button className="btn-ghost text-xs" onClick={async () => { await api.signOut(); signedIn(false); nav('/') }}>Sign out</button>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2 md:hidden">
          <button className="btn-ghost" onClick={() => setOpen(!open)}>☰</button><span className="font-semibold">{brand.appName}</span>
        </div>
        {pending.length > 0 && (
          <div className="flex items-center gap-3 bg-rose-600 px-4 py-2 text-sm text-white" data-testid="urgent-banner">
            <span className="font-bold">🚨 URGENT:</span><span className="flex-1 truncate">{pending[0].title} — {pending[0].body}</span>
            <button className="rounded bg-white px-2 py-0.5 font-semibold text-rose-700" onClick={() => api.ackAlert(pending[0].id)}>Got it</button>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  )
}

export function Header({ title, subtitle, children }: { title: string; subtitle?: string | null; children?: React.ReactNode }) {
  return (
    <header className="flex items-center gap-3 border-b border-slate-800 px-5 py-3">
      <div className="min-w-0 flex-1"><h1 className="truncate text-lg font-bold">{title}</h1>{subtitle && <p className="truncate text-sm text-slate-400">{subtitle}</p>}</div>
      {children}
    </header>
  )
}
