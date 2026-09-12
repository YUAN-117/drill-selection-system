-- Stores one row per saved drill-selection history record for a signed-in
-- user. `record` holds the full record object (diameter, material, drill
-- type, computed result, etc.) as JSON, mirroring the shape historyStore.js
-- already uses for localStorage — no separate columns per field.
create table if not exists public.drill_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  record jsonb not null
);

create index if not exists drill_history_user_id_created_at_idx
  on public.drill_history (user_id, created_at desc);

alter table public.drill_history enable row level security;

create policy "Users can view their own history"
  on public.drill_history for select
  using (auth.uid() = user_id);

create policy "Users can insert their own history"
  on public.drill_history for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own history"
  on public.drill_history for delete
  using (auth.uid() = user_id);
