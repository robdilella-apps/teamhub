-- TeamHub — Core schema
-- Architecture notes:
--   * Single-workspace model (one business, any number of locations) inspired by Mattermost/Slack
--     team→channel→message hierarchy, collapsed to channel→message since there is one team.
--   * Messages are polymorphic: exactly one of channel_id / conversation_id is set.
--   * Unread state is tracked with last_read_at on membership rows (channel_members /
--     direct_conversation_members) — the same approach Supabase Realtime chat examples use —
--     which keeps unread math to a single indexed COUNT rather than per-message read rows.
--   * Mentions, thread replies and reactions fan out into `notifications` via triggers.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Lookup tables
-- ---------------------------------------------------------------------------
create table if not exists public.roles (
  key         text primary key,
  label       text not null,
  rank        int  not null default 0,   -- higher = more privileged
  description text
);

create table if not exists public.locations (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  name       text not null,
  address    text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.departments (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  name       text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  email              text,
  full_name          text not null default '',
  display_name       text,
  avatar_url         text,
  role               text not null default 'member' references public.roles (key),
  location_id        uuid references public.locations (id) on delete set null,
  department_id      uuid references public.departments (id) on delete set null,
  title              text,
  phone              text,
  bio                text,
  presence           text not null default 'offline',    -- online | away | offline
  custom_status      text,
  notification_prefs jsonb not null default jsonb_build_object(
    'dm', true, 'mentions', true, 'announcements', true, 'urgent', true,
    'channels', true, 'browser_push', true, 'sound', true
  ),
  is_active          boolean not null default true,
  last_seen_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_profiles_location on public.profiles (location_id);
create index if not exists idx_profiles_department on public.profiles (department_id);
create index if not exists idx_profiles_role on public.profiles (role);
create index if not exists idx_profiles_name_trgm on public.profiles using gin (full_name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Channels
-- ---------------------------------------------------------------------------
create table if not exists public.channels (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  description   text,
  topic         text,
  type          text not null default 'public'
                  check (type in ('public','private','announcement','admin','location','department')),
  location_id   uuid references public.locations (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  is_default    boolean not null default false,   -- auto-join for everyone
  is_archived   boolean not null default false,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_channels_type on public.channels (type);
create index if not exists idx_channels_location on public.channels (location_id);
create index if not exists idx_channels_department on public.channels (department_id);
create index if not exists idx_channels_archived on public.channels (is_archived);

create table if not exists public.channel_members (
  channel_id   uuid not null references public.channels (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         text not null default 'member' check (role in ('member','admin')),
  is_muted     boolean not null default false,
  last_read_at timestamptz not null default now(),
  joined_at    timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index if not exists idx_channel_members_user on public.channel_members (user_id);

-- ---------------------------------------------------------------------------
-- Direct conversations (1:1 and group DMs)
-- ---------------------------------------------------------------------------
create table if not exists public.direct_conversations (
  id              uuid primary key default gen_random_uuid(),
  is_group        boolean not null default false,
  title           text,
  member_key      text unique,   -- sorted member id list for 1:1 dedupe
  created_by      uuid references public.profiles (id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create table if not exists public.direct_conversation_members (
  conversation_id uuid not null references public.direct_conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  is_muted        boolean not null default false,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists idx_dm_members_user on public.direct_conversation_members (user_id);

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id                uuid primary key default gen_random_uuid(),
  channel_id        uuid references public.channels (id) on delete cascade,
  conversation_id   uuid references public.direct_conversations (id) on delete cascade,
  user_id           uuid not null references public.profiles (id) on delete cascade,
  parent_message_id uuid references public.messages (id) on delete cascade,
  body              text not null default '',
  message_type      text not null default 'user' check (message_type in ('user','system')),
  metadata          jsonb not null default '{}'::jsonb,   -- { mentions: [uuid], ... }
  reply_count       int not null default 0,
  last_reply_at     timestamptz,
  is_edited         boolean not null default false,
  edited_at         timestamptz,
  is_deleted        boolean not null default false,
  deleted_at        timestamptz,
  is_pinned         boolean not null default false,
  pinned_by         uuid references public.profiles (id) on delete set null,
  pinned_at         timestamptz,
  created_at        timestamptz not null default now(),
  constraint msg_target_exactly_one
    check ((channel_id is not null)::int + (conversation_id is not null)::int = 1)
);
create index if not exists idx_messages_channel_created on public.messages (channel_id, created_at desc);
create index if not exists idx_messages_conversation_created on public.messages (conversation_id, created_at desc);
create index if not exists idx_messages_parent on public.messages (parent_message_id);
create index if not exists idx_messages_user on public.messages (user_id);
create index if not exists idx_messages_pinned on public.messages (channel_id) where is_pinned;
create index if not exists idx_messages_body_trgm on public.messages using gin (body gin_trgm_ops);

create table if not exists public.message_reactions (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);
create index if not exists idx_reactions_message on public.message_reactions (message_id);

-- Reserved for explicit per-message read receipts (DM "seen" indicators).
create table if not exists public.message_reads (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  read_at    timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Files (Supabase Storage metadata)
-- ---------------------------------------------------------------------------
create table if not exists public.files (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid references public.messages (id) on delete cascade,
  channel_id      uuid references public.channels (id) on delete cascade,
  conversation_id uuid references public.direct_conversations (id) on delete cascade,
  uploader_id     uuid not null references public.profiles (id) on delete cascade,
  bucket          text not null default 'attachments',
  path            text not null,
  name            text not null,
  mime_type       text,
  size_bytes      bigint not null default 0,
  width           int,
  height          int,
  created_at      timestamptz not null default now()
);
create index if not exists idx_files_channel on public.files (channel_id);
create index if not exists idx_files_conversation on public.files (conversation_id);
create index if not exists idx_files_uploader on public.files (uploader_id);
create index if not exists idx_files_name_trgm on public.files using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        text not null,   -- mention | dm | reaction | thread_reply | announcement | urgent | channel_invite | system
  title       text not null,
  body        text,
  actor_id    uuid references public.profiles (id) on delete set null,
  link        text,
  entity_type text,
  entity_id   uuid,
  channel_id  uuid references public.channels (id) on delete cascade,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notifications_user_unread on public.notifications (user_id, is_read, created_at desc);

-- ---------------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------------
create table if not exists public.announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text not null default '',
  author_id     uuid references public.profiles (id) on delete set null,
  audience      text not null default 'all' check (audience in ('all','location','department')),
  location_id   uuid references public.locations (id) on delete cascade,
  department_id uuid references public.departments (id) on delete cascade,
  is_pinned     boolean not null default false,
  requires_ack  boolean not null default false,
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_announcements_created on public.announcements (created_at desc);

create table if not exists public.announcement_acknowledgements (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Urgent alerts
-- ---------------------------------------------------------------------------
create table if not exists public.urgent_alerts (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  body            text not null default '',
  author_id       uuid references public.profiles (id) on delete set null,
  severity        text not null default 'urgent' check (severity in ('urgent','critical')),
  audience        text not null default 'all' check (audience in ('all','location','department','users')),
  location_id     uuid references public.locations (id) on delete cascade,
  department_id   uuid references public.departments (id) on delete cascade,
  target_user_ids uuid[],
  requires_ack    boolean not null default true,
  expires_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists idx_urgent_created on public.urgent_alerts (created_at desc);

create table if not exists public.urgent_alert_acknowledgements (
  alert_id        uuid not null references public.urgent_alerts (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (alert_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Kudos (team recognition)
-- ---------------------------------------------------------------------------
create table if not exists public.kudos (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  category     text not null default 'above_and_beyond',
  message      text not null,
  location_id  uuid references public.locations (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_kudos_recipient on public.kudos (recipient_id);
create index if not exists idx_kudos_created on public.kudos (created_at desc);

-- ---------------------------------------------------------------------------
-- Audit logs
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_created on public.audit_logs (created_at desc);
create index if not exists idx_audit_actor on public.audit_logs (actor_id);


-- TeamHub — Triggers & automation

-- Generic updated_at maintenance ------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','channels','announcements'
  ] loop
    execute format(
      'drop trigger if exists trg_%1$s_updated on public.%1$s;
       create trigger trg_%1$s_updated before update on public.%1$s
       for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- Provision a profile row whenever a new auth user is created -------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_location uuid;
  v_department uuid;
  v_role text;
begin
  select id into v_location from public.locations
    where slug = coalesce(new.raw_user_meta_data->>'location_slug', '') limit 1;
  select id into v_department from public.departments
    where slug = coalesce(new.raw_user_meta_data->>'department_slug', '') limit 1;

  -- The very first user to sign up becomes the owner/admin so the app is usable.
  if not exists (select 1 from public.profiles) then
    v_role := 'owner';
  else
    v_role := coalesce(new.raw_user_meta_data->>'role', 'member');
    if not exists (select 1 from public.roles where key = v_role) then
      v_role := 'member';
    end if;
  end if;

  insert into public.profiles (id, email, full_name, display_name, role, location_id, department_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'display_name',
    v_role,
    v_location,
    v_department
  )
  on conflict (id) do nothing;

  -- Auto-join every default channel, plus the channels for this member's
  -- location and department so their sidebar is useful on first login.
  insert into public.channel_members (channel_id, user_id)
  select c.id, new.id from public.channels c
  where c.is_default
     or (c.type = 'location' and c.location_id is not distinct from v_location and v_location is not null)
     or (c.type = 'department' and c.department_id is not distinct from v_department and v_department is not null)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep role privilege from being self-escalated --------------------------------
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_priv boolean;
begin
  select role in ('owner','admin') into is_priv from public.profiles where id = auth.uid();
  if coalesce(is_priv, false) then
    return new;   -- admins may change anything
  end if;
  -- Non-admins cannot change their own role or activation status.
  if new.role is distinct from old.role then
    new.role := old.role;
  end if;
  if new.is_active is distinct from old.is_active then
    new.is_active := old.is_active;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile on public.profiles;
create trigger trg_guard_profile before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- Message side effects: reply counts, DM ordering, mention/reply notifications --
create or replace function public.handle_new_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  mentioned uuid;
  parent_author uuid;
  actor_name text;
  ch_name text;
  conv_title text;
  target uuid;
begin
  select coalesce(display_name, full_name) into actor_name from public.profiles where id = new.user_id;

  -- Thread reply bookkeeping + notify the parent author.
  if new.parent_message_id is not null then
    update public.messages
      set reply_count = reply_count + 1, last_reply_at = new.created_at
      where id = new.parent_message_id
      returning user_id into parent_author;
    if parent_author is not null and parent_author <> new.user_id then
      insert into public.notifications (user_id, type, title, body, actor_id, entity_type, entity_id, channel_id, link)
      values (parent_author, 'thread_reply', coalesce(actor_name,'Someone') || ' replied in a thread',
              left(new.body, 140), new.user_id, 'message', new.id, new.channel_id,
              case when new.channel_id is not null then '/channel/' || new.channel_id
                   else '/dm/' || new.conversation_id end);
    end if;
  end if;

  -- Channel bookkeeping.
  if new.channel_id is not null then
    select name into ch_name from public.channels where id = new.channel_id;
    -- @mentions carried in metadata.mentions (array of profile ids resolved client-side)
    if new.metadata ? 'mentions' then
      for mentioned in select (jsonb_array_elements_text(new.metadata->'mentions'))::uuid loop
        if mentioned <> new.user_id then
          insert into public.notifications (user_id, type, title, body, actor_id, entity_type, entity_id, channel_id, link)
          values (mentioned, 'mention', coalesce(actor_name,'Someone') || ' mentioned you in #' || coalesce(ch_name,'a channel'),
                  left(new.body, 140), new.user_id, 'message', new.id, new.channel_id, '/channel/' || new.channel_id);
        end if;
      end loop;
    end if;
  end if;

  -- DM bookkeeping: bump conversation, notify the other members.
  if new.conversation_id is not null then
    update public.direct_conversations set last_message_at = new.created_at where id = new.conversation_id
      returning title into conv_title;
    for target in
      select user_id from public.direct_conversation_members
      where conversation_id = new.conversation_id and user_id <> new.user_id
    loop
      insert into public.notifications (user_id, type, title, body, actor_id, entity_type, entity_id, link)
      values (target, 'dm', 'New message from ' || coalesce(actor_name,'someone'),
              left(new.body, 140), new.user_id, 'message', new.id, '/dm/' || new.conversation_id);
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_handle_new_message on public.messages;
create trigger trg_handle_new_message after insert on public.messages
  for each row execute function public.handle_new_message();

-- Notify message author when someone reacts ------------------------------------
create or replace function public.handle_new_reaction()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  author uuid;
  actor_name text;
  ch uuid;
  conv uuid;
begin
  select user_id, channel_id, conversation_id into author, ch, conv
    from public.messages where id = new.message_id;
  if author is null or author = new.user_id then
    return new;
  end if;
  select coalesce(display_name, full_name) into actor_name from public.profiles where id = new.user_id;
  insert into public.notifications (user_id, type, title, body, actor_id, entity_type, entity_id, channel_id, link)
  values (author, 'reaction', coalesce(actor_name,'Someone') || ' reacted ' || new.emoji, null,
          new.user_id, 'message', new.message_id, ch,
          case when ch is not null then '/channel/' || ch else '/dm/' || conv end);
  return new;
end;
$$;

drop trigger if exists trg_handle_new_reaction on public.message_reactions;
create trigger trg_handle_new_reaction after insert on public.message_reactions
  for each row execute function public.handle_new_reaction();

-- Notify recipient of kudos -----------------------------------------------
create or replace function public.handle_new_kudos()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text;
begin
  select coalesce(display_name, full_name) into actor_name from public.profiles where id = new.author_id;
  if new.recipient_id <> new.author_id then
    insert into public.notifications (user_id, type, title, body, actor_id, entity_type, entity_id, link)
    values (new.recipient_id, 'system', coalesce(actor_name,'Someone') || ' gave you kudos! 🎉',
            left(new.message, 140), new.author_id, 'kudos', new.id, '/dashboard');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_handle_new_kudos on public.kudos;
create trigger trg_handle_new_kudos after insert on public.kudos
  for each row execute function public.handle_new_kudos();


-- TeamHub — Row Level Security
-- All membership/role checks are SECURITY DEFINER functions so they bypass RLS on the
-- tables they read. This is the standard Supabase pattern that prevents the infinite
-- recursion you otherwise get when a channels policy reads channel_members and the
-- channel_members policy reads channels.

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_active from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.my_role_rank()
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select r.rank from public.profiles p join public.roles r on r.key = p.role
                   where p.id = auth.uid()), 0);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role_rank() >= 90;
$$;

create or replace function public.can_moderate()   -- leadership and up (announcements, urgent alerts)
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role_rank() >= 40;
$$;

create or replace function public.can_manage()      -- manager and up 
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role_rank() >= 30;
$$;

create or replace function public.my_location()
returns uuid language sql stable security definer set search_path = public as $$
  select location_id from public.profiles where id = auth.uid();
$$;

create or replace function public.my_department()
returns uuid language sql stable security definer set search_path = public as $$
  select department_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_channel_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.channel_members
                 where channel_id = cid and user_id = auth.uid());
$$;

create or replace function public.is_channel_admin(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.channel_members
                 where channel_id = cid and user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.can_view_channel(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or public.is_channel_member(cid)
    or exists (select 1 from public.channels c
               where c.id = cid and c.type in ('public','announcement','location','department'));
$$;

create or replace function public.can_post_channel(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.channels c
    where c.id = cid and not c.is_archived and (
      -- announcement & admin channels are post-restricted to moderators/admins
      case
        when c.type = 'announcement' then public.can_moderate()
        when c.type = 'admin' then public.is_admin() or public.is_channel_admin(cid)
        else public.is_channel_member(cid) or public.can_view_channel(cid)
      end
    )
  );
$$;

create or replace function public.is_conversation_member(convid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.direct_conversation_members
                 where conversation_id = convid and user_id = auth.uid());
$$;

create or replace function public.can_view_message(mid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.messages m where m.id = mid and (
      (m.channel_id is not null and public.can_view_channel(m.channel_id)) or
      (m.conversation_id is not null and public.is_conversation_member(m.conversation_id))
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'roles','locations','departments','profiles','channels','channel_members',
    'direct_conversations','direct_conversation_members','messages','message_reactions',
    'message_reads','files','notifications','announcements','announcement_acknowledgements',
    'urgent_alerts','urgent_alert_acknowledgements',
    'kudos','audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Lookup tables — everyone reads, admins write
-- ---------------------------------------------------------------------------
-- Lookup lists are non-sensitive and are needed on the sign-up screen (pre-auth),
-- so reads are public; writes remain admin-only.
create policy roles_read on public.roles for select using (true);
create policy roles_admin on public.roles for all using (public.is_admin()) with check (public.is_admin());

create policy locations_read on public.locations for select using (true);
create policy locations_admin on public.locations for all using (public.is_admin()) with check (public.is_admin());

create policy departments_read on public.departments for select using (true);
create policy departments_admin on public.departments for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles for select
  using (auth.uid() = id or public.is_active_user());
create policy profiles_insert on public.profiles for insert
  with check (auth.uid() = id);
create policy profiles_update_self on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);
create policy profiles_update_admin on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Channels
-- ---------------------------------------------------------------------------
create policy channels_select on public.channels for select
  using (public.can_view_channel(id) and public.is_active_user());
create policy channels_insert on public.channels for insert
  with check (
    public.is_active_user() and created_by = auth.uid() and (
      type in ('public','private') or public.can_manage()
    )
  );
create policy channels_update on public.channels for update
  using (public.is_channel_admin(id) or public.can_manage())
  with check (public.is_channel_admin(id) or public.can_manage());
create policy channels_delete on public.channels for delete using (public.is_admin());

-- Channel members
create policy channel_members_select on public.channel_members for select
  using (public.can_view_channel(channel_id) or public.is_admin());
create policy channel_members_insert on public.channel_members for insert
  with check (
    public.is_admin() or public.is_channel_admin(channel_id) or public.can_manage() or (
      user_id = auth.uid() and exists (
        select 1 from public.channels c
        where c.id = channel_id and c.type in ('public','announcement','location','department')
      )
    )
  );
create policy channel_members_update on public.channel_members for update
  using (user_id = auth.uid() or public.is_channel_admin(channel_id) or public.is_admin())
  with check (user_id = auth.uid() or public.is_channel_admin(channel_id) or public.is_admin());
create policy channel_members_delete on public.channel_members for delete
  using (user_id = auth.uid() or public.is_channel_admin(channel_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- Direct conversations
-- ---------------------------------------------------------------------------
create policy dc_select on public.direct_conversations for select
  using (public.is_conversation_member(id));
create policy dc_insert on public.direct_conversations for insert
  with check (created_by = auth.uid() and public.is_active_user());
create policy dc_update on public.direct_conversations for update
  using (public.is_conversation_member(id)) with check (public.is_conversation_member(id));

create policy dcm_select on public.direct_conversation_members for select
  using (public.is_conversation_member(conversation_id));
create policy dcm_insert on public.direct_conversation_members for insert
  with check (
    user_id = auth.uid()
    or public.is_conversation_member(conversation_id)
    or exists (select 1 from public.direct_conversations dc
               where dc.id = conversation_id and dc.created_by = auth.uid())
  );
create policy dcm_update on public.direct_conversation_members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy dcm_delete on public.direct_conversation_members for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
create policy messages_select on public.messages for select
  using (
    public.is_active_user() and (
      (channel_id is not null and public.can_view_channel(channel_id)) or
      (conversation_id is not null and public.is_conversation_member(conversation_id))
    )
  );
create policy messages_insert on public.messages for insert
  with check (
    user_id = auth.uid() and public.is_active_user() and (
      (channel_id is not null and public.can_post_channel(channel_id)) or
      (conversation_id is not null and public.is_conversation_member(conversation_id))
    )
  );
create policy messages_update on public.messages for update
  using (user_id = auth.uid() or public.is_channel_admin(channel_id) or public.is_admin())
  with check (user_id = auth.uid() or public.is_channel_admin(channel_id) or public.is_admin());
create policy messages_delete on public.messages for delete
  using (user_id = auth.uid() or public.is_channel_admin(channel_id) or public.is_admin());

-- Reactions
create policy reactions_select on public.message_reactions for select
  using (public.can_view_message(message_id));
create policy reactions_insert on public.message_reactions for insert
  with check (user_id = auth.uid() and public.can_view_message(message_id));
create policy reactions_delete on public.message_reactions for delete
  using (user_id = auth.uid());

-- Read receipts
create policy reads_select on public.message_reads for select
  using (user_id = auth.uid() or public.can_view_message(message_id));
create policy reads_upsert on public.message_reads for insert
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Files
-- ---------------------------------------------------------------------------
create policy files_select on public.files for select
  using (
    uploader_id = auth.uid()
    or (channel_id is not null and public.can_view_channel(channel_id))
    or (conversation_id is not null and public.is_conversation_member(conversation_id))
  );
create policy files_insert on public.files for insert
  with check (uploader_id = auth.uid() and public.is_active_user());
create policy files_delete on public.files for delete
  using (uploader_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Notifications (owner-only; created by SECURITY DEFINER triggers/RPCs)
-- ---------------------------------------------------------------------------
create policy notifications_select on public.notifications for select using (user_id = auth.uid());
create policy notifications_update on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------------
create policy announcements_select on public.announcements for select
  using (
    public.is_active_user() and (
      public.can_moderate()
      or audience = 'all'
      or (audience = 'location' and location_id = public.my_location())
      or (audience = 'department' and department_id = public.my_department())
    )
  );
create policy announcements_write on public.announcements for all
  using (public.can_moderate()) with check (public.can_moderate());

create policy ann_ack_select on public.announcement_acknowledgements for select
  using (user_id = auth.uid() or public.can_moderate());
create policy ann_ack_insert on public.announcement_acknowledgements for insert
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Urgent alerts
-- ---------------------------------------------------------------------------
create policy urgent_select on public.urgent_alerts for select
  using (
    public.is_active_user() and (
      public.can_moderate()
      or audience = 'all'
      or (audience = 'location' and location_id = public.my_location())
      or (audience = 'department' and department_id = public.my_department())
      or (audience = 'users' and auth.uid() = any(target_user_ids))
    )
  );
create policy urgent_write on public.urgent_alerts for all
  using (public.can_moderate()) with check (public.can_moderate());

create policy urgent_ack_select on public.urgent_alert_acknowledgements for select
  using (user_id = auth.uid() or public.can_moderate());
create policy urgent_ack_insert on public.urgent_alert_acknowledgements for insert
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Shoutouts
-- ---------------------------------------------------------------------------
create policy kudos_select on public.kudos for select using (public.is_active_user());
create policy kudos_insert on public.kudos for insert
  with check (author_id = auth.uid() and public.is_active_user());
create policy kudos_delete on public.kudos for delete
  using (author_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Audit logs (admin reads; anyone may append their own action)
-- ---------------------------------------------------------------------------
create policy audit_select on public.audit_logs for select using (public.is_admin());
create policy audit_insert on public.audit_logs for insert
  with check (actor_id = auth.uid() or public.is_admin());


-- TeamHub — RPC functions used by the client

-- Find or create a 1:1 DM between the caller and another user. -----------------
create or replace function public.get_or_create_dm(other_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  key text;
  conv uuid;
begin
  if me is null or other_user is null or me = other_user then
    raise exception 'invalid DM target';
  end if;
  -- deterministic key for the unordered pair
  key := (select string_agg(x::text, ':' order by x) from unnest(array[me, other_user]) as x);
  select id into conv from public.direct_conversations
    where is_group = false and member_key = key limit 1;
  if conv is not null then
    return conv;
  end if;
  insert into public.direct_conversations (is_group, member_key, created_by)
    values (false, key, me) returning id into conv;
  insert into public.direct_conversation_members (conversation_id, user_id)
    values (conv, me), (conv, other_user);
  return conv;
end;
$$;

-- Create a group DM with an explicit member list. ------------------------------
create or replace function public.create_group_dm(member_ids uuid[], group_title text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  conv uuid;
  members uuid[];
  m uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  members := (select array_agg(distinct x) from unnest(member_ids || array[me]) as x);
  insert into public.direct_conversations (is_group, title, created_by)
    values (true, group_title, me) returning id into conv;
  foreach m in array members loop
    insert into public.direct_conversation_members (conversation_id, user_id)
      values (conv, m) on conflict do nothing;
  end loop;
  return conv;
end;
$$;

-- Mark read helpers ------------------------------------------------------------
create or replace function public.mark_channel_read(cid uuid)
returns void language sql security definer set search_path = public as $$
  update public.channel_members set last_read_at = now()
   where channel_id = cid and user_id = auth.uid();
$$;

create or replace function public.mark_conversation_read(convid uuid)
returns void language sql security definer set search_path = public as $$
  update public.direct_conversation_members set last_read_at = now()
   where conversation_id = convid and user_id = auth.uid();
$$;

-- Unread summary used to drive sidebar badges. ---------------------------------
create or replace function public.get_unread_summary()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  result jsonb;
begin
  select jsonb_build_object(
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object('channel_id', cm.channel_id, 'unread', u.cnt))
      from public.channel_members cm
      join lateral (
        select count(*) as cnt from public.messages m
        where m.channel_id = cm.channel_id
          and m.created_at > cm.last_read_at
          and m.user_id <> me
          and m.is_deleted = false
          and m.parent_message_id is null
      ) u on true
      where cm.user_id = me and u.cnt > 0
    ), '[]'::jsonb),
    'conversations', coalesce((
      select jsonb_agg(jsonb_build_object('conversation_id', dm.conversation_id, 'unread', u.cnt))
      from public.direct_conversation_members dm
      join lateral (
        select count(*) as cnt from public.messages m
        where m.conversation_id = dm.conversation_id
          and m.created_at > dm.last_read_at
          and m.user_id <> me
          and m.is_deleted = false
      ) u on true
      where dm.user_id = me and u.cnt > 0
    ), '[]'::jsonb),
    'notifications', coalesce((
      select count(*) from public.notifications where user_id = me and is_read = false
    ), 0),
    'mentions', coalesce((
      select count(*) from public.notifications
      where user_id = me and is_read = false and type = 'mention'
    ), 0)
  ) into result;
  return result;
end;
$$;

-- Fan out notifications when an announcement is posted. ------------------------
create or replace function public.notify_announcement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, actor_id, entity_type, entity_id, link)
  select p.id, 'announcement', new.title, left(new.body, 160), new.author_id, 'announcement', new.id, '/dashboard'
  from public.profiles p
  where p.is_active
    and p.id <> coalesce(new.author_id, '00000000-0000-0000-0000-000000000000')
    and (
      new.audience = 'all'
      or (new.audience = 'location' and p.location_id = new.location_id)
      or (new.audience = 'department' and p.department_id = new.department_id)
    );
  return new;
end;
$$;
drop trigger if exists trg_notify_announcement on public.announcements;
create trigger trg_notify_announcement after insert on public.announcements
  for each row execute function public.notify_announcement();

-- Fan out notifications when an urgent alert is posted. ------------------------
create or replace function public.notify_urgent()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, actor_id, entity_type, entity_id, link)
  select p.id, 'urgent', new.title, left(new.body, 160), new.author_id, 'urgent_alert', new.id, '/dashboard'
  from public.profiles p
  where p.is_active
    and (
      new.audience = 'all'
      or (new.audience = 'location' and p.location_id = new.location_id)
      or (new.audience = 'department' and p.department_id = new.department_id)
      or (new.audience = 'users' and p.id = any(new.target_user_ids))
    );
  return new;
end;
$$;
drop trigger if exists trg_notify_urgent on public.urgent_alerts;
create trigger trg_notify_urgent after insert on public.urgent_alerts
  for each row execute function public.notify_urgent();

-- Convenience: full-text-ish message search scoped to the caller's visibility. --
create or replace function public.search_messages(q text, max_rows int default 40)
returns setof public.messages language sql stable security definer set search_path = public as $$
  select m.* from public.messages m
  where m.is_deleted = false
    and m.body ilike '%' || q || '%'
    and (
      (m.channel_id is not null and public.can_view_channel(m.channel_id)) or
      (m.conversation_id is not null and public.is_conversation_member(m.conversation_id))
    )
  order by m.created_at desc
  limit greatest(1, least(max_rows, 100));
$$;

-- Mark all notifications read. -------------------------------------------------
create or replace function public.mark_all_notifications_read()
returns void language sql security definer set search_path = public as $$
  update public.notifications set is_read = true where user_id = auth.uid() and is_read = false;
$$;

grant execute on function public.get_or_create_dm(uuid) to authenticated;
grant execute on function public.create_group_dm(uuid[], text) to authenticated;
grant execute on function public.mark_channel_read(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.get_unread_summary() to authenticated;
grant execute on function public.search_messages(text, int) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;


-- TeamHub — Storage buckets, storage RLS, and Realtime publication

-- Buckets ----------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, null)
on conflict (id) do nothing;

-- Attachments are private; the app reads them with signed URLs. 25MB cap.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 26214400, null)
on conflict (id) do nothing;

-- Avatars: world-readable, owner writes to their own <uid>/ folder. ------------
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists avatars_write on storage.objects;
create policy avatars_write on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Attachments: any authenticated member of the workspace may read; owner writes.
-- Discovery is gated by the `files`/`messages` RLS above; object names are UUIDs.
drop policy if exists attachments_read on storage.objects;
create policy attachments_read on storage.objects for select
  using (bucket_id = 'attachments' and auth.role() = 'authenticated');

drop policy if exists attachments_write on storage.objects;
create policy attachments_write on storage.objects for insert
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists attachments_delete on storage.objects;
create policy attachments_delete on storage.objects for delete
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

-- Realtime: broadcast row changes for the live surfaces. -----------------------
do $$
declare t text;
begin
  foreach t in array array[
    'messages','message_reactions','notifications','channel_members',
    'direct_conversations','direct_conversation_members','channels',
    'urgent_alerts','announcements','kudos'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I;', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
