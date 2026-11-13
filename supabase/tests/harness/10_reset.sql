-- Drops everything the migrations create, so the suite always starts clean.
drop schema if exists public cascade;
drop schema if exists storage cascade;
drop schema if exists auth cascade;
create schema public;
grant usage on schema public to public;
