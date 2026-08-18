drop function if exists public.claim_due_push_jobs(integer);
drop function if exists public.complete_push_job(uuid, uuid, text, text);
drop function if exists public.get_push_vapid_config();

drop index if exists public.push_jobs_dispatch_due_idx;

alter table public.push_jobs
  drop column if exists claimed_at,
  drop column if exists claim_token;
