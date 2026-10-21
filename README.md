# SubSave

Track recurring expenses, find forgotten subscriptions, estimate what you could save, and avoid unwanted renewals. Built for students, young professionals and households. INR first, with USD, EUR and GBP supported.

**Stack:** React 18 + TypeScript, Vite, Tailwind CSS 3, Lucide, Recharts, React Hook Form + Zod, date-fns, Supabase (Postgres, Auth, Row Level Security).

## What it does

| Area | Details |
| --- | --- |
| Dashboard | Monthly and annual recurring spend, active count, renewals in the next 7 days, **estimated** potential savings, **confirmed** cancellations, 6-month charge chart, upcoming renewals, highest-cost and recently added subscriptions |
| Subscriptions | Add, edit, pause, archive, plan a cancellation, confirm a cancellation, delete (with confirmation dialogs). Search, filter by category / payment method / status, sort by renewal / amount / name, CSV export, print |
| Renewal calendar | Charges and trial endings in date order for 30 / 60 / 90 days or 12 months, using each subscription's real billing cycle |
| Reminders | 7 days, 3 days, 1 day, on the day. Configurable per subscription. Shown in an in-app notification centre when you open SubSave, with optional browser pop-ups |
| Find My Leaks | Unused, trial ending, **possible** duplicates, high cost relative to others, cancellation planned but still active, several in one category. Each flag explains why, and can be dismissed and restored |
| Reports | Monthly and yearly views, category chart and table, CSV export, print summary |
| Details page | Schedule, annualised cost, reminders, notes, status history, cancellation checklist, optional cancellation URL |
| Onboarding | A quick flow to add the first three subscriptions |
| Demo mode | Clearly labelled sample data stored only in the browser, never mixed with a real account |

### Things SubSave deliberately does not do

