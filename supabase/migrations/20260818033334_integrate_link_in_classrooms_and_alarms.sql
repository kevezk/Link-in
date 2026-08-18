-- LINK-IN classroom and routine-alarm integration.
-- Additive migration only: no existing table, column, policy, or data is dropped.

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  school_name text not null check (char_length(btrim(school_name)) between 1 and 100),
  grade integer not null check (grade between 1 and 12),
  class_number integer not null check (class_number between 1 and 99),
  created_at timestamptz not null default now(),
  unique (school_name, grade, class_number)
);

alter table public.classes enable row level security;

create table if not exists public.class_memberships (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  role text not null default 'student' check (role in ('student', 'teacher', 'president')),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  joined_at timestamptz not null default now(),
  class_changed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists one_president_per_class
  on public.class_memberships (class_id)
  where role = 'president';

create index if not exists class_memberships_class_id_idx
  on public.class_memberships (class_id);

alter table public.class_memberships enable row level security;

do $migration$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'classes'
      and policyname = 'Authenticated users can view classes'
  ) then
    create policy "Authenticated users can view classes"
      on public.classes for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'class_memberships'
      and policyname = 'Users can view their own class membership'
  ) then
    create policy "Users can view their own class membership"
      on public.class_memberships for select
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end;
$migration$;

grant select on public.classes to authenticated;
grant select on public.class_memberships to authenticated;

alter table public.tasks
  add column if not exists alarm jsonb;

alter table public.routine_templates
  add column if not exists alarm jsonb;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and conname = 'tasks_alarm_shape_check'
  ) then
    alter table public.tasks
      add constraint tasks_alarm_shape_check check (
        alarm is null or (
          jsonb_typeof(alarm) = 'object'
          and alarm ? 'enabled'
          and jsonb_typeof(alarm -> 'enabled') = 'boolean'
          and (not (alarm ? 'time_24h') or (alarm ->> 'time_24h') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
        )
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.routine_templates'::regclass
      and conname = 'routine_templates_alarm_shape_check'
  ) then
    alter table public.routine_templates
      add constraint routine_templates_alarm_shape_check check (
        alarm is null or (
          jsonb_typeof(alarm) = 'object'
          and alarm ? 'enabled'
          and jsonb_typeof(alarm -> 'enabled') = 'boolean'
          and (not (alarm ? 'time_24h') or (alarm ->> 'time_24h') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
        )
      ) not valid;
  end if;
end;
$migration$;

create or replace function public.join_class(
  input_school_name text,
  input_grade integer,
  input_class_number integer,
  input_display_name text
)
returns public.class_memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  normalized_school text := btrim(input_school_name);
  normalized_name text := btrim(input_display_name);
  target_class_id uuid;
  existing_membership public.class_memberships;
  result_membership public.class_memberships;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;
  if char_length(normalized_school) not between 1 and 100 then
    raise exception 'School name must be between 1 and 100 characters';
  end if;
  if input_grade not between 1 and 12 then
    raise exception 'Grade must be between 1 and 12';
  end if;
  if input_class_number not between 1 and 99 then
    raise exception 'Class number must be between 1 and 99';
  end if;
  if char_length(normalized_name) not between 1 and 40 then
    raise exception 'Display name must be between 1 and 40 characters';
  end if;

  select * into existing_membership
  from public.class_memberships
  where user_id = caller_id;

  if existing_membership.user_id is not null
     and existing_membership.class_changed_at > now() - interval '30 days' then
    select id into target_class_id
    from public.classes
    where school_name = normalized_school
      and grade = input_grade
      and class_number = input_class_number;
    if target_class_id is distinct from existing_membership.class_id then
      raise exception 'Class can only be changed once every 30 days';
    end if;
  end if;

  insert into public.classes (school_name, grade, class_number)
  values (normalized_school, input_grade, input_class_number)
  on conflict (school_name, grade, class_number)
  do update set school_name = excluded.school_name
  returning id into target_class_id;

  insert into public.class_memberships (
    user_id, class_id, role, display_name, joined_at, class_changed_at, updated_at
  ) values (
    caller_id, target_class_id, 'student', normalized_name, now(), now(), now()
  )
  on conflict (user_id) do update
  set class_id = excluded.class_id,
      display_name = excluded.display_name,
      role = case
        when public.class_memberships.class_id = excluded.class_id
          then public.class_memberships.role
        else 'student'
      end,
      class_changed_at = case
        when public.class_memberships.class_id = excluded.class_id
          then public.class_memberships.class_changed_at
        else now()
      end,
      updated_at = now()
  returning * into result_membership;

  return result_membership;
end;
$$;

revoke all on function public.join_class(text, integer, integer, text) from public;
grant execute on function public.join_class(text, integer, integer, text) to authenticated;

create or replace function public.set_class_president(
  target_user_id uuid,
  target_class_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;
  if not exists (
    select 1 from public.class_memberships
    where user_id = caller_id
      and class_id = target_class_id
      and role = 'teacher'
  ) then
    raise exception 'Only a teacher in this class can appoint a president';
  end if;
  if not exists (
    select 1 from public.class_memberships
    where user_id = target_user_id
      and class_id = target_class_id
  ) then
    raise exception 'Target user is not in this class';
  end if;

  update public.class_memberships
  set role = 'student', updated_at = now()
  where class_id = target_class_id and role = 'president';

  update public.class_memberships
  set role = 'president', updated_at = now()
  where user_id = target_user_id and class_id = target_class_id;
end;
$$;

revoke all on function public.set_class_president(uuid, uuid) from public;
grant execute on function public.set_class_president(uuid, uuid) to authenticated;
