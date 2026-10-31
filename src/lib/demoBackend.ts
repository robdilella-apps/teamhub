// In-browser demo backend: no server needed. Data is the fictional "Sample Business Co"
// and is kept in localStorage so you can click around. Mirrors supabase/seed.sql.
import type { Announcement, Backend, Channel, Conversation, Kudos, Message, Notification, Profile, Reaction, UrgentAlert, Location, Department, Role } from './types'

interface Db {
  me: string | null
  profiles: Profile[]; locations: Location[]; departments: Department[]; roles: Role[]
  channels: Channel[]; members: { channel_id: string; user_id: string; last_read_at: string }[]
  conversations: Omit<Conversation, 'member_ids'>[]; convMembers: { conversation_id: string; user_id: string; last_read_at: string }[]
  messages: Message[]; reactions: Reaction[]; notifications: (Notification & { user_id: string })[]
  announcements: Omit<Announcement, 'acked' | 'ack_count'>[]; annAcks: { id: string; user_id: string }[]
  alerts: Omit<UrgentAlert, 'acked' | 'ack_count'>[]; alertAcks: { id: string; user_id: string }[]
  kudos: Kudos[]
}

const KEY = 'teamhub-demo-v1'
export const DEMO_PASSWORD = 'teamhub-demo'
const uid = () => crypto.randomUUID()
const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString()

