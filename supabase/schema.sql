-- ============================================================
-- MAHIN PORTFOLIO — SUPABASE SCHEMA, RLS & STORAGE POLICIES
-- ============================================================
-- Run this ONCE in the Supabase dashboard:
--   SQL Editor -> New query -> paste this whole file -> Run.
--
-- It is written to be idempotent: running it again will not fail
-- and will not duplicate data. It will also ADD any missing
-- columns to existing tables.
--
-- SECURITY MODEL (read this):
--   • Visitors (anon) can SELECT only published projects, published
--     skills, visible social links and site settings.
--   • Any authenticated user can read/write everything.
--   • Storage objects are publicly readable (the bucket is public)
--     but only authenticated users may upload/replace/delete.
--
--   Because *any* authenticated user gets admin rights, disable
--   public sign-ups in Supabase: Authentication -> Sign In / Up ->
--   turn OFF "Allow new users to sign up". Then create your single
--   administrator under Authentication -> Users -> Add user.
--   Optionally harden the policies further with the blocks marked
--   [OPTIONAL HARDENING] below.
-- ============================================================

-- Needed for gen_random_uuid() on older Postgres.
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. updated_at helper
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 2. projects
-- ------------------------------------------------------------
create table if not exists public.projects (
  id             uuid primary key default gen_random_uuid(),
  title          text        not null default '',
  slug           text        not null default '',
  description    text        not null default '',
  category       text        not null default 'design',
  tools          text[]      not null default '{}',
  project_url    text        not null default '',
  video_url      text        not null default '',
  thumbnail_path text        not null default '',
  thumbnail_url  text        not null default '',
  featured       boolean     not null default false,
  sort_order     integer     not null default 0,
  status         text        not null default 'draft',
  index_label    text        not null default '',
  caption        text        not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Add any columns that may be missing from a pre-existing table.
alter table public.projects add column if not exists title          text        not null default '';
alter table public.projects add column if not exists slug           text        not null default '';
alter table public.projects add column if not exists description    text        not null default '';
alter table public.projects add column if not exists category       text        not null default 'design';
alter table public.projects add column if not exists tools          text[]      not null default '{}';
alter table public.projects add column if not exists project_url    text        not null default '';
alter table public.projects add column if not exists video_url      text        not null default '';
alter table public.projects add column if not exists thumbnail_path text        not null default '';
alter table public.projects add column if not exists thumbnail_url  text        not null default '';
alter table public.projects add column if not exists featured       boolean     not null default false;
alter table public.projects add column if not exists sort_order     integer     not null default 0;
alter table public.projects add column if not exists status         text        not null default 'draft';
alter table public.projects add column if not exists index_label    text        not null default '';
alter table public.projects add column if not exists caption        text        not null default '';
alter table public.projects add column if not exists created_at     timestamptz not null default now();
alter table public.projects add column if not exists updated_at     timestamptz not null default now();

-- Keep `status` constrained to the two values the CMS understands.
alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects add constraint projects_status_check
  check (status in ('draft', 'published'));

create index if not exists projects_status_sort_idx on public.projects (status, sort_order);

drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 3. skills
-- ------------------------------------------------------------
create table if not exists public.skills (
  id         uuid primary key default gen_random_uuid(),
  name       text        not null default '',
  sort_order integer     not null default 0,
  status     text        not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.skills add column if not exists name       text        not null default '';
alter table public.skills add column if not exists sort_order integer     not null default 0;
alter table public.skills add column if not exists status     text        not null default 'published';
alter table public.skills add column if not exists created_at timestamptz not null default now();
alter table public.skills add column if not exists updated_at timestamptz not null default now();

alter table public.skills drop constraint if exists skills_status_check;
alter table public.skills add constraint skills_status_check
  check (status in ('draft', 'published'));

create index if not exists skills_status_sort_idx on public.skills (status, sort_order);

drop trigger if exists skills_updated_at on public.skills;
create trigger skills_updated_at before update on public.skills
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 4. social_links
-- ------------------------------------------------------------
create table if not exists public.social_links (
  id         uuid primary key default gen_random_uuid(),
  platform   text        not null default 'other',
  label      text        not null default '',
  url        text        not null default '',
  sort_order integer     not null default 0,
  visible    boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.social_links add column if not exists platform   text        not null default 'other';
alter table public.social_links add column if not exists label      text        not null default '';
alter table public.social_links add column if not exists url        text        not null default '';
alter table public.social_links add column if not exists sort_order integer     not null default 0;
alter table public.social_links add column if not exists visible    boolean     not null default true;
alter table public.social_links add column if not exists created_at timestamptz not null default now();
alter table public.social_links add column if not exists updated_at timestamptz not null default now();

create index if not exists social_links_visible_sort_idx on public.social_links (visible, sort_order);

drop trigger if exists social_links_updated_at on public.social_links;
create trigger social_links_updated_at before update on public.social_links
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 5. site_settings  (key/value; each value is a JSON object)
--    Keys used by the CMS: profile, appearance, animations,
--    seo, categories
-- ------------------------------------------------------------
create table if not exists public.site_settings (
  key        text primary key,
  value      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists site_settings_updated_at on public.site_settings;
create trigger site_settings_updated_at before update on public.site_settings
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 6. Row Level Security
-- ------------------------------------------------------------
alter table public.projects     enable row level security;
alter table public.skills       enable row level security;
alter table public.social_links enable row level security;
alter table public.site_settings enable row level security;

-- Public (anonymous) read: published / visible content only.
drop policy if exists "public read published projects" on public.projects;
create policy "public read published projects" on public.projects
  for select to anon, authenticated
  using (status = 'published');

drop policy if exists "public read published skills" on public.skills;
create policy "public read published skills" on public.skills
  for select to anon, authenticated
  using (status = 'published');

drop policy if exists "public read visible social links" on public.social_links;
create policy "public read visible social links" on public.social_links
  for select to anon, authenticated
  using (visible = true);

-- Site settings are public content (name, SEO, theme...), readable by all.
drop policy if exists "public read site settings" on public.site_settings;
create policy "public read site settings" on public.site_settings
  for select to anon, authenticated
  using (true);

-- Administrator (authenticated) full access.
drop policy if exists "admin write projects" on public.projects;
create policy "admin write projects" on public.projects
  for all to authenticated
  using (true) with check (true);

drop policy if exists "admin write skills" on public.skills;
create policy "admin write skills" on public.skills
  for all to authenticated
  using (true) with check (true);

drop policy if exists "admin write social links" on public.social_links;
create policy "admin write social links" on public.social_links
  for all to authenticated
  using (true) with check (true);

drop policy if exists "admin write site settings" on public.site_settings;
create policy "admin write site settings" on public.site_settings
  for all to authenticated
  using (true) with check (true);

-- [OPTIONAL HARDENING]
-- If more than one person can ever authenticate to this project, replace
-- the four "admin write ..." policies above with email-scoped versions:
--
--   drop policy "admin write projects" on public.projects;
--   create policy "admin write projects" on public.projects
--     for all to authenticated
--     using ((auth.jwt() ->> 'email') = 'you@example.com')
--     with check ((auth.jwt() ->> 'email') = 'you@example.com');
--
-- (repeat for skills, social_links, site_settings)

-- ------------------------------------------------------------
-- 7. Storage bucket + policies
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('portfolio-media', 'portfolio-media', true)
on conflict (id) do update set public = true;

-- Public read of every object in the bucket.
drop policy if exists "public read portfolio media" on storage.objects;
create policy "public read portfolio media" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'portfolio-media');

-- Only authenticated administrators may add / replace / delete.
drop policy if exists "admin upload portfolio media" on storage.objects;
create policy "admin upload portfolio media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'portfolio-media');

drop policy if exists "admin update portfolio media" on storage.objects;
create policy "admin update portfolio media" on storage.objects
  for update to authenticated
  using (bucket_id = 'portfolio-media')
  with check (bucket_id = 'portfolio-media');

drop policy if exists "admin delete portfolio media" on storage.objects;
create policy "admin delete portfolio media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'portfolio-media');

-- ------------------------------------------------------------
-- 8. Register the settings rows (empty objects; the CMS fills them)
-- ------------------------------------------------------------
insert into public.site_settings (key, value) values
  ('profile',    '{}'::jsonb),
  ('appearance', '{}'::jsonb),
  ('animations', '{}'::jsonb),
  ('seo',        '{}'::jsonb),
  ('categories', '[{"id":"design","label":"Design"},{"id":"video","label":"Video"},{"id":"motion","label":"Motion"},{"id":"ai","label":"AI Art"}]'::jsonb)
on conflict (key) do nothing;

-- Done. Next: run supabase/seed.sql to import the starter content.
