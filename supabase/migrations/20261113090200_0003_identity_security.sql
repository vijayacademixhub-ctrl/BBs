-- 0003_security_helpers
-- The functions every RLS policy is built from, and the triggers that close
-- the two privilege-escalation routes an authenticated user would otherwise
-- have: changing their own role, and adding themselves to a team.
--
-- Every function here is SECURITY DEFINER with a pinned search_path. They are
-- owned by the migration role, which owns the tables, so they read through
-- RLS rather than being filtered by it. That is what makes a policy able to
-- consult team_members without the policy on team_members recursing into
-- itself.
--
-- They are also STABLE, so PostgreSQL evaluates each at most once per
-- statement rather than once per row.

-- ----------------------------------------------------------- identity -----

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select auth.uid();
$$;

-- A suspended account keeps its rows for attribution but is refused access
-- everywhere. Every other helper is built on top of this one, so suspension
-- takes effect across the whole system at once rather than table by table.
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active'
  );
$$;

create or replace function public.current_role_in_team(p_team uuid)
returns app_role
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select tm.role
  from public.team_members tm
  join public.profiles p on p.id = tm.profile_id
  where tm.team_id = p_team
    and tm.profile_id = auth.uid()
    and p.status = 'active'
  limit 1;
$$;

create or replace function public.is_team_member(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select public.current_role_in_team(p_team) is not null;
$$;

create or replace function public.has_team_role(p_team uuid, p_roles app_role[])
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select public.current_role_in_team(p_team) = any (p_roles);
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.team_members tm
    join public.profiles p on p.id = tm.profile_id
    where tm.profile_id = auth.uid()
      and tm.role = 'super_admin'
      and p.status = 'active'
  );
$$;

-- --------------------------------------------- registration is closed -----

-- Refuses any new auth user that has no open invitation.
--
-- Supabase's "allow new users to sign up" setting is the first control; this
-- is the second. The setting lives in a dashboard and can be changed by
-- anyone with console access, including by accident. This trigger lives in
-- the database and fails the insert, so an account cannot come into being
-- through a route the Super Admin did not open.
create or replace function auth.enforce_invitation_only()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_invitation public.user_invitations%rowtype;
begin
  -- The first account must be creatable before any inviter exists. This is
  -- permitted only while the instance genuinely has no users at all.
  if not exists (select 1 from public.profiles) then
    return new;
  end if;

  select * into v_invitation
  from public.user_invitations
  where email = lower(new.email)
    and status = 'pending'
    and expires_at > now()
  limit 1;

  if not found then
    raise exception
      'Registration is closed. An account can only be created from an open invitation (%).',
      lower(new.email)
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- --------------------------------------- privilege escalation defences ----

-- Closes three routes at once:
--   * raising your own role
--   * adding yourself to a team
--   * a coordinator minting a super_admin
create or replace function public.guard_team_membership()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  -- Service-role and migration contexts have no JWT. They are trusted here
  -- because they are already outside the browser's reach.
  if v_actor is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.profile_id = v_actor and not public.is_super_admin() then
      raise exception 'A user cannot add themselves to a team.' using errcode = '42501';
    end if;
    if new.role = 'super_admin' and not public.is_super_admin() then
      raise exception 'Only a Super Admin may grant the Super Admin role.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      if old.profile_id = v_actor then
        raise exception 'A user cannot change their own role.' using errcode = '42501';
      end if;
      if (new.role = 'super_admin' or old.role = 'super_admin') and not public.is_super_admin() then
        raise exception 'Only a Super Admin may grant or remove the Super Admin role.'
          using errcode = '42501';
      end if;
    end if;
    if new.profile_id is distinct from old.profile_id or new.team_id is distinct from old.team_id then
      raise exception 'Team membership cannot be reassigned; remove and re-add instead.'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'super_admin'
       and (select count(*) from public.team_members
            where team_id = old.team_id and role = 'super_admin') <= 1 then
      raise exception 'A team must retain at least one Super Admin.' using errcode = '23514';
    end if;
  end if;

  return case tg_op when 'DELETE' then old else new end;
end;
$$;

create trigger guard_team_membership
  before insert or update or delete on public.team_members
  for each row execute function public.guard_team_membership();

-- A user may edit their own name, designation and avatar. Everything that
-- carries authority — identity, account status — is refused here regardless
-- of what any RLS policy allows.
create or replace function public.guard_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    return new;
  end if;

  if not public.is_super_admin() then
    if new.status is distinct from old.status
       or new.suspended_at is distinct from old.suspended_at
       or new.suspended_by is distinct from old.suspended_by then
      raise exception 'Only a Super Admin may change an account''s status.' using errcode = '42501';
    end if;
    if new.email is distinct from old.email then
      raise exception 'The sign-in address cannot be changed from the application.'
        using errcode = '42501';
    end if;
  end if;

  if new.id is distinct from old.id then
    raise exception 'A profile identifier cannot be reassigned.' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger guard_profile_changes
  before update on public.profiles
  for each row execute function public.guard_profile_changes();

-- Attach the enforcement to auth.users itself, so it applies to every route
-- that can create a user: the API, the dashboard, and the CLI alike.
drop trigger if exists enforce_invitation_only on auth.users;
create trigger enforce_invitation_only
  before insert on auth.users
  for each row execute function auth.enforce_invitation_only();