function seed(): Db {
  const roles: Role[] = [
    { key: 'owner', label: 'Owner', rank: 100 }, { key: 'admin', label: 'Administrator', rank: 90 },
    { key: 'lead', label: 'Team Lead', rank: 40 }, { key: 'manager', label: 'Manager', rank: 30 }, { key: 'member', label: 'Team Member', rank: 10 },
  ]
  const locations: Location[] = [{ id: 'loc1', slug: 'main-street', name: 'Main Street' }, { id: 'loc2', slug: 'downtown', name: 'Downtown' }]
  const departments: Department[] = [
    { id: 'd1', slug: 'front-of-house', name: 'Front of House' }, { id: 'd2', slug: 'operations', name: 'Operations' },
    { id: 'd3', slug: 'sales', name: 'Sales' }, { id: 'd4', slug: 'management', name: 'Management' },
  ]
  const P = (id: string, name: string, role: string, loc: string, dept: string, title: string): Profile =>
    ({ id, email: name.split(' ')[0].toLowerCase() + '@example.com', full_name: name, role, location_id: loc, department_id: dept, title, is_active: true, presence: 'online' })
  const profiles = [
    P('alex', 'Alex Morgan', 'owner', 'loc1', 'd4', 'Owner'), P('jordan', 'Jordan Lee', 'manager', 'loc1', 'd2', 'Store Manager'),
    P('sam', 'Sam Patel', 'lead', 'loc2', 'd3', 'Sales Lead'), P('taylor', 'Taylor Kim', 'member', 'loc2', 'd1', 'Front Desk'),
    P('casey', 'Casey Rivera', 'member', 'loc1', 'd1', 'Team Member'), P('riley', 'Riley Chen', 'member', 'loc2', 'd2', 'Inventory'),
  ]
  const C = (id: string, name: string, description: string, type: Channel['type'], is_default: boolean, location_id: string | null = null): Channel =>
    ({ id, slug: id, name, description, type, is_default, is_archived: false, location_id })
  const channels = [
    C('general', 'general', 'Company-wide chat for the whole team', 'public', true),
    C('announcements', 'announcements', 'Official news from leadership (read-only)', 'announcement', true),
    C('random', 'random', 'Off-topic, wins, pets and lunch photos', 'public', true),
    C('managers', 'managers', 'Private channel for managers and admins', 'private', false),
    C('main-street', 'main-street', 'Main Street location team', 'location', false, 'loc1'),
    C('downtown', 'downtown', 'Downtown location team', 'location', false, 'loc2'),
  ]
  const members = profiles.flatMap((p) => channels.filter((c) => c.is_default || (c.id === 'managers' && p.role !== 'member') || c.location_id === p.location_id)
    .map((c) => ({ channel_id: c.id, user_id: p.id, last_read_at: ago(200) })))
  const M = (id: string, ch: string | null, conv: string | null, user: string, body: string, min: number, extra: Partial<Message> = {}): Message =>
    ({ id, channel_id: ch, conversation_id: conv, user_id: user, parent_message_id: null, body, reply_count: 0, is_pinned: false, is_deleted: false, created_at: ago(min), metadata: {}, ...extra })
  const messages = [
    M('m1', 'general', null, 'alex', 'Welcome to TeamHub, everyone! 👋 This is our new home for team chat.', 180, { reply_count: 2 }),
    M('m2', 'general', null, 'jordan', 'Reminder: the new opening checklist is pinned here. Please give it a read before Monday.', 160, { is_pinned: true, metadata: { attachments: [{ name: 'opening-checklist.pdf', url: '#', mime_type: 'application/pdf', size_bytes: 48213 }] } }),
    M('m3', 'general', null, 'sam', 'Downtown hit its weekly sales goal a day early. Great work team! 🎉', 120),
    M('m4', 'general', null, 'taylor', 'Does anyone have the updated holiday hours sheet?', 90),
    M('m5', 'general', null, 'riley', '@Taylor Kim it\'s attached to the pinned post, I uploaded it this morning.', 80, { metadata: { mentions: ['taylor'] } }),
    M('m6', 'general', null, 'casey', 'Delivery truck is running 30 minutes late, I\'ll handle receiving.', 20),
    M('t1', 'general', null, 'jordan', 'Excited to finally have everything in one place.', 170, { parent_message_id: 'm1' }),
    M('t2', 'general', null, 'taylor', 'Love it! Already installed it on my phone.', 160, { parent_message_id: 'm1' }),
    M('r1', 'random', null, 'sam', 'Who wants to do lunch from the taco place on Friday? 🌮', 300),
    M('r2', 'random', null, 'casey', 'Count me in!', 290),
    M('g1', 'managers', null, 'jordan', 'Schedules for next week are posted. Let me know about any coverage gaps.', 60),
    M('d1', null, 'dm1', 'jordan', 'Hey Alex, can we move our 1:1 to Thursday?', 15),
    M('d2', null, 'dm1', 'alex', 'Sure, Thursday at 10 works.', 10),
  ]
  const reactions: Reaction[] = [
    ...['jordan', 'taylor', 'casey', 'riley'].map((u) => ({ message_id: 'm3', user_id: u, emoji: '🎉' })),
    { message_id: 'm1', user_id: 'sam', emoji: '👋' }, { message_id: 'm1', user_id: 'riley', emoji: '❤️' },
  ]
  return {
    me: null, profiles, locations, departments, roles, channels, members,
    conversations: [{ id: 'dm1', is_group: false, title: null, last_message_at: ago(10) }],
    convMembers: [{ conversation_id: 'dm1', user_id: 'alex', last_read_at: ago(12) }, { conversation_id: 'dm1', user_id: 'jordan', last_read_at: ago(1) }],
    messages, reactions,
    notifications: [
      { id: 'n1', user_id: 'alex', type: 'dm', title: 'New message from Jordan Lee', body: 'Hey Alex, can we move our 1:1 to Thursday?', link: '/dm/dm1', is_read: false, created_at: ago(15) },
      { id: 'n2', user_id: 'alex', type: 'urgent', title: 'Freezer down at Main Street', body: 'Do not stock the walk-in until the technician clears it.', link: '/alerts', is_read: false, created_at: ago(30) },
      { id: 'n3', user_id: 'taylor', type: 'mention', title: 'Riley Chen mentioned you in #general', body: '@Taylor Kim it\'s attached to the pinned post', link: '/c/general', is_read: false, created_at: ago(80) },
    ],
    announcements: [
      { id: 'a1', title: 'Holiday hours are posted', body: 'We will close at 3 PM on Dec 24 and reopen Dec 26. Please confirm you have seen this.', author_id: 'alex', requires_ack: true, is_pinned: true, created_at: ago(240) },
      { id: 'a2', title: 'New team member', body: 'Please welcome Riley Chen to the Downtown operations team!', author_id: 'jordan', requires_ack: false, is_pinned: false, created_at: ago(1440) },
    ],
    annAcks: [{ id: 'a1', user_id: 'jordan' }, { id: 'a1', user_id: 'sam' }, { id: 'a1', user_id: 'casey' }],
    alerts: [{ id: 'u1', title: 'Freezer down at Main Street', body: 'Do not stock the walk-in until the technician clears it (ETA 2 PM).', author_id: 'jordan', severity: 'urgent', created_at: ago(30) }],
    alertAcks: [{ id: 'u1', user_id: 'casey' }],
    kudos: [
      { id: 'k1', author_id: 'jordan', recipient_id: 'casey', category: 'teamwork', message: 'Thanks for covering the late delivery today!', created_at: ago(18) },
      { id: 'k2', author_id: 'alex', recipient_id: 'sam', category: 'above_and_beyond', message: 'Crushed the weekly goal early. Amazing work.', created_at: ago(110) },
    ],
  }
}

