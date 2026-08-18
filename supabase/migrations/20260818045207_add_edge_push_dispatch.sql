alter table public.push_jobs
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_token uuid;

create index if not exists push_jobs_dispatch_due_idx
  on public.push_jobs (status, scheduled_at, claimed_at);

create or replace function public.claim_due_push_jobs(input_limit integer default 50)
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select job.id
    from public.push_jobs as job
    where job.status = 'pending'
      and job.scheduled_at <= now()
      and (job.claimed_at is null or job.claimed_at < now() - interval '5 minutes')
    order by job.scheduled_at
    limit greatest(1, least(coalesce(input_limit, 50), 100))
    for update skip locked
  ), claimed as (
    update public.push_jobs as job
    set claimed_at = now(),
        claim_token = gen_random_uuid(),
        updated_at = now()
    from due
    where job.id = due.id
    returning job.*
  )
  select jsonb_build_object(
    'id', claimed.id,
    'user_id', claimed.user_id,
    'task_id', claimed.task_id,
    'title', claimed.title,
    'body', claimed.body,
    'scheduled_at', claimed.scheduled_at,
    'attempts', claimed.attempts,
    'claim_token', claimed.claim_token,
    'subscriptions', coalesce((
      select jsonb_agg(subscription.subscription)
      from public.push_subscriptions as subscription
      where subscription.user_id = claimed.user_id
    ), '[]'::jsonb)
  )
  from claimed;
end;
$$;

create or replace function public.complete_push_job(
  input_job_id uuid,
  input_claim_token uuid,
  input_status text,
  input_last_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_rows integer;
begin
  if input_status not in ('sent', 'failed') then
    raise exception 'Invalid terminal push status';
  end if;

  update public.push_jobs
  set status = input_status,
      attempts = attempts + 1,
      last_error = case when input_status = 'sent' then null else left(input_last_error, 500) end,
      processed_at = now(),
      claimed_at = null,
      claim_token = null,
      updated_at = now()
  where id = input_job_id
    and status = 'pending'
    and claim_token = input_claim_token;

  get diagnostics changed_rows = row_count;
  return changed_rows = 1;
end;
$$;

create or replace function public.get_push_vapid_config()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'publicKey', (select decrypted_secret from vault.decrypted_secrets where name = 'linkin_vapid_public_key' limit 1),
    'privateKey', (select decrypted_secret from vault.decrypted_secrets where name = 'linkin_vapid_private_key' limit 1),
    'subject', (select decrypted_secret from vault.decrypted_secrets where name = 'linkin_vapid_subject' limit 1)
  );
$$;

revoke all on function public.claim_due_push_jobs(integer) from public, anon, authenticated;
revoke all on function public.complete_push_job(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.get_push_vapid_config() from public, anon, authenticated;

grant execute on function public.claim_due_push_jobs(integer) to service_role;
grant execute on function public.complete_push_job(uuid, uuid, text, text) to service_role;
grant execute on function public.get_push_vapid_config() to service_role;
