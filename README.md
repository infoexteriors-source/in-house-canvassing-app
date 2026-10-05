# WE ROOF · Field operations

An owner dashboard and iPhone/Android canvasser app for a roofing team. Includes assigned territories, shifts and breaks, background location, door history, homeowner leads, inspection requests, owner review, timesheet corrections, and a server-side JobNimbus delivery queue.

## Run the dashboard

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Without company credentials, the dashboard opens a clearly labeled demo with sample data. Demo invitations, territory changes, reviews, and corrections stay in your browser. No real invitations or CRM writes occur in demo mode. Use **Reset demo** to restore the sample workspace.

The dashboard uses a charcoal and roofing-red WE ROOF theme. Door outcomes retain distinct semantic colors and labels. The illustrative demo map requires no paid accounts. A Mapbox token enables real maps.

## Connect the company and field apps

Follow [docs/SETUP.md](docs/SETUP.md) to deploy Supabase, create the first owner, configure Mapbox and JobNimbus, schedule delivery and retention jobs, and build the native apps. No production project or real company account is provisioned by this repository.

The native app needs an Expo development build; Expo Go does not support its Mapbox native module and background tracking. Run `npm run mobile` after configuring credentials and installing the development build.

## Checks

```sh
npm run typecheck
npm test
npm run build
npm run check:server
npm run test:db
```

`test:db` needs Docker. It creates and removes an isolated Postgres 17/PostGIS container. It tests the real migration, transactional writes, GPS exceptions, idempotency, do-not-knock behavior, owner corrections, deactivation, CRM lease recovery, and company/rep row-access rules. It never connects to a hosted database. Its minimal auth fixture is a test substitute for Supabase Auth; deployed authentication and realtime still need a pilot check.

Mobile JavaScript bundle verification:

```sh
cd apps/mobile
npx expo export --platform ios --platform android --output-dir ../../.cache/mobile-export
```

See [docs/VALIDATION.md](docs/VALIDATION.md) for completed checks and the device/credential-dependent launch checklist.

## Project layout

- `apps/dashboard`: React/Vite owner dashboard, demo data, and authenticated company mode.
- `apps/mobile`: Expo/React Native field app, SQLite offline journal, SecureStore authentication, downloaded maps, and shift-scoped tracking.
- `packages/core`: shared records, time calculations, GPS checks, route-gap handling, CSV export, and outbox logic.
- `supabase`: PostgreSQL/PostGIS migration, policies, transactional ingestion, authenticated owner functions, geocoding, CRM worker, and scheduler setup.

All client tables are read-only. Field and owner writes pass through authenticated server endpoints. Rep routes are only visible to that rep and company owners. The browser/mobile clients receive only publishable credentials. JobNimbus and service-role keys stay on the server.

## Operational boundaries

Field time excludes breaks. Original events are immutable; corrections are separate owner decisions. Locations older than two minutes are marked stale and routes do not connect across tracking gaps. Collection stops on breaks/clock-out, and the server rejects delayed samples outside active intervals. GPS is evidence for review, not proof a door was knocked.

Force-closing the app, disabling permissions, and some phone power-saving behaviors can stop tracking. Offline records retain their unique IDs through retries and app restarts. Invalid submissions remain on the phone with an actionable error rather than silently disappearing. Reps download maps while online; automatic offline address lookup is not available, so manual address entry is supported.

JobNimbus contact IDs are retained, uncertain writes require reconciliation, and confirmed inspection booking remains an office responsibility. Payroll, commissions, property-data subscriptions, and two-way CRM sync are outside this release.
