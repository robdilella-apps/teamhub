import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/backend'
import { useApp } from '../lib/store'
import type { Announcement, Kudos, Message, Notification } from '../lib/types'
import { brand } from '../brand'
import { timeLabel } from '../lib/util'
import { Header } from '../components/Layout'
import { Avatar } from '../components/Avatar'
import { MessageItem } from '../components/Messages'

const Page = ({ children }: { children: React.ReactNode }) => <div className="flex-1 overflow-y-auto p-5"><div className="mx-auto max-w-3xl space-y-4">{children}</div></div>
const useLoad = <T,>(fn: () => Promise<T>, init: T) => { const { tick } = useApp(); const [v, setV] = useState<T>(init)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fn().then(setV) }, [tick]); return v }

export function Home() {
  const { me, channels, memberOf, unread, alerts } = useApp()
  const anns = useLoad(() => api.announcements(), [] as Announcement[])
  const kudos = useLoad(() => api.kudos(), [] as Kudos[])
  const { person } = useApp()
  return (<><Header title={`Welcome, ${me?.full_name.split(' ')[0]} 👋`} subtitle={`${brand.companyName} · ${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}`} />
    <Page>
      {alerts.filter((a) => !a.acked).map((a) => <div key={a.id} className="card border-rose-700 bg-rose-950/40"><div className="font-bold text-rose-300">🚨 {a.title}</div><p className="text-sm">{a.body}</p></div>)}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card"><h2 className="mb-2 font-semibold">📣 Latest announcements</h2>
          {anns.slice(0, 3).map((a) => <Link to="/announcements" key={a.id} className="block border-t border-slate-800 py-2 first:border-0 hover:text-white">
            <div className="text-sm font-medium">{a.title} {a.requires_ack && !a.acked && <span className="pill bg-amber-600 text-white">needs your OK</span>}</div>
            <div className="truncate text-xs text-slate-400">{a.body}</div></Link>)}</div>
        <div className="card"><h2 className="mb-2 font-semibold">💬 Your channels</h2>
          {channels.filter((c) => memberOf.includes(c.id)).map((c) => <Link key={c.id} to={`/c/${c.id}`} className="flex justify-between py-1 text-sm hover:text-white"><span># {c.name}</span>{unread[c.id] ? <span className="pill bg-brand text-white">{unread[c.id]} new</span> : null}</Link>)}</div>
      </div>
      <div className="card"><h2 className="mb-2 font-semibold">🏆 Recent kudos</h2>
        {kudos.slice(0, 3).map((k) => <div key={k.id} className="py-1 text-sm"><b>{person(k.author_id)?.full_name}</b> → <b>{person(k.recipient_id)?.full_name}</b>: {k.message}</div>)}</div>
    </Page></>)
}

export function Channels() {
  const { channels, memberOf, refresh } = useApp(); const nav = useNavigate()
  const [name, setName] = useState(''); const [desc, setDesc] = useState(''); const [priv, setPriv] = useState(false)
  return (<><Header title="Channels" subtitle="Browse or create channels" /><Page>
    <form className="card space-y-2" onSubmit={async (e) => { e.preventDefault(); const id = await api.createChannel(name, desc, priv); await refresh(); nav(`/c/${id}`) }}>
      <h2 className="font-semibold">Create a channel</h2>
      <input className="input" placeholder="e.g. weekend-crew" value={name} onChange={(e) => setName(e.target.value)} required />
      <input className="input" placeholder="What is it for?" value={desc} onChange={(e) => setDesc(e.target.value)} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> Private (invite only)</label>
      <button className="btn">Create</button></form>
    {channels.map((c) => <div key={c.id} className="card flex items-center justify-between"><div><div className="font-medium">{c.type === 'private' ? '🔒' : '#'} {c.name}</div><div className="text-sm text-slate-400">{c.description}</div></div>
      {memberOf.includes(c.id) ? <Link className="btn-ghost" to={`/c/${c.id}`}>Open</Link> : <button className="btn" onClick={async () => { await api.joinChannel(c.id); await refresh(); nav(`/c/${c.id}`) }}>Join</button>}</div>)}
  </Page></>)
}

export function People() {
  const { dir, me, refresh } = useApp(); const nav = useNavigate(); const [q, setQ] = useState('')
  const loc = (id?: string | null) => dir.locations.find((l) => l.id === id)?.name
  const people = dir.profiles.filter((p) => p.is_active && p.full_name.toLowerCase().includes(q.toLowerCase()))
  return (<><Header title="People" subtitle={`${dir.profiles.filter((p) => p.is_active).length} team members`} /><Page>
    <input className="input" placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
    <div className="grid gap-3 sm:grid-cols-2">{people.map((p) => <div key={p.id} className="card flex items-center gap-3"><Avatar p={p} size={11} />
      <div className="min-w-0 flex-1"><div className="font-medium">{p.full_name}</div><div className="text-xs text-slate-400">{p.title} · {loc(p.location_id) ?? `No ${brand.locationLabel.toLowerCase()}`}</div></div>
      {p.id !== me?.id && <button className="btn" onClick={async () => { const id = await api.openDm([p.id]); await refresh(); nav(`/dm/${id}`) }}>Message</button>}</div>)}</div>
  </Page></>)
}

export function Announcements() {
  const { person, rank } = useApp(); const list = useLoad(() => api.announcements(), [] as Announcement[])
  const [t, setT] = useState(''); const [b, setB] = useState(''); const [ack, setAck] = useState(true)
  return (<><Header title="Announcements" subtitle="Official updates for the whole team" /><Page>
    {rank >= 40 && <form className="card space-y-2" onSubmit={async (e) => { e.preventDefault(); await api.postAnnouncement(t, b, ack); setT(''); setB('') }}>
      <input className="input" placeholder="Title" value={t} onChange={(e) => setT(e.target.value)} required />
      <textarea className="input" rows={3} placeholder="What does everyone need to know?" value={b} onChange={(e) => setB(e.target.value)} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Require everyone to acknowledge</label>
      <button className="btn">Post announcement</button></form>}
    {list.map((a) => <div key={a.id} className="card"><div className="flex items-start justify-between gap-3"><div>
      <div className="font-semibold">{a.is_pinned && '📌 '}{a.title}</div><div className="text-xs text-slate-500">{person(a.author_id)?.full_name} · {timeLabel(a.created_at)}</div></div>
      {a.requires_ack && (a.acked ? <span className="pill bg-emerald-700 text-white">✓ Acknowledged</span> : <button className="btn" onClick={() => api.ackAnnouncement(a.id)}>Acknowledge</button>)}</div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{a.body}</p>
      {a.requires_ack && rank >= 40 && <p className="mt-2 text-xs text-slate-500">{a.ack_count} acknowledged</p>}</div>)}
  </Page></>)
}

export function Alerts() {
  const { alerts, person, rank } = useApp(); const [t, setT] = useState(''); const [b, setB] = useState('')
  return (<><Header title="Urgent alerts" subtitle="Time-critical messages everyone must see" /><Page>
    {rank >= 40 && <form className="card space-y-2 border-rose-900" onSubmit={async (e) => { e.preventDefault(); if (confirm('Send an urgent alert to everyone?')) { await api.postAlert(t, b); setT(''); setB('') } }}>
      <input className="input" placeholder="Alert title" value={t} onChange={(e) => setT(e.target.value)} required />
      <textarea className="input" rows={2} placeholder="Details" value={b} onChange={(e) => setB(e.target.value)} />
      <button className="btn bg-rose-600">🚨 Send urgent alert</button></form>}
    {alerts.map((a) => <div key={a.id} className={`card ${a.acked ? '' : 'border-rose-700'}`}><div className="flex justify-between gap-3"><div>
      <div className="font-semibold text-rose-300">🚨 {a.title}</div><div className="text-xs text-slate-500">{person(a.author_id)?.full_name} · {timeLabel(a.created_at)} · {a.ack_count} acknowledged</div></div>
      {a.acked ? <span className="pill bg-emerald-700 text-white">✓ Got it</span> : <button className="btn bg-rose-600" onClick={() => api.ackAlert(a.id)}>Got it</button>}</div>
      <p className="mt-2 text-sm">{a.body}</p></div>)}
  </Page></>)
}

export function KudosPage() {
  const { dir, me, person } = useApp(); const list = useLoad(() => api.kudos(), [] as Kudos[])
  const [to, setTo] = useState(''); const [cat, setCat] = useState(brand.kudosCategories[0]); const [msg, setMsg] = useState('')
  return (<><Header title="Kudos" subtitle="Celebrate great work" /><Page>
    <form className="card grid gap-2 sm:grid-cols-3" onSubmit={async (e) => { e.preventDefault(); await api.giveKudos(to, cat, msg); setMsg('') }}>
      <select className="input" value={to} onChange={(e) => setTo(e.target.value)} required><option value="">Who?</option>{dir.profiles.filter((p) => p.id !== me?.id).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
      <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>{brand.kudosCategories.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}</select>
      <button className="btn">🏆 Give kudos</button>
      <input className="input sm:col-span-3" placeholder="Say thanks…" value={msg} onChange={(e) => setMsg(e.target.value)} required /></form>
    {list.map((k) => <div key={k.id} className="card flex gap-3"><Avatar p={person(k.recipient_id)} /><div>
      <div className="text-sm"><b>{person(k.author_id)?.full_name}</b> gave <b>{person(k.recipient_id)?.full_name}</b> kudos for <span className="pill">{k.category.replace(/_/g, ' ')}</span></div>
      <p className="text-sm text-slate-300">“{k.message}”</p><div className="text-xs text-slate-500">{timeLabel(k.created_at)}</div></div></div>)}
  </Page></>)
}

export function Notifications() {
  const list = useLoad(() => api.notifications(), [] as Notification[]); const { refresh } = useApp()
  const fix = (l: string | null) => (l ?? '').replace(/^\/channel\//, '/c/')
  return (<><Header title="Notifications"><button className="btn-ghost" onClick={() => api.markAllNotificationsRead().then(refresh)}>Mark all read</button></Header><Page>
    {list.length === 0 && <p className="text-slate-500">You're all caught up. ✨</p>}
    {list.map((n) => <Link key={n.id} to={fix(n.link) || '/'} className={`card block hover:border-brand ${n.is_read ? 'opacity-60' : ''}`}>
      <div className="text-sm font-medium">{!n.is_read && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-brand" />}{n.title}</div>
      {n.body && <div className="truncate text-sm text-slate-400">{n.body}</div>}<div className="text-xs text-slate-500">{timeLabel(n.created_at)}</div></Link>)}
  </Page></>)
}

export function Search() {
  const [q, setQ] = useState(''); const [res, setRes] = useState<Message[] | null>(null); const { channels } = useApp()
  return (<><Header title="Search" /><Page>
    <form onSubmit={async (e) => { e.preventDefault(); setRes(await api.search(q)) }} className="flex gap-2"><input className="input" autoFocus placeholder="Search messages" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn">Search</button></form>
    {res && <p className="text-sm text-slate-500">{res.length} result(s)</p>}
    {res?.map((m) => <Link key={m.id} to={m.channel_id ? `/c/${m.channel_id}` : `/dm/${m.conversation_id}`} className="block rounded-md border border-slate-800">
      <div className="px-4 pt-2 text-xs text-slate-500">{m.channel_id ? '# ' + (channels.find((c) => c.id === m.channel_id)?.name ?? '') : 'Direct message'}</div><MessageItem m={m} compact /></Link>)}
  </Page></>)
}

export function Admin() {
  const { dir, refresh, me } = useApp(); const [loc, setLoc] = useState(''); const [err, setErr] = useState('')
  const run = (p: Promise<unknown>) => p.then(refresh).catch((e) => setErr(e.message))
  return (<><Header title="Admin" subtitle="Manage your team, roles and locations" /><Page>
    {err && <p className="text-rose-400">{err}</p>}
    <div className="card overflow-x-auto"><h2 className="mb-3 font-semibold">People</h2>
      <table className="w-full text-sm"><thead className="text-left text-slate-400"><tr><th className="py-1">Name</th><th>Role</th><th>{brand.locationLabel}</th><th>Active</th></tr></thead><tbody>
        {dir.profiles.map((p) => <tr key={p.id} className="border-t border-slate-800"><td className="py-2">{p.full_name}<div className="text-xs text-slate-500">{p.email}</div></td>
          <td><select className="input py-1" value={p.role} disabled={p.id === me?.id} onChange={(e) => run(api.updateProfile(p.id, { role: e.target.value }))}>{dir.roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select></td>
          <td><select className="input py-1" value={p.location_id ?? ''} onChange={(e) => run(api.updateProfile(p.id, { location_id: e.target.value || null }))}><option value="">—</option>{dir.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></td>
          <td><input type="checkbox" checked={p.is_active} disabled={p.id === me?.id} onChange={(e) => run(api.updateProfile(p.id, { is_active: e.target.checked }))} /></td></tr>)}
      </tbody></table>
      <p className="mt-3 text-xs text-slate-500">New people join by creating an account on the sign-in page; then set their role here.</p></div>
    <form className="card flex gap-2" onSubmit={(e) => { e.preventDefault(); run(api.addLocation(loc)); setLoc('') }}>
      <input className="input" placeholder={`New ${brand.locationLabel.toLowerCase()} name`} value={loc} onChange={(e) => setLoc(e.target.value)} required /><button className="btn">Add</button></form>
    <div className="card text-sm"><h2 className="mb-1 font-semibold">{brand.locationLabel}s</h2>{dir.locations.map((l) => <span key={l.id} className="pill mr-1">{l.name}</span>)}</div>
  </Page></>)
}
