import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/backend'
import { useApp } from '../lib/store'
import type { Message, Target } from '../lib/types'
import { Header } from '../components/Layout'
import { Composer, MessageItem, MessageList } from '../components/Messages'

export function Chat({ kind }: { kind: 'channel' | 'dm' }) {
  const { id = '' } = useParams()
  const { channels, conversations, memberOf, person, me, rank, tick, refresh } = useApp()
  const [messages, setMessages] = useState<Message[]>([])
  const [thread, setThread] = useState<Message | null>(null)
  const [replies, setReplies] = useState<Message[]>([])
  const [showPins, setShowPins] = useState(false)
  const target: Target = kind === 'channel' ? { channelId: id } : { conversationId: id }
  const channel = channels.find((c) => c.id === id)
  const conv = conversations.find((c) => c.id === id)
  const load = useCallback(async () => {
    setMessages(await api.messages(target))
    if (thread) setReplies(await api.thread(thread.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, kind, thread])
  useEffect(() => { load() }, [load, tick])
  useEffect(() => { setThread(null); api.markRead(target).then(refresh) // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const title = channel ? `${channel.type === 'private' ? '🔒' : '#'} ${channel.name}` : conv ? conv.member_ids.filter((m) => m !== me?.id).map((m) => person(m)?.full_name).join(', ') : 'Conversation'
  const readOnly = channel?.type === 'announcement' && rank < 40 ? 'Only team leads and above can post in this channel.' : undefined
  const notMember = channel && !memberOf.includes(channel.id)
  const pins = messages.filter((m) => m.is_pinned)

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <Header title={title} subtitle={channel?.description}>
          {pins.length > 0 && <button className="btn-ghost" onClick={() => setShowPins(!showPins)}>📌 {pins.length}</button>}
        </Header>
        {showPins && <div className="border-b border-slate-800 bg-slate-900/50">{pins.map((m) => <MessageItem key={m.id} m={m} compact />)}</div>}
        <MessageList messages={messages} onThread={setThread} />
        {notMember ? <div className="border-t border-slate-800 p-4 text-center"><button className="btn" onClick={() => api.joinChannel(id).then(refresh)}>Join #{channel?.name}</button></div>
          : <Composer target={target} placeholder={`Message ${title}`} disabled={readOnly} />}
      </div>
      {thread && (
        <aside className="hidden w-96 flex-col border-l border-slate-800 lg:flex">
          <Header title="Thread"><button className="btn-ghost" onClick={() => setThread(null)}>✕</button></Header>
          <div className="flex-1 overflow-y-auto py-2">
            {replies.map((m, i) => <div key={m.id}>{<MessageItem m={m} compact />}{i === 0 && <div className="mx-4 my-1 border-b border-slate-800 text-xs text-slate-500">{replies.length - 1} replies</div>}</div>)}
          </div>
          <Composer target={target} parentId={thread.id} placeholder="Reply…" />
        </aside>
      )}
    </div>
  )
}
