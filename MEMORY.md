# BMServ — Memory

The map of this project. Read first, update last, every session (prod-docs/RULES.md section 2). Under about 200 lines.

Last updated: 2026-11-16 (Phases 1–5 built locally; not deployed, not committed)

## 1. In one paragraph

Installable web app for a hospital Biomedical Department: equipment register by department, manuals library per model on R2, QR labels, recorded moves, breakdowns emailed to the service provider once a day at 08:00 Nepal time until fixed (pausable), coverage (warranty/AMC/CMC), PMS reminders. One install per hospital; this one is ABC Hospital. Hono + Turso + R2 + Resend + Better Auth; React + Vite PWA; hosted on Vercel. Built by Infobytes Nepal.

## 2. Current state

- Phases 1–5 are **built and pass `npm run check`** (types, lint, 102 tests). Go-live steps of Phase 4 are not done.
- Phase 5 (owner feedback): hospital staff departments and their Equipment list, Models screen + PMS frequency on the model (days/months/years), Hospital staff role and Report a problem from the QR, Web Push notifications, WhatsApp buttons, phone country codes, required provider contacts, Home overview charts, Settings tabs, My account redesign, full-width desktop, count bug fix.
- Live services: Turso migrated (0000_init, 0001_date_display, 0002_staff_push_pms_units, 0003_model_photo, 0004_staff_departments, 0005_hospital_logo) and seeded (ABC Hospital settings + Admin `admin`); R2 put/get/delete works; Resend test email works via `onboarding@resend.dev`.
- Checked: the Vercel bundle (`.vercel/output`) run locally against live Turso; signed in as the live Admin; every screen opens without errors.
- **Not yet**: Vercel deploy (project set up with preset Other and environment values; needs the code on GitHub), Resend domain, git commit (owner asked not to commit yet). Staff report flow and notifications are tested by the server tests and typecheck, not yet tried in a browser as Hospital staff.
- VAPID keys were generated into `.env.local` (2026-11-13). `.env.example` is now gitignored at the owner's request (local template only).
- R2 CORS allows localhost and the hosted domain; on Vercel, `APP_URL` and `BETTER_AUTH_URL` are set to the hosted domain (owner, 2026-11-16). `.env.local` keeps both on http://localhost:5173.
- Live address: none yet. Local: `npm run dev` → http://localhost:5173.
- **Owner requests, 2026-11-16 (do not drop any; tick when built and tested):**
  - [x] Staff departments + staff Equipment tab; My reports fix; Print labels inside the app; file rows with real buttons
  - [x] Install popup on phones after sign-in (iPhone steps); checkbox/radio alignment in forms
  - [x] Model search on Add equipment lists nothing until 2 letters are typed, then up to 8 matches
  - [x] PMS: Due soon / Upcoming (12 months, by month) / Overdue / Done
  - [x] Add equipment: warranty 1 year from installation by default (changeable or removable), saved with the equipment
  - [x] Coverage views: equipment rows show coverage and last day; filters Under warranty / AMC / CMC / ending soon / not covered; Home coverage chart links to them
  - [x] Hospital setup menu item with tabs: Models, Departments, Service providers, Team
  - [x] **Reports** menu item above Settings: date range presets + other dates, report page, highlights, **PDF (print) and PowerPoint export with the logo**
  - [x] Settings > Hospital: upload the hospital logo (R2; on the report cover, PDF and every PowerPoint slide)
- Next step: owner creates the Vercel project (push to GitHub first) → deploy (ARCHITECTURE section 12) → try as Admin, Lead, Engineer → tick the "Deployed" boxes in PHASES.md → commit.

## 3. Where to look

| Need | Open |
|---|---|
| Feature behaviour, permissions, email wording, problem statement | prod-docs/PRD.md |
| Tables, routes, folders, env values, service rules, deploy | prod-docs/ARCHITECTURE.md |
| Colours, type, components, wording, QR label, logos | prod-docs/DESIGN.md |
| Build order and progress | prod-docs/PHASES.md |
| How to work, when to update docs | prod-docs/RULES.md |
| Run locally, deploy, R2 CORS, new hospital | prod-docs/ARCHITECTURE.md section 12 (README only says what BMServ is) |

## 4. File map

