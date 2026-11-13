-- 0017_scope_mfa_reset
--
-- SECURITY FIX — the MFA reset table was not team-scoped.
--
-- Migration 0016 corrected six uses of is_super_admin() that gated a specific
-- team's data. It did not cover public.mfa_reset_requests, which was created
-- in 0015 in the same pass and whose policies also used the unscoped form.
--
-- The effect: a Super Admin of team B could see that a member of team A had
-- lost their authenticator, and could raise and approve a reset for them.
-- Approving a reset does not by itself grant access — a server-side operator
-- still has to remove the factor, and the attacker would still need the
-- password — but it places a forged authorisation in the record that the
-- operator is expected to act on. The reset trail is supposed to be the
-- evidence that a removal was properly authorised; an administrator from an
-- unrelated team being able to write that evidence defeats its purpose.
--
-- Found during M3 deployment verification by listing every policy still
-- referencing is_super_admin(), rather than by assuming 0016 had been
-- complete. 0016 is left unmodified; this is a forward correction.

drop policy if exists mfa_reset_select on public.mfa_reset_requests;
create policy mfa_reset_select on public.mfa_reset_requests
  for select to authenticated
  using (
    -- The subject may always follow their own request.
    profile_id = auth.uid()
    -- Otherwise: a Super Admin of a team the subject actually belongs to.
    or exists (
      select 1 from public.team_members tm
      where tm.profile_id = public.mfa_reset_requests.profile_id
        and public.is_super_admin_of(tm.team_id)
    )
  );

drop policy if exists mfa_reset_admin_write on public.mfa_reset_requests;
create policy mfa_reset_admin_write on public.mfa_reset_requests
  for all to authenticated
  using (
    exists (
      select 1 from public.team_members tm
      where tm.profile_id = public.mfa_reset_requests.profile_id
        and public.is_super_admin_of(tm.team_id)
    )
  )
  with check (
    exists (
      select 1 from public.team_members tm
      where tm.profile_id = public.mfa_reset_requests.profile_id
        and public.is_super_admin_of(tm.team_id)
    )
  );

comment on table public.mfa_reset_requests is
  'Record of administrator-assisted MFA resets. Readable and writable only by '
  'a Super Admin of a team the subject belongs to, and readable by the subject '
  'themselves. The reset itself is performed server-side with the service-role '
  'key; this table is the authorisation and audit record for it. A user cannot '
  'approve their own reset.';

-- ------------------------------------------------------------------------
-- The remaining uses of the unscoped is_super_admin() are deliberate, and
-- are recorded here so that the next audit does not have to re-derive which
-- ones were examined and accepted.
--
--   app_settings_admin_write     institution-wide configuration, one row per
--                                key, shared by design
--   retention_admin_write        institution-wide retention configuration,
--                                shared by design
--   audit_logs_super_admin_read  team-scoped where the row names a team;
--                                falls back to the unscoped form only for
--                                rows that carry no team (profile, recording
--                                and transcript changes). Identical in a
--                                single-team deployment; a real gap if a
--                                second team is created, and the fix is then
--                                to resolve and store the team on those rows
--   guard_team_membership        a trigger, where the question genuinely is
--   guard_profile_changes        "does this actor administer anything at all"
--
-- Anything else using is_super_admin() to gate a team's data is a bug.
-- ------------------------------------------------------------------------
