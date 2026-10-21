-- SubSave: Row Level Security isolation checks.
--
-- Run this AFTER both migrations, in the Supabase SQL editor (or `psql`). It creates two throw-away
-- users, tries to make one of them read, change, delete and impersonate the other, and then ROLLS
-- BACK, so nothing is left behind. If any check fails it raises an error beginning with "FAIL:".
-- On success the last line shows "all isolation checks passed".

begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-a@test.invalid'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-b@test.invalid');

-- Sign-up trigger created profile + settings for each user.
do $$
begin
  if (select count(*) from public.user_settings where user_id in
        ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1')) <> 2 then
    raise exception 'FAIL: signup trigger did not create user_settings rows';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- User A creates a subscription, reminder preference, and notification.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

insert into public.subscriptions (id, user_id, name, amount, start_date, next_renewal_date)
values ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'A Netflix', 649, '2026-01-01', '2026-12-01');
insert into public.reminder_preferences (user_id, subscription_id)
values ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1');
insert into public.notifications (user_id, subscription_id, kind, title, dedupe_key)
values ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'renewal', 'A reminder', 'k1');

do $$
begin
  if (select count(*) from public.subscriptions) <> 1 then raise exception 'FAIL: A cannot see their own subscription'; end if;
  if (select count(*) from public.subscription_status_history) <> 1 then
    raise exception 'FAIL: status history was not recorded by the trigger';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- User B tries to reach A's data.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

do $$
declare
  changed integer;
  done boolean;
begin
  -- Reads
  if (select count(*) from public.subscriptions) <> 0 then raise exception 'FAIL: B can read A''s subscriptions'; end if;
  if (select count(*) from public.reminder_preferences) <> 0 then raise exception 'FAIL: B can read A''s reminder preferences'; end if;
  if (select count(*) from public.notifications) <> 0 then raise exception 'FAIL: B can read A''s notifications'; end if;
  if (select count(*) from public.subscription_status_history) <> 0 then raise exception 'FAIL: B can read A''s status history'; end if;
  if (select count(*) from public.user_settings) <> 1 then raise exception 'FAIL: B should see only their own settings row'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'FAIL: B should see only their own profile'; end if;

  -- Updates and deletes silently match nothing.
  update public.subscriptions set name = 'hacked' where id = '10000000-0000-0000-0000-0000000000a1';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAIL: B updated A''s subscription'; end if;

  delete from public.subscriptions where id = '10000000-0000-0000-0000-0000000000a1';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAIL: B deleted A''s subscription'; end if;

  update public.notifications set read_at = now() where user_id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAIL: B changed A''s notifications'; end if;

  -- Inserting a row owned by A is refused.
  done := false;
  begin
    insert into public.subscriptions (user_id, name, amount, start_date, next_renewal_date)
    values ('00000000-0000-0000-0000-0000000000a1', 'planted', 1, '2026-01-01', '2026-02-01');
    done := true;
  exception when others then null;
  end;
  if done then raise exception 'FAIL: B inserted a subscription owned by A'; end if;

  -- B cannot hand their own row to A.
  insert into public.subscriptions (id, user_id, name, amount, start_date, next_renewal_date)
  values ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'B Spotify', 119, '2026-01-01', '2026-12-05');
  done := false;
  begin
    update public.subscriptions set user_id = '00000000-0000-0000-0000-0000000000a1'
    where id = '10000000-0000-0000-0000-0000000000b1';
    done := true;
  exception when others then null;
  end;
  if done then raise exception 'FAIL: B transferred a row to A'; end if;

  -- A child row for B cannot point at A's subscription (composite foreign key).
  done := false;
  begin
    insert into public.notifications (user_id, subscription_id, kind, title, dedupe_key)
    values ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000a1', 'renewal', 'sneaky', 'k2');
    done := true;
  exception when others then null;
  end;
  if done then raise exception 'FAIL: B attached a notification to A''s subscription'; end if;

  done := false;
  begin
    insert into public.reminder_preferences (user_id, subscription_id)
    values ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000a1');
    done := true;
  exception when others then null;
  end;
  if done then raise exception 'FAIL: B attached a reminder preference to A''s subscription'; end if;

  -- Clients cannot write status history directly.
  done := false;
  begin
    insert into public.subscription_status_history (user_id, subscription_id, to_status)
    values ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', 'cancelled');
    done := true;
  exception when others then null;
  end;
  if done then raise exception 'FAIL: a client wrote to subscription_status_history'; end if;

  -- Bad data is rejected by constraints even if the client skips validation.
  done := false;
  begin
    insert into public.subscriptions (user_id, name, amount, start_date, next_renewal_date, frequency)
    values ('00000000-0000-0000-0000-0000000000b1', 'bad custom', 5, '2026-01-01', '2026-02-01', 'custom');
    done := true;
  exception when others then null;
  end;
  if done then raise exception 'FAIL: a custom frequency without an interval was accepted'; end if;

  done := false;
  begin
    insert into public.subscriptions (user_id, name, amount, start_date, next_renewal_date)
    values ('00000000-0000-0000-0000-0000000000b1', 'negative', -5, '2026-01-01', '2026-02-01');
    done := true;
  exception when others then null;
  end;
  if done then raise exception 'FAIL: a negative amount was accepted'; end if;

  done := false;
  begin
    insert into public.subscriptions (user_id, name, amount, start_date, next_renewal_date, cancellation_url)
    values ('00000000-0000-0000-0000-0000000000b1', 'js link', 5, '2026-01-01', '2026-02-01', 'javascript:alert(1)');
    done := true;
  exception when others then null;
  end;
  if done then raise exception 'FAIL: a javascript: cancellation URL was accepted'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Cancellation rules enforced by the database.
-- ---------------------------------------------------------------------------
do $$
begin
  update public.subscriptions set status = 'cancellation_planned' where id = '10000000-0000-0000-0000-0000000000b1';
  if (select cancelled_at from public.subscriptions where id = '10000000-0000-0000-0000-0000000000b1') is not null then
    raise exception 'FAIL: planning a cancellation set cancelled_at';
  end if;
  update public.subscriptions set status = 'cancelled' where id = '10000000-0000-0000-0000-0000000000b1';
  if (select cancelled_at from public.subscriptions where id = '10000000-0000-0000-0000-0000000000b1') is null then
    raise exception 'FAIL: confirming a cancellation did not set cancelled_at';
  end if;
  update public.subscriptions set status = 'active' where id = '10000000-0000-0000-0000-0000000000b1';
  if (select cancelled_at from public.subscriptions where id = '10000000-0000-0000-0000-0000000000b1') is not null then
    raise exception 'FAIL: re-activating did not clear cancelled_at';
  end if;
  if (select count(*) from public.subscription_status_history
        where subscription_id = '10000000-0000-0000-0000-0000000000b1') <> 4 then
    raise exception 'FAIL: expected 4 history rows (added, planned, cancelled, active)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Signed-out visitors get nothing.
-- ---------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

do $$
declare
  seen boolean := false;
begin
  begin
    perform 1 from public.subscriptions limit 1;
    seen := true;
  exception when insufficient_privilege then null;
  end;
  if seen then raise exception 'FAIL: signed-out visitors can query subscriptions'; end if;
end $$;

reset role;
select 'all isolation checks passed' as result;
rollback;