```
/                    CLAUDE.md MEMORY.md README.md .env.example vercel.json package.json (workspaces)
prod-docs/           PRD, ARCHITECTURE, DESIGN, PHASES, RULES
assets/logos/        the three original logo PNGs;  assets/images/  the two sign-in photos (originals)
demo_to_use_imgs/    demo screenshots (logo splash, sign-in, Home) — not used by the app
shared/src/          terms.ts (all words) enums.ts permissions.ts dates.ts (BS/AD, Nepal today, month buckets) pms.ts (days/months/years) phone.ts (country codes, wa.me) keys.ts csv.ts schemas/ (Zod; report.ts) shared.test.ts
server/src/          app.ts (Hono app, routes, errors, /health, /api/jobs/tick) index.ts (Node entry) vercel.ts (Vercel entry) env.ts auth.ts
server/src/db/       schema/{auth,app}.ts client.ts migrate.ts seed.ts migrations/
server/src/routes/   report.ts (report, my-reports, push) core.ts (me, team, settings, departments, providers, models) register.ts (equipment, moves, files, coverage, PMS, import, export, home) breakdowns.ts
server/src/services/ one file per subject: team settings departments providers models equipment equipmentRows moves files coverage pms breakdowns history home (+ dashboard stats) reports importer exportCsv activity push (only web-push caller) notify (who hears about a breakdown) report (staff reports)
server/src/lib/      http.ts (session, roles, staffGate) sqlRef.ts (ref(): table-qualified column for subqueries) errors ids r2
server/src/emails/   send.ts (only Resend caller: log + dedupe + redirect) templates.ts (PRD 6 wording) recipients.ts
server/src/jobs/     tick.ts (the scheduled work) scheduler.ts (node-cron, non-Vercel hosts)
server/src/scripts/  check-services.ts r2-cors.ts migrate.ts vercel-output.ts (Build Output API)
server/src/test/     setup.ts (in-memory libSQL, fake email + push transports, signed-in roles incl. staff) auth.test.ts rules.test.ts staff.test.ts
web/src/app/         App.tsx (routes; TeamOnly group) Layout.tsx (top bar, bottom bar, sidebar, guard, StaffLayout, TeamOnly/TeamOr, PWA prompts)
web/src/screens/     SignIn Home (overview + attention) Reports Account Team Settings (tabs, logo) More Models (list + ModelPage) Departments Providers Manuals Pms Scan Report (staff) PrintLabels equipment/ breakdowns/
web/src/components/  SetupTabs InstallPrompt files.tsx (FileRows, FileActions, FileIcon, UploadSheet) ui.tsx (Pill Row(thumb, className) Fact fields PhoneField Switch WhatsAppButton Sheet Confirm Toast) charts.tsx ModelPhoto (thumb, picker) ModelFields PmsFrequencyField DateField EquipmentLine pmsSheets EmailRows
web/src/lib/         api.ts types.ts queryKeys.ts hooks.ts dates.tsx upload.ts offlineCache.ts auth.ts push.ts (browser push) image.ts (shrink photos) install.ts reportRange.ts reportInsights.ts reportPptx.ts
web/src/print/       labelSheet.ts (+test) label.css
web/src/styles/      tokens.css base.css screens.css
web/public/          brand/ (cropped logos, PWA icons, sign-in photos) favicon.ico push-sw.js (push handlers, imported by the service worker)
```

