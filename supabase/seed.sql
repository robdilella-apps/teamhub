-- TeamHub — Sample seed data for the fictional "Sample Business Co".
-- Everything here is made up. Safe to re-run on a fresh local database (`supabase db reset`).
-- Demo login for every user below: password  teamhub-demo

insert into public.roles (key, label, rank, description) values
  ('owner',   'Owner',         100, 'Full access, including the admin panel.'),
  ('admin',   'Administrator',  90, 'Manage people, channels, alerts and settings.'),
  ('lead',    'Team Lead',      40, 'Post announcements and urgent alerts.'),
  ('manager', 'Manager',        30, 'Manage a location or department.'),
  ('member',  'Team Member',    10, 'Default role for everyone.')
on conflict (key) do update set label = excluded.label, rank = excluded.rank, description = excluded.description;

insert into public.locations (slug, name, sort_order) values
  ('main-street', 'Main Street', 1),
  ('downtown',    'Downtown',    2)
on conflict (slug) do nothing;

insert into public.departments (slug, name) values
  ('front-of-house', 'Front of House'),
  ('operations',     'Operations'),
  ('sales',          'Sales'),
  ('management',     'Management')
on conflict (slug) do nothing;

insert into public.channels (slug, name, description, type, is_default) values
  ('general',       'general',       'Company-wide chat for the whole team',         'public',       true),
  ('announcements', 'announcements', 'Official news from leadership (read-only)',     'announcement', true),
  ('random',        'random',        'Off-topic, wins, pets and lunch photos',        'public',       true),
  ('managers',      'managers',      'Private channel for managers and admins',       'private',      false)
on conflict (slug) do nothing;

insert into public.channels (slug, name, description, type, location_id, is_default)
select 'loc-' || l.slug, lower(replace(l.name, ' ', '-')), l.name || ' location team', 'location', l.id, false
from public.locations l on conflict (slug) do nothing;

-- Demo users (local development only) -----------------------------------------
do $$
declare
  u record;
begin
  for u in select * from (values
    ('11111111-1111-4111-8111-111111111111'::uuid, 'alex@example.com',   'Alex Morgan',  'owner',   'main-street', 'management',     'Owner'),
    ('22222222-2222-4222-8222-222222222222'::uuid, 'jordan@example.com', 'Jordan Lee',   'manager', 'main-street', 'operations',     'Store Manager'),
    ('33333333-3333-4333-8333-333333333333'::uuid, 'sam@example.com',    'Sam Patel',    'lead',    'downtown',    'sales',          'Sales Lead'),
    ('44444444-4444-4444-8444-444444444444'::uuid, 'taylor@example.com', 'Taylor Kim',   'member',  'downtown',    'front-of-house', 'Front Desk'),
    ('55555555-5555-4555-8555-555555555555'::uuid, 'casey@example.com',  'Casey Rivera', 'member',  'main-street', 'front-of-house', 'Team Member'),
    ('66666666-6666-4666-8666-666666666666'::uuid, 'riley@example.com',  'Riley Chen',   'member',  'downtown',    'operations',     'Inventory')
  ) as t(id, email, full_name, role, loc, dept, title)
  loop
    if not exists (select 1 from auth.users where id = u.id) then
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                              raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                              confirmation_token, recovery_token, email_change_token_new, email_change)
      values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
              crypt('teamhub-demo', gen_salt('bf')), now(),
              '{"provider":"email","providers":["email"]}',
              jsonb_build_object('full_name', u.full_name, 'role', u.role, 'location_slug', u.loc, 'department_slug', u.dept),
              now(), now(), '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email),
              'email', now(), now(), now());
    end if;
    update public.profiles set role = u.role, title = u.title where id = u.id;
  end loop;
end $$;

insert into public.channel_members (channel_id, user_id, role)
select c.id, p.id, case when p.role in ('owner','manager') then 'admin' else 'member' end
from public.channels c, public.profiles p
where c.slug = 'managers' and p.role in ('owner','admin','manager','lead')
on conflict do nothing;

