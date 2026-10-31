import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/backend'
import { useApp } from '../lib/store'
import type { Message, Target } from '../lib/types'
import { brand } from '../brand'
import { prettySize, timeLabel } from '../lib/util'
import { Avatar } from './Avatar'

function Body({ text }: { text: string }) {
  const { dir } = useApp()
  const names = dir.profiles.map((p) => p.full_name).sort((a, b) => b.length - a.length)
  if (!names.length) return <>{text}</>
  const re = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'g')
  return <>{text.split(re).map((part, i) => part.startsWith('@') && names.includes(part.slice(1))
    ? <span key={i} className="rounded bg-brand/20 px-1 text-brand">{part}</span> : <span key={i}>{part}</span>)}</>
}

export function MessageItem({ m, onThread, compact }: { m: Message; onThread?: (m: Message) => void; compact?: boolean }) {
  const { person, me, rank } = useApp()
  const [picker, setPicker] = useState(false)
  const author = person(m.user_id)
  const grouped = Object.entries((m.reactions ?? []).reduce<Record<string, string[]>>((acc, r) => { (acc[r.emoji] ||= []).push(r.user_id); return acc }, {}))
  return (
    <div className="group relative flex gap-3 rounded-md px-4 py-2 hover:bg-slate-900/70" data-testid="message">
      <Avatar p={author} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-slate-100">{author?.full_name ?? 'Unknown'}</span>
          {author?.title && <span className="text-xs text-slate-500">{author.title}</span>}
          <span className="text-xs text-slate-500">{timeLabel(m.created_at)}</span>
          {m.is_pinned && <span className="pill">📌 pinned</span>}
        </div>
        <div className="whitespace-pre-wrap break-words text-[15px] text-slate-200"><Body text={m.body} /></div>
        {(m.metadata?.attachments ?? []).map((a, i) => (
          a.mime_type?.startsWith('image/') && a.url !== '#'
            ? <img key={i} src={a.url} alt={a.name} className="mt-2 max-h-64 rounded-md border border-slate-700" />
            : <a key={i} href={a.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm hover:border-brand">
                📄 <span>{a.name}</span><span className="text-xs text-slate-500">{prettySize(a.size_bytes)}</span></a>
        ))}
        {(grouped.length > 0 || (!compact && m.reply_count > 0)) && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {grouped.map(([emoji, users]) => (
              <button key={emoji} onClick={() => api.toggleReaction(m.id, emoji)}
                className={`rounded-full border px-2 py-0.5 text-xs ${users.includes(me?.id ?? '') ? 'border-brand bg-brand/20' : 'border-slate-700 bg-slate-800'}`}>
                {emoji} {users.length}</button>
            ))}
            {!compact && m.reply_count > 0 && onThread && (
              <button onClick={() => onThread(m)} className="ml-1 text-xs font-medium text-brand hover:underline">💬 {m.reply_count} {m.reply_count === 1 ? 'reply' : 'replies'}</button>
            )}
          </div>
        )}
      </div>
      <div className="absolute -top-3 right-4 hidden gap-1 rounded-md border border-slate-700 bg-slate-900 p-0.5 shadow group-hover:flex">
        <button className="px-1.5" title="React" onClick={() => setPicker(!picker)}>🙂</button>
        {onThread && !compact && <button className="px-1.5" title="Reply in thread" onClick={() => onThread(m)}>💬</button>}
        {m.channel_id && rank >= 30 && <button className="px-1.5" title="Pin" onClick={() => api.setPinned(m.id, !m.is_pinned)}>📌</button>}
        {(m.user_id === me?.id || rank >= 90) && <button className="px-1.5" title="Delete" onClick={() => confirm('Delete this message?') && api.deleteMessage(m.id)}>🗑️</button>}
      </div>
      {picker && (
        <div className="absolute right-4 top-6 z-10 flex gap-1 rounded-md border border-slate-700 bg-slate-900 p-1 shadow-lg">
          {brand.reactions.map((e) => <button key={e} className="px-1 text-lg" onClick={() => { api.toggleReaction(m.id, e); setPicker(false) }}>{e}</button>)}
        </div>
      )}
    </div>
  )
}

export function Composer({ target, parentId, placeholder, disabled }: { target: Target; parentId?: string; placeholder: string; disabled?: string }) {
  const { dir } = useApp()
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const mentionQ = /@([\w ]{0,20})$/.exec(text)?.[1]
  const matches = mentionQ !== undefined ? dir.profiles.filter((p) => p.full_name.toLowerCase().startsWith(mentionQ.toLowerCase())).slice(0, 5) : []

  async function submit() {
    if ((!text.trim() && !file) || busy) return
    setBusy(true); setErr('')
    try {
      const mentions = dir.profiles.filter((p) => text.includes('@' + p.full_name)).map((p) => p.id)
      await api.send(target, text.trim(), { parentId, file: file ?? undefined, mentions })
      setText(''); setFile(null)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  if (disabled) return <div className="border-t border-slate-800 p-4 text-center text-sm text-slate-500">{disabled}</div>
  return (
    <div className="relative border-t border-slate-800 p-3">
      {matches.length > 0 && (
        <div className="absolute bottom-full left-3 mb-1 w-64 rounded-md border border-slate-700 bg-slate-900 shadow-lg">
          {matches.map((p) => <button key={p.id} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-800"
            onClick={() => setText(text.replace(/@([\w ]{0,20})$/, '@' + p.full_name + ' '))}>@{p.full_name}</button>)}
        </div>
      )}
      {file && <div className="mb-2 flex items-center gap-2 text-sm text-slate-300">📎 {file.name} <button className="text-slate-500" onClick={() => setFile(null)}>✕</button></div>}
      {err && <div className="mb-2 text-sm text-rose-400">{err}</div>}
      <div className="flex items-end gap-2 rounded-lg border border-slate-700 bg-slate-900 p-2 focus-within:border-brand">
        <button className="px-2 text-lg text-slate-400 hover:text-slate-200" title="Attach a file" onClick={() => fileRef.current?.click()}>＋</button>
        <input ref={fileRef} type="file" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <textarea rows={1} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !matches.length) { e.preventDefault(); submit() } }}
          className="max-h-40 flex-1 resize-none bg-transparent py-1 text-sm text-slate-100 placeholder-slate-500 focus:outline-none" />
        <button className="btn" disabled={busy} onClick={submit}>Send</button>
      </div>
    </div>
  )
}

export function MessageList({ messages, onThread }: { messages: Message[]; onThread?: (m: Message) => void }) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [messages.length])
  return (
    <div className="flex-1 overflow-y-auto py-3">
      {messages.length === 0 && <div className="p-8 text-center text-slate-500">No messages yet. Say hello! 👋</div>}
      {messages.map((m) => <MessageItem key={m.id} m={m} onThread={onThread} />)}
      <div ref={end} />
    </div>
  )
}