## 5. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | One install per hospital; hospital details in `settings` (ABC Hospital) | Owner's choice |
| D2 | Live Turso, R2, Resend from Phase 1; tests use in-memory libSQL only | Owner: no local database |
| D3 | `EMAIL_REDIRECT_TO` sends every email to the owner until go-live | Real service providers are not emailed while building |
| D4 | Host **Vercel**: Build Output API (static web + one Node function); migrations run in the build; no Docker; daily Vercel Cron 02:15 UTC (08:00 NPT) calls `/api/jobs/tick`; node-cron only on always-on hosts | Owner chose Vercel; Hobby crons are daily only |
| D5 | Better Auth with `username` plugin, sign-up off; **admin plugin not used**: accounts made via the internal adapter, deactivation = `banned` + sessions deleted + a session-create hook | Our roles (lead) don't fit the plugin; plain refusal message |
| D6 | Dates stored AD; **shown in one calendar chosen in Settings (Nepali BS default, or English AD)** on screens, pickers and emails | Owner, 2026-11-13 |
| D7 | Manuals belong to the model | PRD problem 2 |
| D8 | Files go browser → R2 with presigned PUT; manuals 200 MB, others 20 MB | Large manuals |
| D9 | Breakdown emails to service department emails + designated service engineers, editable; **once a day at 08:00** (setting) until fixed or paused | Owner, 2026-11-13 |
| D10 | Any team member pauses/resumes; "Send now" also works while paused | Manual action, logged |
| D11 | PMS every N months from coverage start; reminders grouped per provider per due date and sent at the daily email time | Fewer, morning emails |
| D12 | QR label A7 105 × 74.25 mm, 8 per A4, start position; QR `{APP_URL}/e/{code}` | 12.5 % of A4 |
| D13 | Navy `#19445B`, teal `#2DD4BF`; teal never text on white | Contrast |
| D14 | Coverage types Warranty, AMC, CMC | Common in Nepal |
| D15 | All tables in the Phase 1 migration; later changes are new migrations | Live data |
| D16 | Extra columns beyond the spec: `name_key` (departments, providers), `hospital_tag_key`, `coverage.end_processed_at`, `breakdowns.last_email_at`, `files.purged_at`, `email_log.provider_id` + status `sending`, `user.must_change_password`, `settings.date_display`; table `rate_limit` | Uniqueness, once-an-hour rule, provider email list, DB-backed sign-in rate limit on serverless |
| D17 | A failed email may be retried under the same dedupe key (claimed atomically) | Daily email still goes after a Resend hiccup |
| D18 | Several unresolved breakdowns per equipment are allowed; the form warns and links the existing one | PRD says "last unresolved breakdown" |
| D19 | Editing coverage replaces future scheduled PMS; a changed PMS date gets a new reminder | Generated rows, not records |
| D20 | React Router 7 (v8 needs Node ≥ 22.22; machine has 22.18). TypeScript 6.0 (typescript-eslint supports < 6.1) | Toolchain compatibility |
| D21 | BS picker = day, month, BS year selects; AD mode = native date input; BS range 2000–2090 (`nepali-date-converter`) | Plainest working picker |
| D22 | Icons `lucide-react` (1.5 px stroke, 20 px); QR scanning with `jsqr` + camera | One outline set; small reader |
| D23 | Offline: service worker caches the shell; last query data kept in localStorage (`offlineCache.ts`); saving disabled | PRD F15 without extra deps |
| D24 | Sign-in: photo (left half on desktop, top band on phone/tablet) + the diagonal behind the form | Owner supplied photos |
| D25 | Seeded Admin `admin` ("BMServ Admin", placeholder phone); password only in `.env.local` | Owner asked Claude to fill seed values |
| D26 | Hospital staff are accounts with role `staff` (email and phone required like everyone); server `staffGate` allows only me, report, my-reports, push | Owner: staff report via phone; PRD said no reporting without an account |
| D27 | A staff report on equipment with an unresolved breakdown becomes a note on it, not a second breakdown | Avoid duplicates from several nurses |
| D28 | Staff report responsible = Settings choice, else first active Lead, else Admin | Breakdown needs `assigned_to` |
| D29 | Notifications: push to the team on every new breakdown (not the actor); push to the recorder on close; team email only for staff reports (internal, no CC) | Owner: everyone notified; avoid email noise |
| D30 | web-push 3.6.7 (4.0.0 was a week old and moved to ESM); service worker runs under `npm run dev` (devOptions) | Stability; local testing |
| D31 | PMS frequency on the model (required for new models, months default); coverage copies it and may change it; `coverage.pms_every_months` kept but no longer written | Owner; no data loss |
| D32 | Phones stored "+977 9812345678"; default country code is a setting; wa.me links only | Owner: Nepal default, India sometimes |
| D33 | Home charts in plain HTML/CSS (no chart library); coverage palette validated with the dataviz validator | Rule: no library under ~30 lines |
| D34 | Model photo: files row (owner model, kind photo) + `equipment_models.photo_file_id`; replaced photo marked removed+purged and deleted from R2 at once; shrunk to 1280 px JPEG in the browser; `<img>` via `/api/files/:id/image` redirect | Owner, 2026-11-16; fast thumbnails |
| D35 | Offline cache key includes the build (`__APP_BUILD__`); older caches are dropped on start | Old Home data without `stats` crashed Home |
| D36 | README only describes BMServ; setup and deploy live in ARCHITECTURE section 12; `.env.example` is gitignored | Owner, 2026-11-16 |
| D38 | Hospital staff departments: table `staff_departments`; staff see equipment whose **current** department is one of theirs (where it is now); a row opens `/e/:qrCode` (Report a problem). Only staff keep departments; a person cannot change their own | Owner, 2026-11-16 |
| D39 | My reports = breakdowns I recorded **or** added a report note to (a staff report on an already-open breakdown becomes a note); the fixed push goes to the recorder and every staff member who added a note | Owner: My reports looked empty |
| D40 | Print labels is a route inside the Layout (`/print/labels`, TeamOnly); print CSS strips the app frame with `body:has(.label-screen)` | Owner: the all-white page felt disconnected |
| D41 | Reports: `GET /api/reports` computes everything server-side; PDF = browser print (A4 print stylesheet, no PDF library); PowerPoint = `pptxgenjs` 4.0.1 in the browser, dynamic import; the logo comes from `GET /api/hospital-logo` (server reads R2) as a data URL for the .pptx. BS mode uses Nepali months, fiscal quarters and the fiscal year (Shrawan–Asar) | Owner, 2026-11-16; no extra server load, charts stay editable |
| D42 | Hospital logo: files row owner_type `hospital`, owner_id "1", kind photo; `settings.logo_file_id`; Admin only; kept as PNG (transparency) at most 800 px; replaced logo deleted from R2 at once | Owner, 2026-11-16 |
| D43 | New equipment: optional `warranty` in POST /equipment, default 1 year from installation (ends start + 12 months − 1 day), provider = equipment's provider, PMS from the model; same transaction (`insertCoverage`) | Owner, 2026-11-16 |
| D44 | PMS "due" filter kept as "all from today" (Home, CSV); the screen uses soon (Settings window) and upcoming (to 12 months) | No change to Home or export |
| D45 | "Hospital setup" groups Models, Departments, Service providers, Team; routes unchanged, tabs are links (`SetupTabs`) | Owner, 2026-11-16 |
| D46 | Install popup: event caught at app start (`lib/install.ts`); phones/tablets only (coarse pointer, < 960 px); "Not now" snoozes 7 days | The event often fired on sign-in, before the layout existed |
| D37 | Manuals are managed only on the model page (`/models/:id`); the equipment page lists them read-only with "Open model". Manual lists filter manual kinds (a model also owns its photo) | Owner: one manual per model, many units |

