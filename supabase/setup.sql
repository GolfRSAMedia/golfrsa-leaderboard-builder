-- =====================================================================
--  GolfRSA Leaderboard - download bank setup
--  Run this once in Supabase: SQL Editor > New query > paste > Run.
--
--  Creates:
--    1. a "downloads" table (one row per graphic downloaded)
--    2. a public "leaderboards" storage bucket for the PNGs
--    3. rules so anyone can ADD and VIEW, but nobody can edit or
--       delete from the website (you can still delete in the dashboard)
-- =====================================================================

-- 1. Table ------------------------------------------------------------
create table if not exists public.downloads (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  tournament    text not null check (char_length(tournament) between 1 and 120),
  venue         text check (char_length(venue) <= 120),
  dates         text check (char_length(dates) <= 60),
  round_title   text check (char_length(round_title) <= 40),
  rounds_played smallint check (rounds_played between 0 and 4),
  leader        text check (char_length(leader) <= 80),
  created_by    text check (char_length(created_by) <= 60),
  month         text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  file_path     text not null check (file_path ~ '^[0-9]{4}-[0-9]{2}/[A-Za-z0-9_-]{1,160}\.png$'),
  thumb_path    text check (thumb_path ~ '^[0-9]{4}-[0-9]{2}/[A-Za-z0-9_-]{1,160}\.jpg$')
);

create index if not exists downloads_month_idx on public.downloads (month);
create index if not exists downloads_tournament_idx on public.downloads (tournament);

alter table public.downloads enable row level security;

grant select, insert on public.downloads to anon, authenticated;

drop policy if exists "Anyone can view downloads" on public.downloads;
create policy "Anyone can view downloads"
  on public.downloads for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can add downloads" on public.downloads;
create policy "Anyone can add downloads"
  on public.downloads for insert
  to anon, authenticated
  with check (true);

-- 2. Storage bucket (public read, PNG/JPEG only, 8 MB max per file) ----
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('leaderboards', 'leaderboards', true, 8388608, array['image/png', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3. Storage rules: upload new files only (no overwrite, no delete) ----
drop policy if exists "Anyone can upload leaderboards" on storage.objects;
create policy "Anyone can upload leaderboards"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'leaderboards'
    and name ~ '^[0-9]{4}-[0-9]{2}/[A-Za-z0-9_-]{1,160}\.(png|jpg)$'
  );