export function createDemoBackend(): Backend {
  let db: Db = (() => { try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s) as Db } catch { /* ignore */ } return seed() })()
  const listeners = new Set<(t: string) => void>()
  const save = (table: string) => { localStorage.setItem(KEY, JSON.stringify(db)); listeners.forEach((l) => l(table)) }
  const me = () => { if (!db.me) throw new Error('Not signed in'); return db.me }
  const rank = () => db.roles.find((r) => r.key === db.profiles.find((p) => p.id === db.me)?.role)?.rank ?? 0
  const withReactions = (ms: Message[]) => ms.map((m) => ({ ...m, reactions: db.reactions.filter((r) => r.message_id === m.id) }))
  const visible = (m: Message) => !m.is_deleted && (m.channel_id ? db.channels.some((c) => c.id === m.channel_id && (c.type !== 'private' || db.members.some((x) => x.channel_id === c.id && x.user_id === db.me)))
    : db.convMembers.some((x) => x.conversation_id === m.conversation_id && x.user_id === db.me))
  const notify = (user_id: string, type: string, title: string, body: string, link: string) =>
    db.notifications.push({ id: uid(), user_id, type, title, body, link, is_read: false, created_at: new Date().toISOString() })
  const nameOf = (id: string) => db.profiles.find((p) => p.id === id)?.full_name ?? 'Someone'

  return {
    mode: 'demo',
    async currentUserId() { return db.me },
    async signIn(email, password) {
      const p = db.profiles.find((x) => x.email?.toLowerCase() === email.trim().toLowerCase())
      if (!p || password !== DEMO_PASSWORD) throw new Error(`Demo login: use a sample email (e.g. alex@example.com) and password "${DEMO_PASSWORD}"`)
      db.me = p.id; save('auth')
    },
    async signUp() { throw new Error('Sign-up is disabled in demo mode.') },
    async signOut() { db.me = null; save('auth') },
    async directory() { return { profiles: db.profiles, locations: db.locations, departments: db.departments, roles: db.roles } },
    async channels() {
      const mine = db.members.filter((m) => m.user_id === db.me).map((m) => m.channel_id)
      return { channels: db.channels.filter((c) => !c.is_archived && (c.type !== 'private' || mine.includes(c.id) || rank() >= 90)), memberOf: mine }
    },
    async conversations() {
      return db.conversations.filter((c) => db.convMembers.some((m) => m.conversation_id === c.id && m.user_id === db.me))
        .map((c) => ({ ...c, member_ids: db.convMembers.filter((m) => m.conversation_id === c.id).map((m) => m.user_id) }))
        .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))
    },
    async unread() {
      const out: Record<string, number> = { notifications: db.notifications.filter((n) => n.user_id === db.me && !n.is_read).length }
      for (const m of [...db.members.filter((x) => x.user_id === db.me).map((x) => ({ id: x.channel_id, at: x.last_read_at, ch: true })),
        ...db.convMembers.filter((x) => x.user_id === db.me).map((x) => ({ id: x.conversation_id, at: x.last_read_at, ch: false }))]) {
        const n = db.messages.filter((x) => (m.ch ? x.channel_id : x.conversation_id) === m.id && !x.parent_message_id && x.user_id !== db.me && !x.is_deleted && x.created_at > m.at).length
        if (n) out[m.id] = n
      }
      return out
    },
    async messages(t) {
      const ms = db.messages.filter((m) => !m.parent_message_id && ('channelId' in t ? m.channel_id === t.channelId : m.conversation_id === t.conversationId) && visible(m))
      return withReactions(ms.sort((a, b) => a.created_at.localeCompare(b.created_at)))
    },
    async thread(parentId) { return withReactions(db.messages.filter((m) => (m.id === parentId || m.parent_message_id === parentId) && visible(m)).sort((a, b) => a.created_at.localeCompare(b.created_at))) },
    async send(t, body, opts = {}) {
      const u = me()
      const attachments = opts.file ? [{ name: opts.file.name, url: URL.createObjectURL(opts.file), mime_type: opts.file.type, size_bytes: opts.file.size }] : []
      const m: Message = { id: uid(), channel_id: 'channelId' in t ? t.channelId : null, conversation_id: 'conversationId' in t ? t.conversationId : null, user_id: u,
        parent_message_id: opts.parentId ?? null, body, reply_count: 0, is_pinned: false, is_deleted: false, created_at: new Date().toISOString(), metadata: { mentions: opts.mentions, attachments } }
      db.messages.push(m)
      if (opts.parentId) { const p = db.messages.find((x) => x.id === opts.parentId); if (p) { p.reply_count++; if (p.user_id !== u) notify(p.user_id, 'thread_reply', `${nameOf(u)} replied in a thread`, body, '') } }
      if (m.channel_id) (opts.mentions ?? []).filter((x) => x !== u).forEach((x) => notify(x, 'mention', `${nameOf(u)} mentioned you`, body, `/c/${m.channel_id}`))
      if (m.conversation_id) {
        const c = db.conversations.find((x) => x.id === m.conversation_id); if (c) c.last_message_at = m.created_at
        db.convMembers.filter((x) => x.conversation_id === m.conversation_id && x.user_id !== u).forEach((x) => notify(x.user_id, 'dm', `New message from ${nameOf(u)}`, body, `/dm/${m.conversation_id}`))
      }
      save('messages')
    },
    async toggleReaction(message_id, emoji) {
      const u = me(); const i = db.reactions.findIndex((r) => r.message_id === message_id && r.user_id === u && r.emoji === emoji)
      if (i >= 0) db.reactions.splice(i, 1); else db.reactions.push({ message_id, user_id: u, emoji })
      save('message_reactions')
    },
    async setPinned(id, pinned) { const m = db.messages.find((x) => x.id === id); if (m) m.is_pinned = pinned; save('messages') },
    async deleteMessage(id) { const m = db.messages.find((x) => x.id === id); if (m && (m.user_id === db.me || rank() >= 90)) { m.is_deleted = true; m.body = '' } save('messages') },
    async markRead(t) {
      const now = new Date().toISOString()
      if ('channelId' in t) db.members.filter((m) => m.channel_id === t.channelId && m.user_id === db.me).forEach((m) => (m.last_read_at = now))
      else db.convMembers.filter((m) => m.conversation_id === t.conversationId && m.user_id === db.me).forEach((m) => (m.last_read_at = now))
      localStorage.setItem(KEY, JSON.stringify(db))
    },
    async createChannel(name, description, isPrivate) {
      const id = uid(); const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      db.channels.push({ id, slug, name: slug, description, type: isPrivate ? 'private' : 'public', is_default: false, is_archived: false })
      db.members.push({ channel_id: id, user_id: me(), last_read_at: new Date().toISOString() }); save('channels'); return id
    },
    async joinChannel(id) { if (!db.members.some((m) => m.channel_id === id && m.user_id === db.me)) db.members.push({ channel_id: id, user_id: me(), last_read_at: new Date(0).toISOString() }); save('channel_members') },
    async openDm(userIds) {
      const all = [...new Set([me(), ...userIds])].sort()
      const existing = db.conversations.find((c) => { const ids = db.convMembers.filter((m) => m.conversation_id === c.id).map((m) => m.user_id).sort(); return ids.join() === all.join() })
      if (existing) return existing.id
      const id = uid(); db.conversations.push({ id, is_group: all.length > 2, title: null, last_message_at: new Date().toISOString() })
      all.forEach((u) => db.convMembers.push({ conversation_id: id, user_id: u, last_read_at: new Date().toISOString() })); save('direct_conversations'); return id
    },
    async search(q) { const s = q.toLowerCase(); return withReactions(db.messages.filter((m) => visible(m) && m.body.toLowerCase().includes(s)).reverse().slice(0, 50)) },
    async notifications() { return db.notifications.filter((n) => n.user_id === db.me).sort((a, b) => b.created_at.localeCompare(a.created_at)) },
    async markAllNotificationsRead() { db.notifications.filter((n) => n.user_id === db.me).forEach((n) => (n.is_read = true)); save('notifications') },
    async announcements() {
      return db.announcements.map((a) => ({ ...a, acked: db.annAcks.some((k) => k.id === a.id && k.user_id === db.me), ack_count: db.annAcks.filter((k) => k.id === a.id).length }))
        .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || b.created_at.localeCompare(a.created_at))
    },
    async postAnnouncement(title, body, requires_ack) {
      if (rank() < 40) throw new Error('Only team leads and above can post announcements.')
      db.announcements.push({ id: uid(), title, body, requires_ack, is_pinned: false, author_id: me(), created_at: new Date().toISOString() })
      db.profiles.filter((p) => p.id !== db.me).forEach((p) => notify(p.id, 'announcement', title, body, '/announcements')); save('announcements')
    },
    async ackAnnouncement(id) { if (!db.annAcks.some((k) => k.id === id && k.user_id === db.me)) db.annAcks.push({ id, user_id: me() }); save('announcements') },
    async alerts() { return db.alerts.map((a) => ({ ...a, acked: db.alertAcks.some((k) => k.id === a.id && k.user_id === db.me), ack_count: db.alertAcks.filter((k) => k.id === a.id).length })).sort((a, b) => b.created_at.localeCompare(a.created_at)) },
    async postAlert(title, body) {
      if (rank() < 40) throw new Error('Only team leads and above can send urgent alerts.')
      db.alerts.push({ id: uid(), title, body, severity: 'urgent', author_id: me(), created_at: new Date().toISOString() })
      db.profiles.forEach((p) => notify(p.id, 'urgent', title, body, '/alerts')); save('urgent_alerts')
    },
    async ackAlert(id) { if (!db.alertAcks.some((k) => k.id === id && k.user_id === db.me)) db.alertAcks.push({ id, user_id: me() }); save('urgent_alerts') },
    async kudos() { return [...db.kudos].sort((a, b) => b.created_at.localeCompare(a.created_at)) },
    async giveKudos(recipient_id, category, message) {
      db.kudos.push({ id: uid(), author_id: me(), recipient_id, category, message, created_at: new Date().toISOString() })
      if (recipient_id !== db.me) notify(recipient_id, 'system', `${nameOf(me())} gave you kudos! 🎉`, message, '/kudos'); save('kudos')
    },
    async updateProfile(id, patch) {
      if (id !== db.me && rank() < 90) throw new Error('Admins only.')
      const p = db.profiles.find((x) => x.id === id); if (p) Object.assign(p, patch); save('profiles')
    },
    async addLocation(name) { if (rank() < 90) throw new Error('Admins only.'); db.locations.push({ id: uid(), slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name }); save('locations') },
    subscribe(fn) { listeners.add(fn); const onStorage = (e: StorageEvent) => { if (e.key === KEY && e.newValue) { db = JSON.parse(e.newValue); fn('*') } }
      window.addEventListener('storage', onStorage); return () => { listeners.delete(fn); window.removeEventListener('storage', onStorage) } },
  }
}

export function resetDemo() { localStorage.removeItem(KEY) }
