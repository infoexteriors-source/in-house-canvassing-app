# WE ROOF setup

## 1. Company backend

Use a dedicated Supabase Postgres project. Install/sign in to the Supabase CLI, then from the repository root:

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy sync
supabase functions deploy owner-admin
supabase functions deploy geocode
supabase functions deploy jobnimbus-worker
```

The Edge functions intentionally disable gateway JWT verification and perform their own verification with Supabase Auth on every request. The CRM worker requires its separate server-only worker key. Do not remove these checks.

Keep signups disabled. Configure a production SMTP provider for invitations and set the dashboard's deployed URL as the Auth site URL. Add the deployed dashboard URL, its `?activation=1` redirect, and `weroof://` to allowed redirects. Set `INVITE_REDIRECT_URL=https://YOUR_DASHBOARD/?activation=1`. The invited user sets a password on that activation page, then signs in to the mobile app. Authentication links are not handled by the demo.

Create the first owner using `scripts/bootstrap.mjs` with server-only environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `COMPANY_NAME=WE ROOF`
- `OWNER_NAME`, `OWNER_EMAIL`, `OWNER_PASSWORD` (at least 12 characters)

Then run `npm run bootstrap`. Do this in a trusted terminal, not in a browser. The script creates an owner account and membership; it does not print credentials. It refuses to silently reset an existing account. Remove the owner password from your shell/environment after bootstrap. Never use the service-role key as a Vite or Expo public variable.

## 2. Dashboard and maps

Copy `apps/dashboard/.env.example` to `apps/dashboard/.env.local` and populate the project URL, Supabase publishable key, and a Mapbox public map token. Restart the Vite server. A configured dashboard shows sign-in and offers a separate demo mode.

Create a Mapbox account/token for the web map and native SDK. Restrict the dashboard token to the deployed web origins where supported. Create a server token for address lookup with permanent geocoding enabled and a billing configuration that supports permanent results. Set `MAPBOX_SERVER_TOKEN` only in Edge secrets. Manual address entry continues to work when geocoding is offline/unavailable. House coordinates supplied by reps are stored separately from their GPS reading.

Host `apps/dashboard/dist` on your preferred HTTPS static host after `npm run build`. Configure fallback to `index.html` for the invitation activation URL. No host is provisioned automatically.

## 3. Native apps

Copy `apps/mobile/.env.example` to `apps/mobile/.env.local`. Populate `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `EXPO_PUBLIC_MAPBOX_TOKEN`.

Use Apple/Google developer accounts and Expo EAS. App identifiers are `com.weroof.canvassing`; change them before first publication if the identifier is unavailable. Configure the EAS project for your account. If Mapbox's native artifact download requires credentials, supply a downloads-scoped `MAPBOX_DOWNLOADS_TOKEN` in EAS secrets; never prefix it with `EXPO_PUBLIC_`.

```sh
cd apps/mobile
npx eas-cli build --profile development --platform ios
npx eas-cli build --profile development --platform android
npx expo start --dev-client
```

Development builds use internal distribution. For TestFlight/Play internal testing, build `--profile production` and submit through your store account. The local JS export confirms bundling, not an installable or store-approved binary.

Reps enable foreground and background location, sign in, and download their assigned maps while connected. The Android foreground service and iOS tracking indicator explain active location collection. Clock-out and breaks stop both background updates and the map's location puck. Restart recovery uses recorded shift state; no automatic clock-in occurs.

SQLite preserves field records and the outbox in the app sandbox. Auth credentials are in SecureStore. Do not uninstall the app with unsynced records. Logout requires pending work to sync first. A deactivated account stops capture once revocation is observed online; the server refuses its submissions immediately. A disconnected phone cannot observe revocation until it reconnects.

## 4. JobNimbus

Create an API key in the company's JobNimbus settings with the access profile needed to search/create contacts and create tasks. Configure these server secrets using the Supabase dashboard or `supabase secrets set --env-file PATH_TO_PRIVATE_ENV_FILE`:

- `JOBNIMBUS_API_KEY`
- `JOBNIMBUS_CONTACT_WORKFLOW`: the exact existing contact workflow name
- `JOBNIMBUS_CONTACT_STATUS`: the exact lead status in that workflow
- `JOBNIMBUS_TASK_TYPE`: the existing follow-up task type name
- `JOBNIMBUS_OFFICE_ASSIGNEE`: the office member's JobNimbus record ID
- `CRM_WORKER_KEY`: a newly generated long random secret
- `INVITE_REDIRECT_URL`
- `MAPBOX_SERVER_TOKEN`

The adapter uses JobNimbus's documented public `/api1/contacts` and `/api1/tasks` endpoints. Test the account's API key, workflows, response shapes, and assignee in a sandbox before enabling production writes. API keys may expire; track their expiration in JobNimbus settings.

Contacts are linked using `external_id=fieldwork-property:PROPERTY_UUID`. Existing contacts created by this integration are reused for repeat visits. Preexisting contacts from other sources are not automatically merged by phone/name; manually link them during reconciliation if needed. This avoids assigning a household lead to the wrong person. Inspection tasks include the lead ID in their title and the requested window in their description. Windows are preferences, not booked appointments.

Definitive HTTP errors become `failed` and can be retried from the lead panel. Timeouts, ambiguous server failures, interrupted workers, and missing remote IDs become `review`; those are never automatically re-created. Open JobNimbus and verify whether the contact/task exists. In the lead panel, enter verified remote IDs to release the job. If a possibly completed task cannot be found with certainty, leave the job in review and consult the office rather than creating a duplicate.

For one manual worker run, supply `SUPABASE_URL` and `CRM_WORKER_KEY` to `npm run crm:work`. Do not use the Supabase publishable key to authenticate the worker.

## 5. Scheduled delivery and retention

In the dedicated Supabase project's Vault, create:

- `fieldwork_supabase_url`: the project's HTTPS URL
- `fieldwork_crm_worker_key`: the same value as the Edge worker secret

Execute `supabase/operations.sql` in that project's SQL editor. It runs CRM delivery every minute and deletes raw `location_samples` older than 90 days each morning. Inspect Cron run history and HTTP responses after setup. Do not run this operations script against an unrelated project. The migration alone does not enable recurring jobs.

Per-visit GPS evidence remains in visit history, as the plan retains visit records. The 90-day policy applies to continuous route samples. Original shifts, visits, leads, review decisions, and command IDs remain stored. Keeping processed command IDs prevents late retries from recreating old work.

## 6. Pilot

Invite two canvassers, assign small territories, and complete the device checks in `VALIDATION.md`. Confirm the dashboard's location timestamps, office CRM tasks, delivery failures, and daily timesheets before inviting the full team. Monitor phone battery, raw route gaps, unresolved phone outboxes, CRM queue errors, and server function logs. A stale map point must not be interpreted as a current location.
