-- 0022_own_membership_before_mfa
--
-- Lets a Super Admin read their own team membership before they have
-- verified a second factor.
--
-- 0020 gave `profiles` a carve-out for exactly this reason, reasoning that a
-- Super Admin who has not yet enrolled must still be able to read their own
-- row or the enrolment screen has nothing to show them. The reasoning was
-- right and the carve-out was one table short.
--
-- Whether a second factor is required depends on the person's role, and the
-- role lives in `team_members`, not in `profiles`. So the sequence was:
--
--   1. A Super Admin signs in. The session is at aal1.
--   2. The application reads `profiles` — allowed by the carve-out — and
--      then `team_members` to learn the role. That read is denied, because
--      requires_second_factor() is true and the factor is unverified.
--   3. Denied is indistinguishable from absent over the REST API: no error,
--      an empty array. The application concludes the person is an ordinary
--      member, for whom no second factor is required, and sends them to the
--      dashboard instead of to enrolment.
--   4. Every query the dashboard makes is then refused by the same policy.
--
-- The result was not a locked door but an empty room: a Super Admin saw a
-- working dashboard with nothing in it and no route to the enrolment screen
-- that would have fixed it. The database was behaving exactly as written;
-- the fault was that it withheld the one fact the application needed in
-- order to obey it.
--
-- This is the smallest fix. An unverified Super Admin may read the single
-- `team_members` row that is their own — their role and their team — and
-- nothing else. It tells them what they already know about themselves, and
-- it is the same class of information the `profiles` carve-out already
-- grants. Everything about anyone else stays refused until a factor is
-- verified.
--
-- `with check` is deliberately left strict. Reading your own role to learn
-- that you must enrol is necessary; changing a row before you have enrolled
-- is not.

drop policy if exists require_mfa on public.team_members;

create policy require_mfa on public.team_members
  as restrictive
  to authenticated
  using (
    public.is_mfa_verified()
    or not public.requires_second_factor()
    or profile_id = auth.uid()
  )
  with check (
    public.is_mfa_verified()
    or not public.requires_second_factor()
  );

comment on policy require_mfa on public.team_members is
  'Membership rows are withheld until a second factor is verified, except '
  'for the reader''s own row. The application needs that row to discover '
  'that enrolment is required at all; without it a Super Admin is told they '
  'are an ordinary member and never reaches the enrolment screen.';
