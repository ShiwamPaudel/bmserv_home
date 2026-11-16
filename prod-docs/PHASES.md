# BMServ — Phases

Four phases. Each ends deployed and working on the live address. Phase 4 ends ready for the hospital to use.

**A phase is finished when:** every box is ticked; `npm run check` (types, lint, tests) passes; the live deploy works as Admin, Lead and Engineer; docs are updated as RULES.md section 2 says; work is committed.

Key: `[ ]` to do, `[~]` in progress, `[x]` done.

## Phase 1 — Foundations, live services, sign-in, first deploy
Owner provides: `.env` values (Turso, R2, Resend, secrets, first Admin) and the host.
- [x] Workspaces `shared`, `server`, `web`; TypeScript strict; lint, format; scripts `dev`, `build`, `check`, `db:migrate`, `db:seed`, `services:check`, `r2:cors`
- [x] `.env.example`; server refuses to start with missing values
- [x] `services:check` passes: Turso query, R2 put/get/delete of a test file, Resend test email to the owner
- [~] `r2:cors` sets bucket CORS for `APP_URL` (script works only with an Admin token; owner sets CORS in the dashboard, see ARCHITECTURE section 12)
- [x] Drizzle schema for **all** tables in ARCHITECTURE.md section 4; migrations applied to Turso
- [x] Better Auth: username sign-in, sign-up off, sessions, rate limit
- [x] Seed: ABC Hospital settings + first Admin
- [x] `shared`: terms, dates (BS/AD), permissions (every row of PRD section 3) with tests
- [x] Web: tokens, bundled fonts, logos copied to `web/public/brand/`, layout (top bar, bottom bar, sidebar), routes stubbed
- [x] Screens: Sign-in (with diagonal), My account (change password), Team (add with phone, edit role, reset password, deactivate), Settings
- [~] Vercel Build Output (no Docker), `/health`, migrations in the build; deploy steps in ARCHITECTURE section 12. Deploy to Vercel pending (owner)
- [x] Docs updated (versions, host, file map)

## Phase 2 — Equipment register, manuals, QR labels, moves
- [x] Departments: list, add, edit, inactive; page with "Here now" and "Belongs here but elsewhere"
- [x] Service providers: company details (optional company phone and email), service department contacts (many phones, many emails), service engineers (add, update, deactivate), provider page
- [x] Models: add inline, edit (Lead/Admin)
- [x] Equipment: add, edit, list, search, filters, page; serial-number uniqueness with link; designated service engineers; "Last PMS done on" for equipment already in use
- [x] Files on R2: presigned upload with progress, ready check, open/download links, remove (Lead/Admin), limits
- [x] Manuals per model on the equipment page; Manuals screen with search; equipment documents and photo
- [x] QR code per equipment; `/e/:qrCode`; Scan button with camera
- [x] Label printing: A4 preview, start position, 105 × 74 mm cells, single and many; "Label needs reprinting"
- [x] Moves: temporary, return, expected return; permanent (Lead/Admin); quick move from scanned page
- [x] CSV import of equipment with template and row-by-row preview
- [~] Deployed; docs updated

## Phase 3 — Breakdowns, daily emails, coverage, PMS
- [x] Email sending: `send.ts`, log, dedupe, `EMAIL_REDIRECT_TO`, templates from PRD section 6
- [x] Breakdowns: record (equipment page, scan, list), BD numbers, notes, responsible engineer, Mine filter, downtime
- [x] Ask service provider for help: default recipients, edit, preview, send; recipients editable afterwards
- [x] Daily emails at the set time; Send now (once an hour); pause with reason and resume date; resume; auto-resume
- [x] Mark as fixed (by us / by service provider with closed email); cannot be repaired (Lead/Admin); equipment status updates
- [x] Coverage: add, edit, end early, no overlap
- [x] PMS: schedule from coverage, "PMS 2 of 4", change date, mark as done with report, overdue, not done on coverage end, send reminder again
- [x] Scheduler: tick in process (hourly, non-Vercel) + `/api/jobs/tick` (Vercel Cron daily 08:00 NPT); PMS reminders grouped per provider
- [x] Tests for daily email rule, pause/resume, PMS schedule and reminders, status changes
- [~] Deployed; real emails checked through `EMAIL_REDIRECT_TO`; docs updated

