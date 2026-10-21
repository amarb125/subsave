-- SubSave: Row Level Security and privileges.
-- Apply AFTER 20261019000001_schema.sql.
--
-- Model: a signed-in user may only touch rows whose user_id equals their own auth.uid().
-- The anon role (signed-out visitors) gets no access at all.
-- `(select auth.uid())` is wrapped in a sub-select so Postgres evaluates it once per query.

alter table public.profiles                    enable row level security;
alter table public.user_settings               enable row level security;
alter table public.subscriptions               enable row level security;
alter table public.reminder_preferences        enable row level security;
alter table public.notifications               enable row level security;
alter table public.subscription_status_history enable row level security;

-- Privileges: start from nothing, then grant only what each table needs.
revoke all on public.profiles, public.user_settings, public.subscriptions, public.reminder_preferences,
              public.notifications, public.subscription_status_history from anon, public;
revoke all on public.profiles, public.user_settings, public.subscriptions, public.reminder_preferences,
              public.notifications, public.subscription_status_history from authenticated;

grant select, insert, update         on public.profiles                     to authenticated;
grant select, insert, update         on public.user_settings                to authenticated;
grant select, insert, update, delete on public.subscriptions                to authenticated;
grant select, insert, update, delete on public.reminder_preferences         to authenticated;
grant select, insert, update, delete on public.notifications                to authenticated;
grant select                         on public.subscription_status_history  to authenticated;

-- profiles (keyed by id) -----------------------------------------------------
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- user_settings ----------------------------------------------------------------
create policy user_settings_select_own on public.user_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy user_settings_insert_own on public.user_settings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy user_settings_update_own on public.user_settings
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- subscriptions ----------------------------------------------------------------
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy subscriptions_insert_own on public.subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy subscriptions_update_own on public.subscriptions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy subscriptions_delete_own on public.subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- reminder_preferences -----------------------------------------------------------
create policy reminder_preferences_select_own on public.reminder_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy reminder_preferences_insert_own on public.reminder_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy reminder_preferences_update_own on public.reminder_preferences
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy reminder_preferences_delete_own on public.reminder_preferences
  for delete to authenticated using (user_id = (select auth.uid()));

-- notifications ------------------------------------------------------------------
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_insert_own on public.notifications
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy notifications_update_own on public.notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete_own on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

-- subscription_status_history: read-only for users; rows are written by a trigger -----
create policy status_history_select_own on public.subscription_status_history
  for select to authenticated using (user_id = (select auth.uid()));
