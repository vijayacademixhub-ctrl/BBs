-- 0015_mfa
-- Mandatory multi-factor authentication, enforced in the database.
--
-- Supabase records the strength of a session in the `aal` claim of the JWT:
-- `aal1` for password alone, `aal2` once a second factor has been verified.
-- A JWT with no `aal` claim is treated as `aal1`.
--
-- Enforcement here uses RESTRICTIVE policies rather than folding the check
-- into an existing helper. The difference matters. A restrictive policy is
-- ANDed with every permissive policy on the table, so it cannot be bypassed
-- by a permissive policy written later that forgets to call the helper. With
-- the helper approach, one careless future policy would open a table to
-- single-factor sessions and nothing would complain.
--
-- The service role bypasses RLS entirely and is therefore unaffected. That is
-- correct: the AI service authenticates with a key held on a server, not with
-- a browser session, and MFA has no meaning for it.

-- ------------------------------------------------------------- helpers ---

create or replace function public.current_aal()
returns text
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select coalesce(nullif(auth.jwt() ->> 'aal', ''), 'aal1');
$$;

comment on function public.current_aal() is
  'Authenticator assurance level of the current session. A token with no aal '
  'claim is aal1, per Supabase''s definition.';

create or replace function public.is_mfa_verified()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select public.current_aal() = 'aal2';
$$;

grant execute on function public.current_aal(), public.is_mfa_verified() to authenticated;

-- ------------------------------------------------- enforcement policies ---
--
-- Applied to every table in the application schema by iteration rather than
-- by hand, so a table cannot be missed. `profiles` is handled separately
-- below because of the enrolment problem described there.
--
-- A structural test asserts that every table carries this policy, which is
-- what protects tables added in future.

do $$
declare
  v_table text;
begin
  for v_table in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname <> 'profiles'
    order by 1
  loop
    execute format(
      'create policy require_mfa on public.%I as restrictive to authenticated '
      'using (public.is_mfa_verified()) with check (public.is_mfa_verified())',
      v_table
    );
  end loop;
end
$$;

-- `profiles` carries a narrower restriction.
--
-- A user who has not yet enrolled a second factor signs in at aal1 and must
-- reach the enrolment screen. That screen shows them who they are signed in
-- as, which requires reading their own profile row. Denying it would leave
-- them staring at an empty page with no way forward.
--
-- They can read their own row and nothing else: not a colleague's, and no
-- write of any kind. Every other table remains closed until the second factor
-- is verified.
create policy require_mfa on public.profiles
  as restrictive
  to authenticated
  using (public.is_mfa_verified() or id = auth.uid())
  with check (public.is_mfa_verified());

-- ------------------------------------------- administrator-assisted reset --
--
-- Supabase's TOTP implementation issues no backup codes. If a user loses
-- their authenticator device, the only route back is for their factor to be
-- removed by someone holding admin credentials.
--
-- That removal happens through the Auth Admin API with the service-role key,
-- which by design is not available to the browser. This table is the request
-- and approval record for it: the Super Admin raises and approves a request
-- here, and a server-side operator carries it out and marks it done. It
-- exists so the decision is recorded and audited rather than being an
-- untraceable action taken in a dashboard.

create type mfa_reset_status as enum ('requested', 'approved', 'completed', 'rejected', 'cancelled');

create table public.mfa_reset_requests (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  reason        text not null check (length(btrim(reason)) between 10 and 1000),
  status        mfa_reset_status not null default 'requested',
  requested_by  uuid references public.profiles (id) on delete set null,
  requested_at  timestamptz not null default now(),
  approved_by   uuid references public.profiles (id) on delete set null,
  approved_at   timestamptz,
  completed_by  uuid references public.profiles (id) on delete set null,
  completed_at  timestamptz,
  identity_check text check (length(identity_check) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Approval must name an approver and a time. An approval with neither is
  -- not an approval, it is a status field someone changed.
  constraint mfa_reset_approval_recorded check (
    status not in ('approved', 'completed')
    or (approved_by is not null and approved_at is not null)
  ),
  -- The person approving their own reset would defeat the control entirely.
  constraint mfa_reset_not_self_approved check (approved_by is null or approved_by <> profile_id)
);
create index mfa_reset_requests_open_idx on public.mfa_reset_requests (status, requested_at)
  where status in ('requested', 'approved');
select public.attach_updated_at('public.mfa_reset_requests');

alter table public.mfa_reset_requests enable row level security;

comment on table public.mfa_reset_requests is
  'Record of administrator-assisted MFA resets. The reset itself is performed '
  'server-side with the service-role key; this table is the authorisation and '
  'audit record for it. A user cannot approve their own reset.';

-- A locked-out user has no aal2 session, so they cannot raise their own
-- request from the application. That is intended: the request is raised by
-- the Super Admin after verifying the person's identity out of band. The
-- subject may read their own request so they can see its progress once they
-- are back in.
create policy mfa_reset_select on public.mfa_reset_requests
  for select to authenticated
  using (profile_id = auth.uid() or public.is_super_admin());

create policy mfa_reset_admin_write on public.mfa_reset_requests
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- The new table needs the same MFA restriction as every other.
create policy require_mfa on public.mfa_reset_requests
  as restrictive
  to authenticated
  using (public.is_mfa_verified())
  with check (public.is_mfa_verified());

create trigger audit_mfa_reset
  after insert or update or delete on public.mfa_reset_requests
  for each row execute function public.audit_row_change('mfa_reset_request');

grant select, insert, update, delete on public.mfa_reset_requests to authenticated;
revoke all on public.mfa_reset_requests from anon;

-- --------------------------------------------------- storage enforcement --
--
-- storage.objects lives outside the application schema and so was not covered
-- by the loop above. Without this, a password-only session could still list
-- and download meeting recordings: the storage policies check participation,
-- but nothing checked assurance level.
--
-- This was caught by a test rather than by review, which is the argument for
-- asserting the property on storage as well as on the application tables.
create policy require_mfa on storage.objects
  as restrictive
  to authenticated
  using (public.is_mfa_verified())
  with check (public.is_mfa_verified());
