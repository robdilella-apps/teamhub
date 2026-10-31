import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Backend, Message, Target, Attachment } from './types'

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const sb: SupabaseClient = createClient(url, anonKey)
  const uid = async () => (await sb.auth.getSession()).data.session?.user.id ?? null
  const must = async () => { const id = await uid(); if (!id) throw new Error('Not signed in'); return id }
  const ok = <T>(r: { data: T | null; error: { message: string } | null }): T => { if (r.error) throw new Error(r.error.message); return r.data as T }
  const okAuth = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message) }
  const targetCol = (t: Target) => ('channelId' in t ? ['channel_id', t.channelId] : ['conversation_id', t.conversationId]) as [string, string]

  async function hydrate(rows: Message[]): Promise<Message[]> {
    if (!rows.length) return rows
    const ids = rows.map((m) => m.id)
    const reactions = ok(await sb.from('message_reactions').select('message_id,user_id,emoji').in('message_id', ids)) ?? []
    const paths = rows.flatMap((m) => (m.metadata?.attachments ?? []).map((a: Attachment & { path?: string }) => a.path).filter(Boolean)) as string[]
    const signed: Record<string, string> = {}
    if (paths.length) {
      const { data } = await sb.storage.from('attachments').createSignedUrls(paths, 3600)
      data?.forEach((d) => { if (d.path && d.signedUrl) signed[d.path] = d.signedUrl })
    }
    return rows.map((m) => ({
      ...m,
      reactions: reactions.filter((r) => r.message_id === m.id),
      metadata: { ...m.metadata, attachments: (m.metadata?.attachments ?? []).map((a: Attachment & { path?: string }) => ({ ...a, url: (a.path && signed[a.path]) || a.url })) },
    }))
  }

  return {
    mode: 'supabase',
    currentUserId: uid,
    async signIn(email, password) { okAuth(await sb.auth.signInWithPassword({ email, password })) },
    async signUp(email, password, full_name) { okAuth(await sb.auth.signUp({ email, password, options: { data: { full_name } } })) },
    async signOut() { await sb.auth.signOut() },
    async directory() {
      const [profiles, locations, departments, roles] = await Promise.all([
        sb.from('profiles').select('id,email,full_name,display_name,role,title,location_id,department_id,is_active,presence').order('full_name'),
        sb.from('locations').select('id,slug,name').order('sort_order'),
        sb.from('departments').select('id,slug,name').order('name'),
        sb.from('roles').select('key,label,rank').order('rank', { ascending: false }),
      ])
      return { profiles: ok(profiles) ?? [], locations: ok(locations) ?? [], departments: ok(departments) ?? [], roles: ok(roles) ?? [] }
    },
    async channels() {
      const me = await must()
      const channels = ok(await sb.from('channels').select('*').eq('is_archived', false).order('name')) ?? []
      const mem = ok(await sb.from('channel_members').select('channel_id').eq('user_id', me)) ?? []
      return { channels, memberOf: mem.map((m) => m.channel_id) }
    },
    async conversations() {
      const me = await must()
      const mine = ok(await sb.from('direct_conversation_members').select('conversation_id').eq('user_id', me)) ?? []
      const ids = mine.map((m) => m.conversation_id)
      if (!ids.length) return []
      const convs = ok(await sb.from('direct_conversations').select('id,is_group,title,last_message_at').in('id', ids).order('last_message_at', { ascending: false })) ?? []
      const members = ok(await sb.from('direct_conversation_members').select('conversation_id,user_id').in('conversation_id', ids)) ?? []
      return convs.map((c) => ({ ...c, member_ids: members.filter((m) => m.conversation_id === c.id).map((m) => m.user_id) }))
    },
    async unread() {
      const r = ok(await sb.rpc('get_unread_summary')) as { channels: { channel_id: string; unread: number }[]; conversations: { conversation_id: string; unread: number }[]; notifications: number }
      const out: Record<string, number> = { notifications: r.notifications }
      r.channels.forEach((c) => (out[c.channel_id] = c.unread))
      r.conversations.forEach((c) => (out[c.conversation_id] = c.unread))
      return out
    },
    async messages(t) {
      const [col, id] = targetCol(t)
      const rows = ok(await sb.from('messages').select('*').eq(col, id).is('parent_message_id', null).eq('is_deleted', false).order('created_at', { ascending: false }).limit(200)) ?? []
      return hydrate(rows.reverse())
    },
    async thread(parentId) {
      const rows = ok(await sb.from('messages').select('*').or(`id.eq.${parentId},parent_message_id.eq.${parentId}`).eq('is_deleted', false).order('created_at')) ?? []
      return hydrate(rows)
    },
    async send(t, body, opts = {}) {
      const me = await must()
      const [col, id] = targetCol(t)
      const attachments: (Attachment & { path: string })[] = []
      if (opts.file) {
        const path = `${me}/${crypto.randomUUID()}-${opts.file.name.replace(/[^\w.-]+/g, '_')}`
        ok(await sb.storage.from('attachments').upload(path, opts.file, { contentType: opts.file.type }))
        attachments.push({ name: opts.file.name, path, url: '', mime_type: opts.file.type, size_bytes: opts.file.size })
      }
      const msg = ok(await sb.from('messages').insert({ [col]: id, user_id: me, body, parent_message_id: opts.parentId ?? null, metadata: { mentions: opts.mentions ?? [], attachments } }).select('id').single()) as { id: string }
      for (const a of attachments) {
        await sb.from('files').insert({ message_id: msg.id, [col]: id, uploader_id: me, path: a.path, name: a.name, mime_type: a.mime_type, size_bytes: a.size_bytes })
      }
    },
    async toggleReaction(messageId, emoji) {
      const me = await must()
      const existing = ok(await sb.from('message_reactions').select('id').match({ message_id: messageId, user_id: me, emoji })) ?? []
      if (existing.length) ok(await sb.from('message_reactions').delete().eq('id', existing[0].id))
      else ok(await sb.from('message_reactions').insert({ message_id: messageId, user_id: me, emoji }))
    },
    async setPinned(messageId, pinned) {
      const me = await must()
      ok(await sb.from('messages').update({ is_pinned: pinned, pinned_by: pinned ? me : null, pinned_at: pinned ? new Date().toISOString() : null }).eq('id', messageId))
    },
    async deleteMessage(messageId) { ok(await sb.from('messages').update({ is_deleted: true, deleted_at: new Date().toISOString(), body: '' }).eq('id', messageId)) },
    async markRead(t) {
      if ('channelId' in t) await sb.rpc('mark_channel_read', { cid: t.channelId })
      else await sb.rpc('mark_conversation_read', { convid: t.conversationId })
    },
    async createChannel(name, description, isPrivate) {
      const me = await must()
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 6)
      const ch = ok(await sb.from('channels').insert({ slug, name: name.toLowerCase().replace(/\s+/g, '-'), description, type: isPrivate ? 'private' : 'public', created_by: me }).select('id').single()) as { id: string }
      ok(await sb.from('channel_members').insert({ channel_id: ch.id, user_id: me, role: 'admin' }))
      return ch.id
    },
    async joinChannel(id) { const me = await must(); ok(await sb.from('channel_members').upsert({ channel_id: id, user_id: me })) },
    async openDm(userIds) {
      if (userIds.length === 1) return ok(await sb.rpc('get_or_create_dm', { other_user: userIds[0] })) as string
      return ok(await sb.rpc('create_group_dm', { member_ids: userIds, group_title: null })) as string
    },
    async search(q) { return hydrate((ok(await sb.rpc('search_messages', { q, max_rows: 50 })) as Message[]) ?? []) },
    async notifications() { return ok(await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(100)) ?? [] },
    async markAllNotificationsRead() { await sb.rpc('mark_all_notifications_read') },
    async announcements() {
      const me = await must()
      const rows = ok(await sb.from('announcements').select('*').order('is_pinned', { ascending: false }).order('created_at', { ascending: false })) ?? []
      const acks = ok(await sb.from('announcement_acknowledgements').select('announcement_id,user_id')) ?? []
      return rows.map((a) => ({ ...a, acked: acks.some((k) => k.announcement_id === a.id && k.user_id === me), ack_count: acks.filter((k) => k.announcement_id === a.id).length }))
    },
    async postAnnouncement(title, body, requires_ack) { const me = await must(); ok(await sb.from('announcements').insert({ title, body, requires_ack, author_id: me })) },
    async ackAnnouncement(id) { const me = await must(); ok(await sb.from('announcement_acknowledgements').upsert({ announcement_id: id, user_id: me })) },
    async alerts() {
      const me = await must()
      const rows = ok(await sb.from('urgent_alerts').select('*').order('created_at', { ascending: false }).limit(50)) ?? []
      const acks = ok(await sb.from('urgent_alert_acknowledgements').select('alert_id,user_id')) ?? []
      return rows.map((a) => ({ ...a, acked: acks.some((k) => k.alert_id === a.id && k.user_id === me), ack_count: acks.filter((k) => k.alert_id === a.id).length }))
    },
    async postAlert(title, body) { const me = await must(); ok(await sb.from('urgent_alerts').insert({ title, body, author_id: me })) },
    async ackAlert(id) { const me = await must(); ok(await sb.from('urgent_alert_acknowledgements').upsert({ alert_id: id, user_id: me })) },
    async kudos() { return ok(await sb.from('kudos').select('*').order('created_at', { ascending: false }).limit(100)) ?? [] },
    async giveKudos(recipient_id, category, message) { const me = await must(); ok(await sb.from('kudos').insert({ author_id: me, recipient_id, category, message })) },
    async updateProfile(id, patch) { ok(await sb.from('profiles').update(patch).eq('id', id)) },
    async addLocation(name) { ok(await sb.from('locations').insert({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') })) },
    subscribe(onChange) {
      const ch = sb.channel('teamhub-live')
      for (const table of ['messages', 'message_reactions', 'notifications', 'channels', 'channel_members', 'direct_conversations', 'announcements', 'urgent_alerts', 'kudos'])
        ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange(table))
      ch.subscribe()
      return () => { sb.removeChannel(ch) }
    },
  }
}