## 6. Open questions for the owner

- Nepali mode shows only BS dates (no AD beside). Keep it, or show AD muted beside BS as DESIGN first said?
- Hospital staff need an email address to get an account (Better Auth). OK, or should staff accounts work without email?
- Replies from service providers: possible with Resend inbound after the domain is verified (would show on the breakdown page). Build it then?
- Resend sending domain and From address (domain must be verified in Resend).
- Vercel project address; then R2 CORS for that address.
- Real hospital details at go-live; is CMC wanted (D14)?

## 7. Installed versions

Node 22.18 (local) · hono 4.13.18 · @hono/node-server 2.1.8 · better-auth 1.7.22 · drizzle-orm 0.45.4 · drizzle-kit 0.31.11 · @libsql/client 0.18.0 · @aws-sdk/client-s3 + s3-request-presigner 3.1168.0 · resend 6.38.0 · node-cron 4.6.0 · zod 4.6.7 · nanoid 6.0.2 (server) · react 19.3.1 · web-push 3.6.7 (server) · react-router 7.18.5 · pptxgenjs 4.0.1 (web) · @tanstack/react-query 5.107.1 · vite 8.3.8 · @vitejs/plugin-react 6.3.0 · vite-plugin-pwa 2.0.0 · typescript 6.0.3 · vitest 5.1.0 · eslint 10.14.0 · nepali-date-converter 3.4.2 · qrcode 1.5.4 · jsqr 1.4.0 · lucide-react 1.72.0 · esbuild 0.28.2 · tsx 4.23.15

## 8. Gotchas

