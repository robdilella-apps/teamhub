-- Behavioural checks run as real end users through Row Level Security.
\set ON_ERROR_STOP on
grant all on all tables in schema public to authenticated;
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u::text, false); perform set_config('request.jwt.claim.role', 'authenticated', false); end $$;
do $$
declare n int; gen uuid; mgr uuid; c uuid; dm uuid;
  alex uuid := '11111111-1111-4111-8111-111111111111';
  sam uuid := '33333333-3333-4333-8333-333333333333';
  taylor uuid := '44444444-4444-4444-8444-444444444444';
begin
  select count(*) into n from public.profiles; assert n = 6, 'expected 6 seeded profiles, got ' || n;
  assert (select role from public.profiles where id = alex) = 'owner', 'alex should be owner';
  select id into gen from public.channels where slug = 'general';
  select id into mgr from public.channels where slug = 'managers';
  assert (select count(*) from public.channel_members where channel_id = gen) = 6, 'everyone auto-joins #general';
  assert (select count(*) from public.notifications where type = 'urgent') >= 6, 'urgent alert fans out';
  assert (select reply_count from public.messages where body like 'Welcome to TeamHub%') = 2, 'thread reply count';
  assert exists (select 1 from public.notifications where user_id = alex and type = 'dm'), 'DM notification';
end $$;

-- RLS: a regular member cannot see the private managers channel messages
set role authenticated;
select pg_temp.as_user('44444444-4444-4444-8444-444444444444');
do $$ begin
  assert (select count(*) from public.messages m join public.channels c on c.id = m.channel_id where c.slug = 'managers') = 0, 'member must not read #managers';
  assert (select count(*) from public.messages m join public.channels c on c.id = m.channel_id where c.slug = 'general') > 0, 'member reads #general';
  assert (select count(*) from public.direct_conversations) = 0, 'member must not see others DMs';
  assert (select count(*) from public.notifications where user_id <> auth.uid()) = 0, 'only own notifications';
  begin
    insert into public.announcements (title, body, author_id) values ('x', 'y', auth.uid());
    raise exception 'member should not be able to post announcements';
  exception when insufficient_privilege then null; end;
  update public.profiles set role = 'owner' where id = auth.uid();
  assert (select role from public.profiles where id = auth.uid()) = 'member', 'no self-promotion';
  insert into public.messages (channel_id, user_id, body) select id, auth.uid(), 'hello from test' from public.channels where slug = 'general';
  assert (select count(*) from public.search_messages('hello from test')) = 1, 'search finds message';
  perform public.get_or_create_dm('33333333-3333-4333-8333-333333333333');
  assert (select count(*) from public.direct_conversations) = 1, 'member can open a DM';
  assert (public.get_unread_summary() ? 'channels'), 'unread summary works';
end $$;

-- Lead can post announcements and read #managers
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
do $$ begin
  insert into public.announcements (title, body, author_id) values ('Test', 'Lead post', auth.uid());
  assert (select count(*) from public.messages m join public.channels c on c.id = m.channel_id where c.slug = 'managers') = 1, 'lead reads #managers';
end $$;
reset role;
select 'ALL DB TESTS PASSED' as result;
