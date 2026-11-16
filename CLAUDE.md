# BMServ

Installable web app for a hospital Biomedical Department: equipment register, manuals, QR labels, moves, breakdowns with daily emails to service providers, PMS. One install per hospital; this one is ABC Hospital.

Spec files (`PRD.md`, `ARCHITECTURE.md`, `DESIGN.md`, `PHASES.md`, `RULES.md`) are in `prod-docs/`. `CLAUDE.md`, `MEMORY.md` and `README.md` are in the root; original logos in `assets/logos/`, sign-in photos in `assets/images/`. Leave them where they are.

## Start of every session

1. Read `MEMORY.md` — what exists, where, what is next.
2. Read `prod-docs/RULES.md` — how to work here.
3. Do not explore beyond what MEMORY.md points to. Open other specs and code only when the task needs them:
   - `prod-docs/PRD.md` — problem, features, permissions, email wording
   - `prod-docs/ARCHITECTURE.md` — tables, routes, folders, env values, deploy
   - `prod-docs/DESIGN.md` — colours, type, components, wording, QR label, logos
   - `prod-docs/PHASES.md` — build order and progress

## End of every phase or change

Update the docs as `prod-docs/RULES.md` section 2 says (always MEMORY.md; others when their subject changed), in the same commit as the code. These files are the project's memory; future sessions start from them, not from the code.

## Always

- Live Turso, R2 and Resend only. No local database or local file storage. Tests use in-memory libSQL.
- One hospital per install. No hospital column.
- On-screen words come from `shared/src/terms.ts`.
- Emails only through `server/src/emails/send.ts`; respect `EMAIL_REDIRECT_TO`.
- Never print or commit secrets.
