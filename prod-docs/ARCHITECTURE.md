# BMServ — Architecture

How it is built. Behaviour: PRD.md. If code and this file disagree, fix one of them in the same change.

## 1. Shape

```
Browser / installed PWA
     |  HTTPS, same origin, session cookie
     v
Vercel: static web app (web/dist) + one Node function for /api/* and /health (Hono)
  |            |               |             \
Turso        Cloudflare R2   Resend        Vercel Cron, daily 02:15 UTC (08:00 NPT)
(libSQL)     (files, signed  (email)       -> GET /api/jobs/tick (Bearer CRON_SECRET)
              upload/download)
```

- **One install = one hospital.** No hospital column. Hospital details live in the single `settings` row (seeded as ABC Hospital). A new hospital = new deploy with its own Turso database, R2 bucket and environment values.
- **Live services from the first phase.** The app always uses Turso, R2 and Resend. There is no local database file and no local file storage. Automated tests use a throwaway in-memory libSQL database (`:memory:`) so they never touch real data.
- **One deployable**: on Vercel, the Build Output API (`.vercel/output`: static files + function `api`). On any always-on host, `npm run build && npm start` runs one Node process (`server/src/index.ts`) that also serves `web/dist` and runs the hourly scheduler.

## 2. Stack

| Part | Choice | Notes |
|---|---|---|
| Language | TypeScript, strict | everywhere |
| Server | Node.js 22 with Hono (`@hono/node-server`) | `server/src/app.ts`; entries `index.ts` (Node) and `vercel.ts` (Vercel) |
| Database | Turso via `@libsql/client` | |
| Data access | Drizzle ORM + drizzle-kit migrations | SQLite dialect / turso |
| Sign-in | Better Auth | Drizzle adapter (`provider: "sqlite"`), `username` plugin, public sign-up off, DB-backed rate limit; no admin plugin (team accounts via the internal adapter) |
| Files | Cloudflare R2 via S3 API (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`) | private bucket, presigned PUT and GET |
| Email | Resend | text + simple HTML |
| Notifications | Web Push with VAPID via `web-push` 3.6 (server); service worker handler `web/public/push-sw.js` | only caller: `services/push.ts` |
| WhatsApp | `https://wa.me/<number>?text=` links built in `shared/src/phone.ts` | no API; nothing sent by BMServ |
| Scheduler | Vercel Cron daily (08:00 NPT); `node-cron` hourly on always-on hosts | both call `jobs/tick.ts` |
| Web app | React 19 + Vite 8, React Router 7, TanStack Query 5 | icons `lucide-react` |
| Styling | Plain CSS: design tokens (`tokens.css`), component stylesheet (`base.css`), screen styles (`screens.css`: dashboard, settings tabs, account, phone field) | no UI kit, no chart library (charts are HTML + CSS) |
| PWA | `vite-plugin-pwa` | |
| Validation | Zod, shared | |
| Nepali dates | `nepali-date-converter` (BS 2000–2090), wrapped in `shared/src/dates.ts` | |
| QR | `qrcode` (SVG) | in the browser |
| PowerPoint | `pptxgenjs` 4.0.1 | in the browser, loaded only when a report is downloaded |
| Scanning | browser camera + `jsqr` | |
| Tests | Vitest | in-memory libSQL |
| Build | `esbuild` (server bundle), `tsx` (scripts, dev), `concurrently` (dev) | |

Versions in MEMORY.md section 7. **Check current docs before writing integration code** for Better Auth, Drizzle + Turso, R2 presigning, Resend and vite-plugin-pwa. Record installed versions in MEMORY.md.

## 3. Repository layout

Spec files live in `prod-docs/`; `CLAUDE.md` and `MEMORY.md` in the root; original logos in `assets/logos/`, sign-in photos in `assets/images/`.

```
/                           project root
  CLAUDE.md  MEMORY.md
  prod-docs/                PRD.md  ARCHITECTURE.md  DESIGN.md  PHASES.md  RULES.md
  assets/logos/  assets/images/   originals; cropped/compressed copies in web/public/brand/
  .env.example  vercel.json  README.md  package.json (workspaces)
  shared/src/
    terms.ts                every on-screen word and status label
    permissions.ts          who can do what (single source)
    dates.ts                BS/AD conversion, "today" in Asia/Kathmandu
    pms.ts                  PMS schedule maths (days, months, years)
    phone.ts                country codes, stored phone format, wa.me and tel: links
    schemas/                Zod schemas per feature
  server/src/
    app.ts                  Hono app: /api routes, /health, /api/jobs/tick, error handler
    index.ts                Node entry: migrations, static web/dist, scheduler
    vercel.ts               Vercel function entry
    env.ts                  validates environment values at start
    auth.ts                 Better Auth
    db/client.ts  db/schema/  db/migrations/  db/seed.ts
    routes/                 thin: session, role, validate, call service
    services/               business rules (push.ts: only web-push caller; notify.ts; report.ts: staff reports)
    routes/report.ts        report a problem, my reports, notification devices
    emails/                 templates, send.ts (only Resend caller), recipients.ts
    jobs/tick.ts            hourly work (daily emails, PMS reminders, auto-resume, coverage end)
    jobs/scheduler.ts       node-cron wiring
    lib/r2.ts  lib/ids.ts  lib/errors.ts  lib/http.ts (session, role, staff gate)  lib/sqlRef.ts
    scripts/check-services.ts   verifies Turso, R2 (put/get/delete) and Resend
    scripts/r2-cors.ts      sets bucket CORS for browser uploads (needs an Admin token)
    scripts/migrate.ts  scripts/vercel-output.ts
    test/                   setup.ts (in-memory libSQL, roles) + tests
  web/src/
    app/                    router, layout, navigation, auth guard
    screens/                one folder per screen
    components/             ui.tsx (Pill, Row, Fact, fields, PhoneField, Switch, WhatsAppButton, Sheet, Confirm, Toast), charts.tsx, ModelFields, PmsFrequencyField, DateField, files, EquipmentLine…
    lib/                    api client, query keys, date display, push.ts (browser notifications)
    styles/tokens.css base.css screens.css
    print/label.css labelSheet.ts   QR label sheet
  web/public/brand/         logo copies, PWA icons
  web/public/push-sw.js     push and notification-click handlers for the service worker
```

npm workspaces: `shared`, `server`, `web`.

## 4. Data

Conventions: text ids (nanoid). Date-only = text `YYYY-MM-DD` (AD). Moments = integer UTC ms. Booleans 0/1. Nothing a person recorded is hard-deleted; use `is_active`, `removed_at` or a status. **All tables are created in Phase 1**, so later phases add code, not structure, unless a change is needed.

**settings** (one row, id 1): `hospital_name, hospital_address, department_name, department_email, department_phone, daily_email_time ('08:00'), pms_reminder_days (3), email_cc (JSON), date_display (bs|ad, default bs), country_code ('+977'), email_team_on_report (1), pms_soon_days (7), coverage_warn_days (30), paused_warn_days (14), staff_reports (1), staff_report_assignee_id (null = first active Lead, then Admin), push_on_breakdown (1), push_on_fixed (1), whatsapp_buttons (1), logo_file_id (files row, owner_type hospital), updated_at`

**user, session, account, verification** — Better Auth (generate with its CLI). Extra `user` columns: `username, display_username, role (admin|lead|engineer|staff), phone, banned, ban_reason, ban_expires, must_change_password`. Plus **rate_limit** (`id, key, count, last_request`) for sign-in limits.

**departments**: `id, name, name_key (unique, lower-case), short_name, is_active, created_at`

**service_providers**: `id, name, name_key (unique), address, company_phone, company_email, notes, is_active, created_at`

**provider_contacts** (service department): `id, provider_id, kind (phone|email), value, label, is_active, created_at`

**service_engineers**: `id, provider_id, name, phone, email, notes, is_active, created_by, created_at, updated_at`

**equipment_models**: `id, type_name, manufacturer, model, category, model_key (unique: lower-case manufacturer|model, trimmed), pms_every (null = not set), pms_unit (days|months|years, default months), photo_file_id (current photo; files row with owner_type model, kind photo), created_at`

**equipment**: `id, qr_code (unique, random 10 chars), model_id, serial_number, serial_key (unique; upper-case, no spaces), hospital_tag, hospital_tag_key (unique when present), service_provider_id, home_department_id, current_department_id, installed_on, status (working|breakdown|out_of_service), photo_file_id, notes, label_outdated, created_by, created_at, updated_at`

**equipment_service_engineers** (designated): `equipment_id, service_engineer_id, added_by, added_at` — primary key on both ids

**coverage**: `id, equipment_id, type (warranty|amc|cmc), service_provider_id, starts_on, ends_on, pms_every (null = no PMS), pms_unit (days|months|years), pms_every_months (before 0002; copied into pms_every, no longer written), contract_no, notes, ended_early_on, end_processed_at, created_by, created_at`

**pms_visits**: `id, equipment_id, coverage_id (null when from earlier records), number, due_on, status (scheduled|done|skipped), reminder_sent_at, done_on, service_engineer_name, remarks, marked_by, from_earlier_records, created_at`

**breakdowns**: `id, number (unique int → BD-0001), equipment_id, department_id, reported_at, reported_by_name, problem, status (open|with_provider|fixed|not_repairable), recorded_by, assigned_to, provider_id, sent_to_provider_at, last_email_on (YYYY-MM-DD), last_email_at (ms; Send now once an hour), closed_at, closed_by, fixed_by (in_house|service_provider), service_engineer_name, work_done, parts_replaced, created_at`

**breakdown_recipients**: `id, breakdown_id, source (contact|service_engineer|extra), source_id, email, name, is_active, added_by, created_at`

**breakdown_pauses**: `id, breakdown_id, reason (spare_parts|quotation|engineer_working|other), note, paused_at, paused_by, resume_on, resumed_at, resumed_by (null = automatic)` — the current pause is the row with `resumed_at` null

**breakdown_notes**: `id, breakdown_id, note, created_by, created_at`

**moves**: `id, equipment_id, from_department_id, to_department_id, type (temporary|permanent), reason, moved_at, moved_by, expected_return_on, returned_at, returned_by`

**files**: `id, owner_type (model|equipment|coverage|pms_visit|breakdown|hospital; hospital = the logo, owner_id "1"), owner_id, kind (service_manual|operation_manual|other_manual|installation_report|service_report|contract|photo|other), title, note, storage_key, file_name, mime_type, size_bytes, status (pending|ready), uploaded_by, created_at, removed_at, removed_by, purged_at`

**email_log**: `id, kind (breakdown_request|breakdown_daily|breakdown_closed|breakdown_reported|pms_reminder|test), dedupe_key (unique), to_addresses, cc_addresses, subject, body_text, resend_id, status (sending|sent|failed), error, related_type, related_id, provider_id, created_by (null = automatic), created_at`

**activity_log**: `id, user_id, action, subject_type, subject_id, summary, created_at`

**staff_departments** (hospital staff only; replaced as a whole when Team saves the person; removed when the role changes from Hospital staff): `user_id, department_id, created_at`, primary key (user_id, department_id)

**push_subscriptions** (one row per browser with notifications on; machine data, deleted when the push service answers 404/410): `id, user_id, endpoint (unique), p256dh, auth, user_agent, created_at, last_sent_at`

Migrations: `0000_init`, `0001_date_display`, `0002_staff_push_pms_units` (settings columns, model and coverage PMS units, push_subscriptions; copies `pms_every_months` into `pms_every`), `0003_model_photo`, `0004_staff_departments`, `0005_hospital_logo`.

### Rules that live in services

- **Equipment status** changes in the same transaction as its cause: `breakdown` while any breakdown is `open` or `with_provider`; `working` when none remain; `out_of_service` only by Lead/Admin or a `not_repairable` close.
- **Current coverage**: today between `starts_on` and the earlier of `ends_on` / `ended_early_on`. Overlaps refused.
- **PMS schedule** (`shared/pms.ts`): first due = `starts_on` + N days, months or years; then every N while ≤ `ends_on`; counted from the start; numbered 1..k; at most 400. New coverage takes N and the unit from the model. Editing coverage regenerates only future `scheduled` visits; `done` never changes. Ending coverage sets remaining `scheduled` to `skipped`.
- **Last / next PMS** are queried, never stored. **Overdue** = `scheduled` and `due_on` < today.
- **Moves**: temporary changes `current_department_id`; return restores home; permanent changes both and sets `label_outdated`. Printing a label clears it.
- **Model photo**: upload like any file (`kind = photo`, images only, Lead/Admin); the browser shrinks it to at most 1280 px JPEG first (`web/src/lib/image.ts`). On ready, `equipment_models.photo_file_id` points to it and the previous photo row gets `removed_at` + `purged_at` and its R2 object is deleted at once. `<img>` loads `/api/files/:id/image`, a 302 to a 1-hour presigned GET (browser cache 50 min); hospital staff may load it.
- **Manuals** are `files` with `owner_type = model` and a manual kind (never the model photo); uploaded once on the model page and shown on every equipment of that model.
- **Manuals for an equipment** = files where `owner_type = model` and `owner_id = equipment.model_id`, not removed.
- **Breakdown recipients**: on "Ask for help", default = active service department emails of the provider + emails of the equipment's active designated service engineers. Saved in `breakdown_recipients`; edits change future emails only. Sending needs at least one active recipient.
- **Daily emails are due** for a breakdown when: status `with_provider`, no current pause, `last_email_on` < today (Nepal), local time ≥ `settings.daily_email_time`, and `sent_to_provider_at` is more than 12 hours ago. "Send now" sets `last_email_on` to today.
- **Service history** is assembled on request in `services/history.ts`. No history table.
- **Today** is the date in `Asia/Kathmandu`.
- **Hospital staff** (`role = staff`) pass `staffGate` (`lib/http.ts`) only for `/api/me`, `/api/me/password`, `/api/report*`, `/api/my-reports`, `/api/my-equipment`, `/api/push*` and `/api/files/:id/image`; everything else is 403.
- **Report a problem** (`services/report.ts`): by QR code; an unresolved breakdown of that equipment gets a note instead of a second breakdown; otherwise `recordBreakdown` with the responsible person from settings (else first active Lead, else Admin). Notifications in `services/notify.ts` (push to the team except the actor; team email `breakdown:{id}:reported` for staff reports; push to the recorder on close).
- **Correlated subqueries** in `sql` templates use `ref(column)` (`lib/sqlRef.ts`): Drizzle drops the table name in single-table selects, which made every department and model count 0.

## 5. API

REST + JSON under `/api`. Session required except `/api/auth/*`, `/api/jobs/*` and `/health`. Roles via `shared/permissions.ts`. Errors: `{ error: { code, message } }`, `message` ready to show.

| Area | Routes |
|---|---|
| Sign-in | `/api/auth/*` |
| Me | `GET /api/me` (user, hospital name, phone, date display, country code, WhatsApp and staff-report switches, push public key, redirect), `PATCH /api/me`, `POST /api/me/password` |
| Report (staff and team) | `GET /api/report/:qrCode`, `POST /api/report`, `GET /api/my-reports` (recorded by me or I added a report note), `GET /api/my-equipment` (staff: equipment whose current department is one of theirs) |
| Notifications | `GET /api/push` (public key, device count), `POST /api/push/subscriptions`, `POST /api/push/subscriptions/remove`, `POST /api/push/test` |
| Team | `GET/POST /api/team`, `PATCH /api/team/:id`, `POST /api/team/:id/reset-password` |
| Settings | `GET /api/settings`, `PATCH /api/settings` (any subset of fields: one tab at a time) |
| Departments | `GET/POST /api/departments`, `GET/PATCH /api/departments/:id` |
| Service providers | `GET/POST /api/service-providers` (POST needs a service department phone and email and `engineer: {name, phone, email}`), `GET/PATCH /api/service-providers/:id`, `POST /api/service-providers/:id/contacts`, `PATCH /api/provider-contacts/:id` |
| Service engineers | `POST /api/service-providers/:id/engineers`, `PATCH /api/service-engineers/:id` |
| Models | `GET/POST /api/models`, `GET /api/models/:id` (model, its manuals, its equipment), `PATCH /api/models/:id` |
| Equipment | `GET/POST /api/equipment`, `GET/PATCH /api/equipment/:id`, `GET /api/equipment/by-qr/:code`, `GET /api/equipment/labels?ids=`, `GET /api/equipment/:id/history`, `PUT /api/equipment/:id/service-engineers`, `POST /api/equipment/import/preview`, `POST /api/equipment/import`, `POST /api/equipment/labels-printed` |
| Moves | `POST /api/equipment/:id/moves`, `POST /api/moves/:id/return` |
| Files | `POST /api/files/upload` (returns presigned PUT + file id), `POST /api/files/:id/ready`, `GET /api/files/:id/link`, `GET /api/files/:id/image` (photos: redirect for `<img>`), `POST /api/files/:id/remove`, `GET /api/manuals?q=` |
| Coverage | `POST /api/equipment/:id/coverage`, `PATCH /api/coverage/:id`, `POST /api/coverage/:id/end` |
| PMS | `GET /api/pms`, `PATCH /api/pms/:id`, `POST /api/pms/:id/done`, `POST /api/pms/:id/remind` |
| Breakdowns | `GET/POST /api/breakdowns`, `GET /api/breakdowns/:id`, `POST /:id/notes`, `GET /:id/recipients/default`, `POST /:id/ask-provider`, `PUT /:id/recipients`, `POST /:id/send-now`, `POST /:id/pause`, `POST /:id/resume`, `POST /:id/close`, `PATCH /:id/assign` (all under `/api/breakdowns`) |
| Home | `GET /api/home` (attention lists + `stats` for the overview charts) |
| Reports | `GET /api/hospital-logo` (the logo bytes read from R2 by the server, for the PowerPoint; no CORS needed), `GET /api/reports?from=&to=` (team; `services/reports.ts` computes everything for the period; at most 3 years) |
| Export | `GET /api/export/:list.csv` |
| Jobs | `GET` or `POST /api/jobs/tick` with `Authorization: Bearer JOB_SECRET` (or `CRON_SECRET` from Vercel Cron) |

## 6. Sign-in

- Better Auth at `/api/auth`; username + password via `username` plugin; email stored for everyone.
- Public sign-up disabled. Admin/Lead create accounts server-side with Better Auth's internal adapter (Better Auth hashes the password). First Admin from `db/seed.ts`. New accounts see a notice until they change the temporary password.
- Roles on `user.role`; our middleware (`requireRole`, `can(action)`) decides access.
- Deactivate = `banned` + all sessions deleted; a session-create hook refuses banned people. Sign-in rate limited (5 a minute, stored in `rate_limit`).

## 7. Files (R2)

- Upload: web calls `POST /api/files/upload` with owner, kind, name, type, size → server checks role, type and size, creates `files` row (`pending`) and returns a presigned PUT URL (15 min). Browser PUTs straight to R2 with progress, then calls `POST /api/files/:id/ready`; the server confirms the object exists (HEAD) and sets `ready`.
- View/download: `GET /api/files/:id/link` returns a presigned GET (10 min) with the original file name.
- Limits: manuals 200 MB, everything else 20 MB; PDF, JPG, PNG, WEBP.
- Keys: `models/{modelId}/{fileId}-{safeName}`, `equipment/{equipmentId}/{fileId}-{safeName}`, etc.
- Bucket stays private. CORS on the bucket allows PUT and GET from `APP_URL` only, set by `npm run r2:cors`.
- Removed files: `removed_at` set; a tick deletes the object after 30 days. Pending files older than a day are cleaned up.

## 8. Email

- `emails/send.ts` is the only caller of Resend. It inserts `email_log` with a unique `dedupe_key` first; a clash means already sent, so nothing goes out.
- Dedupe keys: `breakdown:{id}:request`, `breakdown:{id}:day:{YYYY-MM-DD}`, `breakdown:{id}:closed`, `breakdown:{id}:reported` (team email, no CC), `pms:{dueOn}:{providerId}:{hash of visit ids}:reminder` (grouped), manual sends `…:manual:{hourStamp}`. A `failed` row may be retried under the same key.
- From `MAIL_FROM` (domain verified in Resend). Reply-To: settings department email. CC: `settings.email_cc`.
- **`EMAIL_REDIRECT_TO`**: when set, every email goes only to that address, and the body starts with "Test copy. Would have gone to: …". Used until go-live so real service providers are not emailed during building. Removed at go-live (Phase 4).
- Templates are plain functions returning `{ subject, text, html }`, wording from PRD section 6, dates in the calendar from `settings.date_display`.

## 9. Scheduler

`jobs/tick.ts` runs from Vercel Cron once a day at 02:15 UTC (08:00 Nepal time; Hobby may run it up to 59 minutes late), or hourly from node-cron on always-on hosts, and is callable at `/api/jobs/tick`. Daily emails and PMS reminders only go out at or after `daily_email_time`; if that setting changes, change the Vercel cron schedule too. Safe to run any number of times and on more than one instance (dedupe keys).

Each tick:
1. **Auto-resume** pauses whose `resume_on` ≤ today.
2. **Breakdown daily emails** that are due (rule in section 4); set `last_email_on`.
3. **PMS reminders**: `scheduled`, under current coverage, equipment not out of service, `reminder_sent_at` empty, `due_on` between today and today + `pms_reminder_days`; group by provider and due date; stamp `reminder_sent_at`.
4. **Coverage ended**: remaining `scheduled` → `skipped`.
5. **File cleanup** (once a day).

`ENABLE_SCHEDULER=false` on Vercel and on hosts that sleep.

## 10. Web app

- Routes: `/sign-in`, `/` (Home; Report a problem for hospital staff), `/my-reports`, `/my-equipment` (staff), `/models`, `/models/:id`, `/equipment`, `/equipment/new`, `/equipment/import`, `/equipment/:id`, `/equipment/:id/edit`, `/e/:qrCode`, `/scan`, `/breakdowns`, `/breakdowns/new`, `/breakdowns/:id`, `/breakdowns/:id/ask`, `/pms`, `/manuals`, `/departments`, `/departments/:id`, `/service-providers`, `/service-providers/:id`, `/team`, `/reports`, `/settings`, `/account`, `/more`, `/print/labels` (inside the app layout).
- Hospital setup: `/models`, `/departments`, `/service-providers`, `/team` share `SetupTabs`; the sidebar shows one "Hospital setup" item.
- Reports: `screens/Reports.tsx`, ranges in `lib/reportRange.ts`, highlights in `lib/reportInsights.ts`, PowerPoint in `lib/reportPptx.ts` (dynamic import); PDF = `window.print()` with the report print stylesheet.
- Install popup: `lib/install.ts` catches `beforeinstallprompt` at start (`main.tsx`), `components/InstallPrompt.tsx` shows it on phones after sign-in.
- Equipment rows carry `coverageType` and `coverageLastDay` (current coverage, SQL subqueries using Nepal today); `GET /api/equipment?coverage=` takes under|warranty|amc|cmc|ending|none. `POST /api/equipment` takes an optional `warranty` and inserts it with its PMS in the same transaction. `GET /api/pms?filter=` takes soon|upcoming|overdue|done (due = all from today, used by Home and the CSV).
- TanStack Query for server data; one query-key file; invalidate after changes.
- All words from `shared/terms.ts`.
- QR content: `{APP_URL}/e/{qr_code}`.
- Label printing: `/print/labels?ids=…&start=1`, A4 sheet, 2 × 4 cells of 105 × 74.25 mm, `@page { size: A4; margin: 0 }`. DESIGN.md section 8.
- Offline: service worker caches the shell and fonts; last query data is saved in localStorage (`lib/offlineCache.ts`) and restored on start; saving and file links disabled with a notice.
- Dates on screen: `lib/dates.tsx` (`DateText`, `MomentText`) in the calendar from `/api/me`.
- Hospital staff get `StaffLayout` (Report a problem, My reports, My account); team routes sit under `TeamOnly`, which sends staff back to `/`. `/e/:qrCode` shows the report form to staff and the equipment page to the team.
- Notifications: the service worker imports `/push-sw.js` (workbox `importScripts`); `lib/push.ts` subscribes with the VAPID public key. The service worker also runs under `npm run dev` (`devOptions`) so notifications can be tried on localhost.
- Phone numbers are stored as `+977 9812345678` (`PhoneField`; `shared/src/phone.ts`); old numbers without a code use the default country code.

## 11. Environment values

```
APP_URL=                 public https address (QR codes, emails, CORS)
PORT=3000                local only (Vercel sets it)
TZ=Asia/Kathmandu        local only (reserved on Vercel; code uses Asia/Kathmandu itself)
TURSO_DATABASE_URL=      libsql://…
TURSO_AUTH_TOKEN=
BETTER_AUTH_SECRET=      long random string
BETTER_AUTH_URL=         same as APP_URL
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
RESEND_API_KEY=
MAIL_FROM=               "ABC Hospital Biomedical <biomed@your-verified-domain>"
EMAIL_REDIRECT_TO=       owner's address until go-live; empty after
JOB_SECRET=              long random string
CRON_SECRET=             Vercel only: same value as JOB_SECRET (Vercel Cron sends it)
ENABLE_SCHEDULER=false   true only on always-on hosts
VAPID_PUBLIC_KEY=        Web Push keys: npx web-push generate-vapid-keys (optional; without them notifications stay off)
VAPID_PRIVATE_KEY=       keep forever: new keys switch notifications off on every device
VAPID_SUBJECT=           mailto:biomedical@your-hospital (not localhost)
SEED_ADMIN_NAME=  SEED_ADMIN_USERNAME=  SEED_ADMIN_EMAIL=  SEED_ADMIN_PHONE=  SEED_ADMIN_PASSWORD=
```

The server refuses to start if a required value is missing, naming which one. Values live in `.env.local` (or `.env`); `.env.example` is a local template and, like every `.env*` file, is not committed (owner, 2026-11-16).

## 12. Deploy

### Local
Node 22+, live services from `.env.local` (copy `.env.example`, fill in). `npm install`, `npm run services:check` (Turso, R2, Resend), `npm run db:migrate`, `npm run db:seed` (safe twice; `-- --reset-admin-password` after changing `SEED_ADMIN_PASSWORD`), `npm run dev` (API :3000, web http://localhost:5173), `npm run check` (types, lint, tests).

### Vercel (this install)
1. Import the GitHub repository in Vercel (Framework: Other). `vercel.json` runs `npm run vercel-build` = `db:migrate` (Turso) + web build + `server/src/scripts/vercel-output.ts`, which writes `.vercel/output`: `static/` (web/dist), `functions/api.func` (esbuild bundle of `server/src/vercel.ts`, Node 22, `@libsql/client/web`), `config.json` (routes `/api/*` and `/health` to the function, SPA fallback, daily cron).
2. Environment Variables (Production): every value in section 11, with `APP_URL` = `BETTER_AUTH_URL` = the Vercel address, `ENABLE_SCHEDULER=false`, `CRON_SECRET` = `JOB_SECRET`, and the same `VAPID_*` values as `.env.local` (never change them: new keys switch notifications off on every device; a new install generates its own with `npx web-push generate-vapid-keys`). Do not set `TZ` or `PORT` (reserved).
3. Deploy; `https://<address>/health` returns `{"ok":true}`; sign in as the seeded Admin.
4. Add the address to the R2 CORS policy (below).
5. Cron: `/api/jobs/tick` daily at 02:15 UTC = 08:00 Nepal time (Hobby may run up to 59 minutes late). If the daily email time changes, change the cron schedule, or call the route hourly from an outside cron with `Authorization: Bearer JOB_SECRET`.

### Other always-on hosts
`npm run build && npm start`: migrations run on start, `web/dist` is served, node-cron runs hourly when `ENABLE_SCHEDULER=true`. `GET /health` checks the database. HTTPS is required (camera scanning, PWA install, notifications).

### R2 CORS (browser uploads and photos)
An "Object Read & Write" token cannot change bucket settings; set it once in Cloudflare: R2 > bucket > Settings > CORS policy:

```json
[{ "AllowedOrigins": ["https://YOUR-APP-ADDRESS", "http://localhost:5173"],
   "AllowedMethods": ["PUT", "GET", "HEAD"], "AllowedHeaders": ["content-type"],
   "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3600 }]
```

With an Admin Read & Write token, `npm run r2:cors -- http://localhost:5173` does the same.

### Backups
Turso keeps point-in-time history (retention depends on the plan). R2 objects of removed files are deleted 30 days after removal; a replaced model photo is deleted at once.

### New hospital
New Turso database, new R2 bucket (+ CORS), new Vercel project with its own environment values (new VAPID keys), deploy, `npm run db:seed` with that hospital's first Admin, then hospital details in Settings. No code change.

## 13. Tests

- `shared`: PMS schedule (days, months, years), permissions (incl. hospital staff), dates, serial key, model key, phone and WhatsApp links.
- `server/src/test/staff.test.ts`: list counts, provider required contacts, staff gate, report flow (note on an open breakdown, My reports, notify on fix), staff departments, push and team email, new equipment warranty and coverage filters, hospital logo rules, reports, settings by tab.
- `server` (in-memory libSQL): status changes, coverage overlap, recipients default, daily email due rule (pause, resume date, 12-hour gap, once per day), PMS reminder selection and grouping, role refusals, file type and size limits.
- `web`: label sheet positions.
