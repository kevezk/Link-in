create table if not exists public.class_notices (
  class_id uuid primary key references public.classes(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  content text not null check (char_length(content) between 1 and 5000),
  author_user_id uuid not null references public.profiles(id) on delete restrict,
  author_name text not null,
  author_role text not null check (author_role in ('teacher', 'president')),
  updated_at timestamptz not null default now()
);
alter table public.class_notices enable row level security;

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;

create policy "Class members can view their notice"
on public.class_notices for select to authenticated
using (exists (
  select 1 from public.class_memberships m
  where m.user_id = (select auth.uid()) and m.class_id = class_notices.class_id
));

create policy "Users manage their own push subscriptions"
on public.push_subscriptions for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select on public.class_notices to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create or replace function public.upsert_class_notice(input_title text, input_content text)
returns public.class_notices
language plpgsql security definer set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  membership public.class_memberships;
  result_notice public.class_notices;
begin
  select * into membership from public.class_memberships where user_id = caller_id;
  if membership.user_id is null or membership.role not in ('teacher', 'president') then
    raise exception 'Only a teacher or president can update the class notice';
  end if;
  if char_length(btrim(input_title)) not between 1 and 100
     or char_length(btrim(input_content)) not between 1 and 5000 then
    raise exception 'Invalid notice length';
  end if;
  insert into public.class_notices(class_id,title,content,author_user_id,author_name,author_role,updated_at)
  values(membership.class_id,btrim(input_title),btrim(input_content),caller_id,membership.display_name,membership.role,now())
  on conflict(class_id) do update set
    title=excluded.title, content=excluded.content, author_user_id=excluded.author_user_id,
    author_name=excluded.author_name, author_role=excluded.author_role, updated_at=now()
  returning * into result_notice;
  return result_notice;
end;
$$;
revoke all on function public.upsert_class_notice(text,text) from public, anon;
grant execute on function public.upsert_class_notice(text,text) to authenticated;
