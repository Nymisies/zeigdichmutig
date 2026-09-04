-- "Zeig dich Mutig" – Supabase Schema
-- In Supabase Dashboard unter "SQL Editor" einmalig ausführen.

create extension if not exists pgcrypto;

create table submissions (
  id uuid primary key default gen_random_uuid(),
  child_name text not null,
  child_age int not null check (child_age between 5 and 16),
  story text not null,
  image_path text not null,
  parent_email text not null,
  consent boolean not null default false,
  status text not null default 'pending', -- pending | approved | rejected (für spätere Moderation/Voting)
  votes int not null default 0,           -- für spätere Abstimmungsphase
  wants_freebie boolean not null default false, -- Dankeschön-Kurs "Kleine Helden" gewünscht
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

-- Storage-Bucket "photos" mit Hard-Limit anlegen (serverseitig, greift auch wenn
-- die Komprimierung im Browser umgangen wird): 5 MB max., nur Bilddateien.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "Öffentlicher Foto-Upload"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'photos');

-- Privater Bucket "originals": Zwischenlager für die unkomprimierten
-- Originalfotos (Druckqualität fürs Buch). NICHT public. Nur "insert" für
-- anon (Upload beim Absenden), kein "select" — nur die Netlify-Funktion
-- mit dem service_role Key kann sie lesen und nach dem Mailversand wieder
-- löschen. So bleibt dauerhaft nur Speicher für die kleinen Web-Fotos belegt.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('originals', 'originals', false, 26214400, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "Original-Upload (privat)"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'originals');