-- Sample conversation ----------------------------------------------------------
do $$
declare
  gen uuid := (select id from public.channels where slug = 'general');
  rnd uuid := (select id from public.channels where slug = 'random');
  mgr uuid := (select id from public.channels where slug = 'managers');
  alex uuid := '11111111-1111-4111-8111-111111111111';
  jordan uuid := '22222222-2222-4222-8222-222222222222';
  sam uuid := '33333333-3333-4333-8333-333333333333';
  taylor uuid := '44444444-4444-4444-8444-444444444444';
  casey uuid := '55555555-5555-4555-8555-555555555555';
  riley uuid := '66666666-6666-4666-8666-666666666666';
  m1 uuid; dm uuid;
begin
  if exists (select 1 from public.messages) then return; end if;
  insert into public.messages (channel_id, user_id, body, created_at) values
    (gen, alex,   'Welcome to TeamHub, everyone! 👋 This is our new home for team chat.', now() - interval '3 hours')
    returning id into m1;
  insert into public.messages (channel_id, user_id, body, created_at) values
    (gen, jordan, 'Reminder: the new opening checklist is pinned in #general. Please give it a read before Monday.', now() - interval '2 hours 40 minutes'),
    (gen, sam,    'Downtown hit its weekly sales goal a day early. Great work team! 🎉', now() - interval '2 hours'),
    (gen, taylor, 'Does anyone have the updated holiday hours sheet?', now() - interval '90 minutes'),
    (gen, riley,  '@Taylor Kim it''s in the Files tab, I uploaded it this morning.', now() - interval '80 minutes'),
    (gen, casey,  'Delivery truck is running 30 minutes late, I''ll handle receiving.', now() - interval '20 minutes'),
    (rnd, sam,    'Who wants to do lunch from the taco place on Friday? 🌮', now() - interval '5 hours'),
    (rnd, casey,  'Count me in!', now() - interval '4 hours 50 minutes'),
    (mgr, jordan, 'Schedules for next week are posted. Let me know about any coverage gaps.', now() - interval '1 hour');
  update public.messages set is_pinned = true, pinned_by = jordan, pinned_at = now()
    where body like 'Reminder: the new opening checklist%';
  insert into public.messages (channel_id, user_id, parent_message_id, body, created_at) values
    (gen, jordan, m1, 'Excited to finally have everything in one place.', now() - interval '170 minutes'),
    (gen, taylor, m1, 'Love it! Already installed it on my phone.', now() - interval '160 minutes');
  insert into public.message_reactions (message_id, user_id, emoji)
  select id, x, '🎉' from public.messages, unnest(array[jordan, taylor, casey, riley]) x
  where body like 'Downtown hit%';
  insert into public.message_reactions (message_id, user_id, emoji) values (m1, sam, '👋'), (m1, riley, '❤️');

  insert into public.direct_conversations (is_group, member_key, created_by, last_message_at)
  values (false, alex::text || ':' || jordan::text, jordan, now() - interval '10 minutes') returning id into dm;
  insert into public.direct_conversation_members (conversation_id, user_id) values (dm, alex), (dm, jordan);
  insert into public.messages (conversation_id, user_id, body, created_at) values
    (dm, jordan, 'Hey Alex, can we move our 1:1 to Thursday?', now() - interval '15 minutes'),
    (dm, alex,   'Sure, Thursday at 10 works.', now() - interval '10 minutes');

  insert into public.announcements (title, body, author_id, requires_ack, is_pinned) values
    ('Holiday hours are posted', 'We will close at 3 PM on Dec 24 and reopen Dec 26. Please confirm you have seen this.', alex, true, true),
    ('New team member', 'Please welcome Riley Chen to the Downtown operations team!', jordan, false, false);
  insert into public.urgent_alerts (title, body, author_id, severity) values
    ('Freezer down at Main Street', 'Do not stock the walk-in until the technician clears it (ETA 2 PM).', jordan, 'urgent');
  insert into public.kudos (author_id, recipient_id, category, message) values
    (jordan, casey, 'teamwork', 'Thanks for covering the late delivery today!'),
    (alex, sam, 'above_and_beyond', 'Crushed the weekly goal early. Amazing work.');
end $$;