## Phase 4 — Home, history, installable app, go-live
- [x] Home in PRD order
- [x] Service history on equipment page, printable
- [~] Emails sent shown on breakdown, PMS and service provider pages (breakdown and provider pages list every email; PMS rows show when the reminder went)
- [x] CSV export: equipment, breakdowns, PMS
- [x] PWA: manifest, icons from the navy circle logo, install prompt, offline read-only with notice
- [~] Security review of every route (session, role, validation); file limits; secrets check (built in and tested; a final review pass at go-live)
- [~] Every screen checked at 360 px and desktop; access checks from DESIGN.md section 12 (sign-in and Home checked at phone, tablet, desktop; all screens opened at desktop; full pass at deploy)
- [ ] Go-live: `EMAIL_REDIRECT_TO` emptied, test data removed, real hospital settings entered, backup note (ARCHITECTURE section 12), handover notes for adding a new hospital
- [~] Deployed; docs updated

## Changes after Phase 4
- [x] Date display setting: Nepali (BS) or English (AD) for the whole system (Settings)
- [x] Breakdown daily emails once a day at 08:00 Nepal time (default daily email time)
- [x] Sign-in screen with the owner's photos; favicon.ico
- [ ] Deployed; docs updated

## Phase 5 — Staff reports, notifications, WhatsApp, Models, dashboard, settings tabs
Why: owner feedback after first local testing (2026-11-13)
- [x] Department, model and service provider counts fixed (always showed 0)
- [x] Desktop pages use the full width
- [x] Models screen (own menu item); PMS frequency on the model (days, months or years; months default); coverage takes it from the model
- [x] Service provider needs service department phone and email and a first service engineer (name, phone, email); engineer email required
- [x] Phone numbers with country code (default from Settings, +977)
- [x] WhatsApp buttons (wa.me) on breakdown and service provider pages, and after a staff report
- [x] Hospital staff role: report a problem from the QR label, My reports; team email and push on staff reports
- [x] Web Push notifications (VAPID): turn on per device under My account; new breakdown to the team, fixed to the reporter
- [x] Home overview: number tiles and charts above the attention lists
- [x] Settings as tabs; more settings (country code, Home alert windows, staff reports, notification and WhatsApp switches)
- [x] My account redesigned (profile band, cards, notifications)
- [x] Migration 0002 applied to live Turso
- [x] Model photo on R2 (shrunk in the browser; replaced photo deleted from R2), shown beside names everywhere (migration 0003)
- [x] Old offline data no longer crashes Home after an update; plain error screen instead of the developer page
- [x] README only says what BMServ is; `.env.example` not committed (owner)
- [x] Model page: manuals uploaded once per model and shown on every equipment of that model; equipment page shows them read-only
- [x] Hospital staff departments (several per person): staff see the equipment in their departments and report from the list (migration 0004, applied to live Turso)
- [x] My reports also shows reports added to an existing breakdown; those reporters are told when it is fixed
- [x] Print labels screen inside the app layout (panel + A4 preview); printed sheet unchanged
- [x] Install popup on phones; form choice alignment; model search lists nothing until typed
- [x] PMS tabs Due soon / Upcoming / Overdue / Done
- [x] New equipment gets a 1-year warranty by default (changeable); coverage on equipment rows and coverage filters
- [x] Hospital setup menu (Models, Departments, Service providers, Team as tabs)
- [x] Reports with date range, highlights, PDF and PowerPoint export (logo included)
- [x] Hospital logo in Settings (migration 0005, applied to live Turso)
- [x] File rows: type icon and real Open / Download / Remove buttons (Manuals, model and equipment pages); section actions as outlined buttons; button hover states
- [ ] Tried as Admin, Lead, Engineer and Hospital staff on a phone (notifications, WhatsApp, report from a printed label)
- [ ] VAPID keys added to Vercel; deployed; docs updated

## Later
New features get a new phase here, in this shape:

```
## Phase N — Name
Why: one line
- [ ] step
- [ ] Deployed; docs updated
```
