create table if not exists public.push_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id text not null,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 500),
  scheduled_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, task_id)
);

create index if not exists push_jobs_user_due_idx
  on public.push_jobs (user_id, status, scheduled_at);

alter table public.push_jobs enable row level security;

create policy "Users manage their own push jobs"
on public.push_jobs for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.push_jobs to authenticated;
