-- Local Supabase shim — TEST HARNESS ONLY.
--
-- This file is NOT a migration and is never applied to a Supabase project.
-- Supabase already provides everything here; this recreates the minimum of it
-- so the real migrations can be run and the RLS policies genuinely exercised
-- against local PostgreSQL, without Docker.
--
-- What it provides:
--   * the anon / authenticated / service_role roles
--   * the auth schema, auth.users, and auth.uid() / auth.role() / auth.jwt()
--     reading from the same request.jwt.claims GUC that PostgREST sets
--   * the storage schema with buckets, objects and storage.foldername()
--
-- Fidelity note: auth.uid() here reads request.jwt.claims exactly as
-- Supabase's does, so a policy that passes locally passes for the same
-- reason in production. What this harness does NOT reproduce is Supabase's
-- own GoTrue logic, the storage API's signed-URL issuance, or its rate
-- limits. Those are verified against the hosted project, not here.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant anon, authenticated, service_role to current_user;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  encrypted_password text,
  created_at         timestamptz not null default now(),
  banned_until       timestamptz
);

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'role', 'anon');
$$;

grant execute on function auth.jwt(), auth.uid(), auth.role()
  to anon, authenticated, service_role;

create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text not null references storage.buckets (id),
  name        text not null,
  owner       uuid,
  metadata    jsonb,
  created_at  timestamptz not null default now(),
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;

-- Matches Supabase's implementation: splits the object path on '/' and
-- returns the directory segments, discarding the final filename.
create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1:array_length(parts, 1) - 1];
end;
$$;

grant execute on function storage.foldername(text) to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
grant all on storage.objects, storage.buckets to service_role;
