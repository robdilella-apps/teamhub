export interface Profile {
  id: string; email: string | null; full_name: string; display_name?: string | null
  role: string; title?: string | null; location_id?: string | null; department_id?: string | null
  is_active: boolean; presence?: string
}
export interface Location { id: string; slug: string; name: string }
export interface Department { id: string; slug: string; name: string }
export interface Role { key: string; label: string; rank: number }
export interface Channel {
  id: string; slug: string; name: string; description?: string | null
  type: 'public' | 'private' | 'announcement' | 'admin' | 'location' | 'department'
  is_default: boolean; is_archived: boolean; location_id?: string | null
}
export interface Conversation { id: string; is_group: boolean; title: string | null; last_message_at: string; member_ids: string[] }
export interface Reaction { message_id: string; user_id: string; emoji: string }
export interface Attachment { name: string; url: string; mime_type?: string | null; size_bytes?: number }
export interface Message {
  id: string; channel_id: string | null; conversation_id: string | null; user_id: string
  parent_message_id: string | null; body: string; reply_count: number; is_pinned: boolean
  is_deleted: boolean; created_at: string; metadata: { mentions?: string[]; attachments?: Attachment[] }
  reactions?: Reaction[]
}
export interface Notification { id: string; type: string; title: string; body: string | null; link: string | null; is_read: boolean; created_at: string }
export interface Announcement { id: string; title: string; body: string; author_id: string | null; requires_ack: boolean; is_pinned: boolean; created_at: string; acked: boolean; ack_count?: number }
export interface UrgentAlert { id: string; title: string; body: string; author_id: string | null; severity: string; created_at: string; acked: boolean; ack_count?: number }
export interface Kudos { id: string; author_id: string; recipient_id: string; category: string; message: string; created_at: string }
export type Target = { channelId: string } | { conversationId: string }

export interface Directory { profiles: Profile[]; locations: Location[]; departments: Department[]; roles: Role[] }

/** Everything the UI needs from a backend. Implemented by Supabase and by the in-browser demo. */
export interface Backend {
  mode: 'supabase' | 'demo'
  currentUserId(): Promise<string | null>
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string, fullName: string): Promise<void>
  signOut(): Promise<void>
  directory(): Promise<Directory>
  channels(): Promise<{ channels: Channel[]; memberOf: string[] }>
  conversations(): Promise<Conversation[]>
  unread(): Promise<Record<string, number>>
  messages(t: Target): Promise<Message[]>
  thread(parentId: string): Promise<Message[]>
  send(t: Target, body: string, opts?: { parentId?: string; file?: File; mentions?: string[] }): Promise<void>
  toggleReaction(messageId: string, emoji: string): Promise<void>
  setPinned(messageId: string, pinned: boolean): Promise<void>
  deleteMessage(messageId: string): Promise<void>
  markRead(t: Target): Promise<void>
  createChannel(name: string, description: string, isPrivate: boolean): Promise<string>
  joinChannel(id: string): Promise<void>
  openDm(userIds: string[]): Promise<string>
  search(q: string): Promise<Message[]>
  notifications(): Promise<Notification[]>
  markAllNotificationsRead(): Promise<void>
  announcements(): Promise<Announcement[]>
  postAnnouncement(title: string, body: string, requiresAck: boolean): Promise<void>
  ackAnnouncement(id: string): Promise<void>
  alerts(): Promise<UrgentAlert[]>
  postAlert(title: string, body: string): Promise<void>
  ackAlert(id: string): Promise<void>
  kudos(): Promise<Kudos[]>
  giveKudos(recipientId: string, category: string, message: string): Promise<void>
  updateProfile(id: string, patch: Partial<Pick<Profile, 'role' | 'is_active' | 'title' | 'full_name' | 'location_id'>>): Promise<void>
  addLocation(name: string): Promise<void>
  subscribe(onChange: (table: string) => void): () => void
}
