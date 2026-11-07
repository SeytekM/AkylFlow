-- AkylFlow: таблицы для реальных друзей и общих огоньков.
-- Supabase → SQL Editor → New query → вставить всё → Run.

create table if not exists profiles (
  id uuid primary key,
  name text not null,
  track text,
  streak int not null default 0,
  longest int not null default 0,
  xp_total int not null default 0,
  active_days text[] not null default '{}',   -- дни занятий 'YYYY-MM-DD' за 60 дней
  xp_by_day jsonb not null default '{}',      -- XP по дням за 14 дней
  updated_at timestamptz not null default now()
);

create table if not exists friendships (
  a uuid not null,
  b uuid not null,
  created_at timestamptz not null default now(),
  primary key (a, b)
);

create table if not exists nudges (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null,
  from_name text,
  to_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists nudges_to_idx on nudges (to_id, created_at desc);

-- MVP без регистрации: анонимный ключ может читать и писать.
-- Перед продакшеном перейти на Supabase Auth (вход через Telegram) и ограничить политики по auth.uid().
alter table profiles enable row level security;
alter table friendships enable row level security;
alter table nudges enable row level security;

drop policy if exists "mvp read" on profiles;
drop policy if exists "mvp insert" on profiles;
drop policy if exists "mvp update" on profiles;
drop policy if exists "mvp read" on friendships;
drop policy if exists "mvp insert" on friendships;
drop policy if exists "mvp read" on nudges;
drop policy if exists "mvp insert" on nudges;

create policy "mvp read"   on profiles    for select using (true);
create policy "mvp insert" on profiles    for insert with check (true);
create policy "mvp update" on profiles    for update using (true);
create policy "mvp read"   on friendships for select using (true);
create policy "mvp insert" on friendships for insert with check (true);
create policy "mvp read"   on nudges      for select using (true);
create policy "mvp insert" on nudges      for insert with check (true);

grant select, insert, update on profiles to anon;
grant select, insert on friendships, nudges to anon;