- `window.scrollTo` returns a promise in current Chrome: never write `useEffect(() => window.scrollTo(...))`; use braces (it crashed Layout).
- R2 "Object Read & Write" tokens cannot set bucket CORS (`AccessDenied`); set CORS in the dashboard.
- Resend without a verified domain: From must be `onboarding@resend.dev`; it only delivers to the account's own address.
- Better Auth 1.7 `internalAdapter.createUser(user, { method: "admin" })` needs the second "source" argument.
- Vercel reserves `TZ`; dates use `Asia/Kathmandu` explicitly in `shared/dates.ts`.
- Sign-in is rate limited to 5 a minute per IP (DB-backed); repeated scripted sign-ins get 429.
- The Vercel bundle aliases `@libsql/client` → `@libsql/client/web` (remote only, no native binary).
- The original logo PNGs have wide empty margins; the app uses cropped copies in `web/public/brand/`.
- Sign-in only trusts `APP_URL`. A second `npm run dev` used to start Vite on :5174 and sign-in failed with 403 (shown wrongly as "deactivated"); Vite now uses `strictPort`, and the sign-in screen only says "deactivated" when the server says so.
- Changing `SEED_ADMIN_PASSWORD` in `.env.local` does not change the stored password; run `npm run db:seed -- --reset-admin-password`.
- nanoid 6 lives in `server/node_modules` (root has nanoid 3 for another package).
- `tsx watch` started by `concurrently` (npm run dev) never runs the server on Windows; the server dev script uses `node --watch --import tsx src/index.ts` instead.
- Drizzle writes `${table.col}` without the table name in single-table selects, so a correlated subquery `(select count(*) from equipment e where e.x = ${departments.id})` compared `e.x` with `e.id` (counts were always 0). Use `ref(col)` from `server/src/lib/sqlRef.ts`.
- Long bash heredocs with JS template strings sometimes fail to parse in this shell; write the script to a file instead.
- The offline cache (`lib/offlineCache.ts`) restores old API shapes before the fresh fetch; new fields can be undefined on first render after an update (now the key changes per build).
- Git Bash rewrites arguments like `/team` into Windows paths; use `MSYS_NO_PATHCONV=1`.
- A browser `fetch` of an R2 file fails: `/api/files/:id/image` redirects cross-origin (Origin becomes "null") and the bucket CORS may not allow GET. `<img>` works (no CORS); for bytes in the browser (PowerPoint logo) read through the server (`/api/hospital-logo`).
- `Date.UTC` reads years 0–99 as 1900–1999. A native date box holds "0002-08-01" while the year is typed; the old `parseAd` rejected it and `addMonths` threw (Add equipment crashed, 2026-11-16). `shared/dates.ts` now uses `utcDate()` (setUTCFullYear) and pads years; `DateField` (AD) passes a value only when `isPlausibleDate` (1900–2200).
- Long bash heredocs (JS with quotes or template strings) fail to parse or get refused by the permission checker; write scripts with the Write tool and run them with node.

## 9. Change log

Newest first: date, what changed, docs touched.

- 2026-11-16 — Reports (period, highlights, PDF and PowerPoint with logo), hospital logo (migration 0005), Hospital setup menu, 1-year default warranty on new equipment, coverage on rows and filters, PMS Due soon/Upcoming, install popup, model search, form alignment. Docs: PRD, ARCHITECTURE, DESIGN, PHASES, MEMORY.
- 2026-11-16 — Hospital staff departments + staff Equipment tab (migration 0004), My reports includes reports added to an open breakdown, Print labels redesigned inside the app, file rows with real buttons and type icons, section actions as outlined buttons, button hover states. Docs: PRD, ARCHITECTURE, DESIGN, PHASES, MEMORY.
- 2026-11-16 — Model page (photo, PMS, manuals once per model, its equipment); manuals no longer uploaded from equipment pages; manual lists exclude the model photo. Docs: PRD, ARCHITECTURE, DESIGN, PHASES, MEMORY.
- 2026-11-16 — Model photos (R2, shown beside names), Home crash from old offline data fixed, error screen, README trimmed, `.env.example` gitignored; migration 0003. Docs: PRD, ARCHITECTURE, DESIGN, PHASES, MEMORY.
- 2026-11-13 — Phase 5: Models screen, PMS frequency on models, hospital staff reports, Web Push, WhatsApp, country codes, Home overview, Settings tabs, Account redesign, full width, count fix; migration 0002. Docs: all.
- 2026-11-13 — Phases 1–4 built: register, manuals/files, QR labels, moves, import/export, breakdowns + daily emails, coverage/PMS, Home, history, PWA; date display setting; sign-in photos; Vercel output. Docs: all.
- 2026-11-13 — Host set to Vercel; spec files moved to `prod-docs/`; logos to `assets/logos/`.
- 2026-11-13 — Specs written; four phases; no code yet.