* It **does not cancel anything**. You cancel with the provider, then confirm it in SubSave. "Cancellation planned" still counts as spending until you confirm.
* Savings are **estimates**. Only subscriptions you set to *Cancelled* count as confirmed, and past payments are never counted as recovered money.
* Duplicates are always labelled **possible**, never confirmed. Expensive is never labelled wasteful.
* It **never converts currencies**. Totals use your main currency, and other currencies are listed separately.
* It stores payment-method **labels only** (UPI, Credit Card, ...). There is no column or field for card numbers, CVVs, bank logins or UPI PINs.
* It **cannot send reminders while closed** (see [Reminders](#reminders-what-works-and-what-does-not)).

## Run it locally

You need Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local     # then fill in the two values (see below)
npm run dev                    # http://localhost:5173
```

With no `.env.local`, SubSave shows a setup screen and offers demo mode. It never pretends data is being saved.

## Connect Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **Create the tables.** Open *SQL Editor* and run these two files, in order:
   1. `supabase/migrations/20261019000001_schema.sql` (tables, constraints, indexes, triggers)
   2. `supabase/migrations/20261019000002_rls.sql` (Row Level Security and privileges)

   Or, with the [Supabase CLI](https://supabase.com/docs/guides/cli): `supabase link --project-ref <ref>` then `supabase db push`.
3. **Add your keys.** In *Project Settings, then API*, copy the project URL and the **anon / publishable** key into `.env.local`:

   ```
   VITE_SUPABASE_URL=https://<your-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon or publishable key>
   ```

   Never use the `service_role` / secret key. SubSave refuses to start if it detects one.
4. **Authentication settings** (*Authentication, then Providers, then Email*): keep **Confirm email** switched on so addresses are verified.
5. **Redirect URLs** (*Authentication, then URL Configuration*): set the Site URL to your app's address and add these to the allow-list, otherwise verification and password-reset links will not work:
   * `http://localhost:5173/**` (local development)
   * `https://<your-production-domain>/**`
6. Restart `npm run dev` so the new values are read.

The first time you sign up you land on a short onboarding flow. Supabase's built-in email sender is rate-limited, so configure custom SMTP before real users arrive.

## Test it

```bash
npm test            # unit and component tests (Vitest)
npm run typecheck   # TypeScript
npm run build       # typecheck + production build
```

What the tests cover:

* Monthly and annual cost for every billing frequency, custom intervals, zero and invalid amounts, INR formatting
* Renewal dates: month-end clamping with no drift, leap years, stale dates rolling forward
* Trial expiry, possible-duplicate detection, leak flags, reminder generation and de-duplication
* Cancellation status changes and history (planned does not cancel, confirmed does)
* CSV export, including protection against spreadsheet formula injection
* Route protection (`resolveAccess` rules and the rendered `<ProtectedRoute>`)
* Repository scoping by signed-in user, error mapping, demo/real data separation
* Static checks that the SQL enables RLS on every table and that no service-role key is in the frontend

### Database isolation test

`supabase/tests/rls_isolation.sql` checks the database itself. Run it in the SQL editor **after** the migrations. It creates two throw-away users, tries to make one read, edit, delete and impersonate the other, checks the constraints and the cancellation rules, and then **rolls back**, so nothing is left behind. It ends with `all isolation checks passed`, or stops with an error starting `FAIL:`.

## Deploy

SubSave is a static single-page app, so any static host works. The build output is `dist/`.

**Vercel:** import the repository, framework preset *Vite*, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under *Environment Variables*, deploy. `vercel.json` already routes every path to `index.html`.

**Netlify:** build command `npm run build`, publish directory `dist`, add the same two environment variables. `public/_redirects` already handles routing.

After the first deploy, add the production URL to Supabase's redirect allow-list (step 5 above).

**Security headers and CI.** `vercel.json` (and `public/_headers` for Netlify) set a Content-Security-Policy, anti-framing, no-sniffing, referrer and HSTS headers. The CSP allows connections to `*.supabase.co`; if you use a Supabase custom domain, add it to `connect-src`. `.github/workflows/ci.yml` runs typecheck, tests and build on every push and pull request. Once you commit a `package-lock.json`, switch the workflow's install step to `npm ci`.

Vite inlines `VITE_*` variables into the public bundle at build time. That is safe for the URL and anon key because Row Level Security is what protects the data, but it is exactly why a secret key must never go there.

## Reminders: what works and what does not

* **Works:** every time SubSave opens (or the tab returns on a new day), it works out which reminders are due and adds them to the notification centre. Each reminder has a de-duplication key, so reopening the app does not repeat it. If you turn on browser notifications in Settings, new reminders also show as a browser pop-up.
* **Does not work:** alerts while the browser is closed. A web page cannot do that, and no background infrastructure is included in this release. Nothing in the app claims otherwise.

**To add real background reminders later** (not built):

1. Add a `push_subscriptions` table and a service worker that registers for Web Push (or add email delivery).
2. Write a Supabase Edge Function that selects renewals and trial endings falling on today's reminder offsets (`computeDueReminders` in `src/lib/reminders.ts` is pure and can be ported as is), inserts rows into `notifications` using the `(user_id, dedupe_key)` unique constraint to avoid repeats, and sends the push or email.
3. Schedule it daily with `pg_cron` plus `pg_net`, or Supabase Scheduled Functions. The service-role key lives only inside the Edge Function's secrets, never in the frontend.

## Project layout

```
src/
  lib/            Pure logic: dates, calc (costs, savings), leaks, reminders, csv, filters, schema, access
    repo/         Storage behind one interface: supabaseRepo (cloud) and demoRepo (browser only)
  context/        Auth, data and toast providers
  components/     UI primitives, layout (sidebar + bottom nav), form, charts, notification centre
  pages/          Dashboard, Subscriptions, details, Calendar, Leaks, Reports, Settings, Auth, Setup, Onboarding
  test/           Vitest suites
supabase/
  migrations/     Schema and RLS (apply in order)
  tests/          rls_isolation.sql
```

## Cost rules

| Billing | Monthly equivalent | Payments per year |
| --- | --- | --- |
| Weekly | amount × 52 / 12 | 52 |
| Monthly | amount | 12 |
| Quarterly | amount / 3 | 4 |
| Half-yearly | amount / 6 | 2 |
| Yearly | amount / 12 | 1 |
| Custom (every *N* days) | amount × (365.2425 / N) / 12 | 365.2425 / N |

The custom rule uses the average Gregorian year, which accounts for leap years. Annual cost is always the monthly equivalent × 12. Renewal dates are calendar dates handled in UTC arithmetic, so they do not shift with time zones or daylight saving, and a subscription anchored on the 31st renews on the last day of shorter months without drifting.

Spending totals include **Active** and **Cancellation planned** (both still bill). **Trial**, **Paused**, **Cancelled** and **archived** subscriptions are excluded.

## Security notes

* Row Level Security is on for all six tables. Policies allow only `user_id = auth.uid()`, and signed-out visitors have no table privileges.
* Child tables use composite foreign keys, so a row can never point at another user's subscription.
* Status history is written only by a database trigger. Clients can read it but not write it.
* Check constraints repeat the form validation, so bad data is rejected even if someone calls the API directly.
* Every query also filters by the signed-in user's id, as a second layer on top of RLS.
* User-entered cancellation links are only ever opened if they are `http(s)`, and with `rel="noopener noreferrer"`.
* No `dangerouslySetInnerHTML`, no `eval`, and no logging of payment or credential details.
