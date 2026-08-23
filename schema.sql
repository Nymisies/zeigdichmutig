-- "Zeig dich Mutig" – Supabase Schema
-- In Supabase Dashboard unter "SQL Editor" einmalig ausführen.

create extension if not exists pgcrypto;

create table submissions (
  id uuid primary key default gen_random_uuid(),
  child_name text not null,
  child_age int not null check (child_age between 5 and 14),
  story text not null,
  image_path text not null,
  parent_email text not null,
  consent boolean not null default false,
  status text not null default 'pending', -- pending | approved | rejected (für spätere Moderation/Voting)
  votes int not null default 0,           -- für spätere Abstimmungsphase
  created_at timestamptz not null default now()
);

alter table submissions enable row level security;

-- Öffentliches Einreichen erlauben (Eltern brauchen keinen Account)
create policy "Öffentliches Einreichen erlauben"
  on submissions for insert
  to anon
  with check (consent = true);

-- Bewusst KEINE Lese-Policy für anon: Einreichungen (inkl. E-Mail) sind
-- nur für Claas im Supabase-Dashboard sichtbar, bis eine Voting-Phase
-- mit eigener öffentlicher Ansicht (ohne E-Mail) gebaut wird.

-- Storage-Bucket "photos" muss im Dashboard unter Storage manuell angelegt werden
-- (Public Bucket = an), danach folgende Policy für öffentliches Hochladen:
-- create policy "Öffentlicher Foto-Upload"
--   on storage.objects for insert
--   to anon
--   with check (bucket_id = 'photos');
