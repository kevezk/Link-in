revoke all privileges on table public.push_jobs from public, anon;
grant select, insert, update, delete on public.push_jobs to authenticated;
