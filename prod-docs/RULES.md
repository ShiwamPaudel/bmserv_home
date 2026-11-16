# BMServ — Rules for Claude Code

Read this and MEMORY.md at the start of every session. Spec files are in `prod-docs/`; `MEMORY.md` and `CLAUDE.md` are in the project root.

## 1. Work without wasting tokens

1. Start from `MEMORY.md`: what exists, where, what is next.
2. Open a file only when the task needs it, using the file map in MEMORY.md. Do not list or scan the whole project to get familiar.
3. Read other specs by need, and only the relevant section:
   - feature behaviour, permissions, email wording → PRD.md
   - tables, routes, folders, env values, service rules → ARCHITECTURE.md
   - anything on screen → DESIGN.md
   - what to build next → PHASES.md
4. One phase or one change at a time. Do not start the next phase until told.
5. Unclear and it changes what gets built: ask. Small detail: decide and record under Decisions in MEMORY.md.

## 2. Keep the docs true (after every phase or change)

| If this changed | Update |
|---|---|
| Anything built or changed | MEMORY.md: Current state, File map, Change log |
| A choice a future session must know | MEMORY.md: Decisions (Gotchas if it cost time) |
| A phase step finished | PHASES.md: tick it |
| Feature behaviour, permissions, email wording | PRD.md |
| Table, column, route, env value, folder, library, deploy step | ARCHITECTURE.md |
| Colour, component, screen layout, wording rule | DESIGN.md |
| A working rule | RULES.md |

- Edit in place; replace what is no longer true. No "update:" notes.
- MEMORY.md stays under about 200 lines. Past 15 change-log entries, fold the oldest into one line.
- File map: folders and key files, one line each. A map, not an inventory.
- New feature later: add it to PRD.md, add a phase to PHASES.md, then build.

## 3. Product rules

- One install, one hospital. Never add a hospital column or switcher.
- Every on-screen word comes from `shared/src/terms.ts`, following PRD.md section 4 and DESIGN.md section 9.
- PMS exists only under current coverage.
- Every email goes through `server/src/emails/send.ts` with its dedupe key. Daily breakdown emails stop on fix, close or pause.
- While `EMAIL_REDIRECT_TO` is set, never bypass it. Only the owner empties it, at go-live.
- Nothing a person recorded is deleted: deactivate, close, end or mark removed.
- No features, screens, settings or libraries beyond the docs. Suggest them instead.

## 4. Live services

- The app uses Turso, R2 and Resend from Phase 1. No local database file, no local file storage, no fake mail.
- Automated tests use in-memory libSQL (`:memory:`) and never connect to the live database, bucket or Resend.
- Never run destructive commands against the live database (drop, delete all, reset). Schema changes only through new migrations. If a migration would lose data, stop and ask.
- Seed scripts must be safe to run twice.

## 5. Code rules

- TypeScript strict. No `any`; no `@ts-ignore` without a reason in a comment.
- Routes are thin: session, role, Zod validation, call a service. Rules live in `server/src/services` or `shared`.
- Multi-table changes in one transaction.
- Dates stored AD `YYYY-MM-DD`; moments UTC ms; "today" is Asia/Kathmandu; BS only for display and input via `shared/src/dates.ts`.
- Never edit an applied migration.
- Web: TanStack Query for server data; colours and sizes only from `tokens.css`.
- Small single-purpose files named with PRD words (`breakdown`, `coverage`, `serviceProvider`, `serviceEngineer`, `manual`).
- Check current library docs before using an API you are unsure of; note surprises in MEMORY.md Gotchas.
- Add a dependency only when it clearly beats ~30 lines of code; record it in ARCHITECTURE.md.

## 6. Safety

- Every `/api` route needs a session, except sign-in, `/health` and the job route (`JOB_SECRET`).
- Role check on the server for every write via `shared/src/permissions.ts`. Hiding a button is not a check.
- Validate every input on the server. Check file type and size before issuing an upload link.
- Secrets only in environment values. Never in code, docs, logs, commits or chat replies. Do not print `.env`.
- No passwords, tokens or full email bodies in production logs.

## 7. Screens

- Follow DESIGN.md. If a screen needs something undefined, pick the plainest option and add it to DESIGN.md.
- Phone first; check at 360 px and desktop.
- Every list has an empty state; every form shows errors at the field; every save confirms.

## 8. Testing and deploy

- Tests for rules: PMS schedule, reminders, daily email due rule, pause/resume, status changes, coverage overlap, permissions, serial and model keys, label positions.
- `npm run check` passes before a phase is finished.
- Deploy at the end of every phase and try the feature on the live address as each role.

## 9. Git

- One commit per finished step, plain message: "Add pause and resume of daily emails".
- Docs in the same commit as the code they describe. `.env` never committed.

## 10. Report at the end of a phase or change

```
Done: what now works (3–5 lines)
Live at: address, and what to try
Changed docs: which files
Decisions made: one line each
Needs from you: anything blocked or to confirm
Next: next phase or step
```
