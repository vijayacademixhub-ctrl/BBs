-- 0021_password_set_at
--
-- Records that someone has replaced the password they were issued.
--
-- Fifteen accounts were created by an administrator, so every first password
-- was chosen by somebody else and travelled to its owner through a message.
-- Until each person changes theirs, whoever saw that message can sign in as
-- them. That is a real exposure with a definite end, and the only thing
-- missing was a way to see how far through it the team is.
--
-- It sits on profiles rather than on user_preferences because of who may
-- read it. A preferences row is visible only to its owner, so counting them
-- would be impossible for the administrator who needs the count. A profile
-- is visible to the team, and this column says nothing sensitive: it is a
-- timestamp, not a password, and not even a hint about one.
--
-- Nothing is backfilled. An account with no timestamp is one whose password
-- may still be the issued one, and assuming otherwise would defeat the
-- purpose of recording it.

alter table public.profiles
  add column password_set_at timestamptz;

comment on column public.profiles.password_set_at is
  'When this person last set their own password through the application. '
  'Null means they may still be using the one they were issued. Written by '
  'the account holder; never a password or any part of one.';

-- profiles_update_own already lets a person write their own row, and
-- guard_profile_changes refuses the fields that matter (status, email, id)
-- to anyone who is not a Super Admin. No new policy is needed, and none is
-- added: the narrower the write surface on profiles, the better.
