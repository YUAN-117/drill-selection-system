-- Records one row per successful call to the parse-drill-voice Edge Function.
-- Used only to count how many requests a user made in the last hour (anti-abuse).
-- Does NOT store the transcript or the parsed result.
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_id_created_at_idx
  on public.ai_usage (user_id, created_at);

-- RLS is enabled with no policies: only the Edge Function's service-role
-- client (which bypasses RLS) can read/write this table. No anon/authenticated
-- client can query it directly.
alter table public.ai_usage enable row level security;
