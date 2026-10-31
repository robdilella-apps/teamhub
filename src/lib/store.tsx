import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react'
import { api } from './backend'
import type { Channel, Conversation, Directory, Profile, UrgentAlert } from './types'

interface State {
  me: Profile | null; loading: boolean; dir: Directory
  channels: Channel[]; memberOf: string[]; conversations: Conversation[]; unread: Record<string, number>; alerts: UrgentAlert[]
  tick: number; refresh: () => Promise<void>; signedIn: (v: boolean) => void
  person: (id: string | null | undefined) => Profile | undefined
  rank: number
}
const Ctx = createContext<State>(null as unknown as State)
export const useApp = () => useContext(Ctx)

export function AppProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [dir, setDir] = useState<Directory>({ profiles: [], locations: [], departments: [], roles: [] })
  const [me, setMe] = useState<Profile | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [memberOf, setMemberOf] = useState<string[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [alerts, setAlerts] = useState<UrgentAlert[]>([])
  const [tick, setTick] = useState(0)

  const refresh = useCallback(async () => {
    const id = await api.currentUserId()
    setAuthed(!!id)
    if (!id) { setMe(null); return }
    const [d, ch, cv, un, al] = await Promise.all([api.directory(), api.channels(), api.conversations(), api.unread(), api.alerts()])
    setDir(d); setMe(d.profiles.find((p) => p.id === id) ?? null)
    setChannels(ch.channels); setMemberOf(ch.memberOf); setConversations(cv); setUnread(un); setAlerts(al)
    setTick((t) => t + 1)
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    if (!authed) return
    let timer: ReturnType<typeof setTimeout> | undefined
    return api.subscribe(() => { clearTimeout(timer); timer = setTimeout(refresh, 150) })
  }, [authed, refresh])

  const value = useMemo<State>(() => ({
    me, loading: authed === null, dir, channels, memberOf, conversations, unread, alerts, tick, refresh,
    signedIn: (v) => { setAuthed(v); refresh() },
    person: (id) => dir.profiles.find((p) => p.id === id),
    rank: dir.roles.find((r) => r.key === me?.role)?.rank ?? 0,
  }), [me, authed, dir, channels, memberOf, conversations, unread, alerts, tick, refresh])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
