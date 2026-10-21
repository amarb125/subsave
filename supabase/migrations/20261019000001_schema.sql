-- SubSave: schema, constraints, indexes and triggers.
-- Apply BEFORE 20261019000002_rls.sql.
--
-- Security notes
--  * Every user-owned row carries user_id and is protected by Row Level Security (see next migration).
--  * We store payment-method LABELS only (UPI / Credit Card / ...). No card numbers, CVVs,
--    bank credentials or UPI PINs are stored anywhere, and there is deliberately no column for them.
--  * Check constraints repeat the client-side (Zod) validation, so bad data is rejected even if
--    someone calls the API directly with the public anon key.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 80),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- user_settings
-- ---------------------------------------------------------------------------
create table public.user_settings (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  default_currency       text        not null default 'INR' check (default_currency in ('INR', 'USD', 'EUR', 'GBP')),
  default_reminder_days  smallint[]  not null default '{7,1}'
                         check (default_reminder_days <@ array[0, 1, 3, 7]::smallint[]),
  browser_notifications  boolean     not null default false,
  onboarding_completed   boolean     not null default false,
  dismissed_leak_flags   text[]      not null default '{}' check (cardinality(dismissed_leak_flags) <= 500),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,
  name                   text not null check (char_length(btrim(name)) between 1 and 80),
  provider               text check (provider is null or char_length(provider) <= 80),
  category               text not null default 'Other' check (category in (
                           'Entertainment', 'Music', 'Software', 'Education', 'Fitness',
                           'Shopping', 'Cloud Storage', 'News', 'Utilities', 'Other')),
  amount                 numeric(12, 2) not null check (amount >= 0 and amount <= 10000000),
  currency               text not null default 'INR' check (currency in ('INR', 'USD', 'EUR', 'GBP')),
  frequency              text not null default 'monthly' check (frequency in (
                           'weekly', 'monthly', 'quarterly', 'half_yearly', 'yearly', 'custom')),
  custom_interval_days   integer,
  start_date             date not null,
  next_renewal_date      date not null,
  payment_method         text not null default 'UPI' check (payment_method in (
                           'UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'Wallet', 'Other')),
  notes                  text check (notes is null or char_length(notes) <= 1000),
  trial_end_date         date,
  status                 text not null default 'active' check (status in (
                           'active', 'trial', 'paused', 'cancellation_planned', 'cancelled')),
  archived               boolean not null default false,
  unused                 boolean not null default false,
  cancellation_url       text check (cancellation_url is null
                                     or (char_length(cancellation_url) <= 500 and cancellation_url ~* '^https?://')),
  cancellation_checklist jsonb not null default '[]'::jsonb
                         check (jsonb_typeof(cancellation_checklist) = 'array'
                                and jsonb_array_length(cancellation_checklist) <= 30),
  cancelled_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  -- coalesce(): a NULL inside a CHECK counts as "passed", so a missing interval must be forced to false.
  constraint subscriptions_custom_interval_chk check (
    (frequency = 'custom' and coalesce(custom_interval_days between 1 and 3650, false))
    or (frequency <> 'custom' and custom_interval_days is null)
  ),
  constraint subscriptions_renewal_after_start_chk check (next_renewal_date >= start_date),
  -- Lets child tables reference (id, user_id) so a child row can never point at someone else's subscription.
  constraint subscriptions_id_user_uk unique (id, user_id)
);

create index subscriptions_user_status_idx    on public.subscriptions (user_id, status);
create index subscriptions_user_renewal_idx   on public.subscriptions (user_id, next_renewal_date);
create index subscriptions_user_archived_idx  on public.subscriptions (user_id, archived);

-- ---------------------------------------------------------------------------
-- reminder_preferences (one row per subscription)
-- ---------------------------------------------------------------------------
create table public.reminder_preferences (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid not null,
  enabled         boolean    not null default true,
  -- Days before the renewal: 7, 3, 1, or 0 (on the day).
  days_before     smallint[] not null default '{7,1}' check (days_before <@ array[0, 1, 3, 7]::smallint[]),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint reminder_preferences_subscription_uk unique (subscription_id),
  constraint reminder_preferences_subscription_fk
    foreign key (subscription_id, user_id) references public.subscriptions (id, user_id) on delete cascade
);

create index reminder_preferences_user_idx on public.reminder_preferences (user_id);

-- ---------------------------------------------------------------------------
-- notifications (in-app notification centre)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid,
  kind            text not null check (kind in ('renewal', 'trial_end', 'system')),
  title           text not null check (char_length(title) between 1 and 200),
  body            text not null default '' check (char_length(body) <= 1000),
  -- e.g. "<subscription id>:renewal:2026-11-01:7" so a reminder is only ever created once.
  dedupe_key      text not null check (char_length(dedupe_key) between 1 and 200),
  read_at         timestamptz,
  created_at      timestamptz not null default now(),
  constraint notifications_dedupe_uk unique (user_id, dedupe_key),
  constraint notifications_subscription_fk
    foreign key (subscription_id, user_id) references public.subscriptions (id, user_id) on delete cascade
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx  on public.notifications (user_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- subscription_status_history (written by trigger only; clients can read, not write)
-- ---------------------------------------------------------------------------
create table public.subscription_status_history (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid not null,
  from_status     text check (from_status is null or from_status in (
                    'active', 'trial', 'paused', 'cancellation_planned', 'cancelled')),
  to_status       text not null check (to_status in (
                    'active', 'trial', 'paused', 'cancellation_planned', 'cancelled')),
  changed_at      timestamptz not null default now(),
  constraint status_history_subscription_fk
    foreign key (subscription_id, user_id) references public.subscriptions (id, user_id) on delete cascade
);

create index status_history_subscription_idx on public.subscription_status_history (subscription_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Keeps updated_at honest.
create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at             before update on public.profiles             for each row execute function public.set_updated_at();
create trigger user_settings_set_updated_at        before update on public.user_settings        for each row execute function public.set_updated_at();
create trigger subscriptions_set_updated_at        before update on public.subscriptions        for each row execute function public.set_updated_at();
create trigger reminder_preferences_set_updated_at before update on public.reminder_preferences for each row execute function public.set_updated_at();

-- Cancellation rules, enforced in the database:
--  * only status = 'cancelled' sets cancelled_at ("cancellation_planned" never counts as cancelled)
--  * moving away from 'cancelled' clears it
--  * a row can never be handed to another user
create function public.subscriptions_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then
    raise exception 'user_id cannot be changed';
  end if;

  if new.status = 'cancelled' then
    if tg_op = 'INSERT' or old.status <> 'cancelled' then
      new.cancelled_at := coalesce(new.cancelled_at, now());
    end if;
  else
    new.cancelled_at := null;
  end if;
  return new;
end;
$$;

create trigger subscriptions_guard_trg
  before insert or update on public.subscriptions
  for each row execute function public.subscriptions_guard();

-- Records every status change. SECURITY DEFINER because clients have no INSERT right on the history table.
create function public.subscriptions_log_status() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.subscription_status_history (user_id, subscription_id, from_status, to_status)
    values (new.user_id, new.id, null, new.status);
  elsif new.status is distinct from old.status then
    insert into public.subscription_status_history (user_id, subscription_id, from_status, to_status)
    values (new.user_id, new.id, old.status, new.status);
  end if;
  return null;
end;
$$;

create trigger subscriptions_log_status_trg
  after insert or update of status on public.subscriptions
  for each row execute function public.subscriptions_log_status();

-- Creates the profile and settings rows when someone signs up.
create function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)), 80), ''))
  on conflict (id) do nothing;

  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger functions are never meant to be called directly through the API.
revoke execute on function public.set_updated_at()          from public, anon, authenticated;
revoke execute on function public.subscriptions_guard()     from public, anon, authenticated;
revoke execute on function public.subscriptions_log_status() from public, anon, authenticated;
revoke execute on function public.handle_new_user()         from public, anon, authenticated;
