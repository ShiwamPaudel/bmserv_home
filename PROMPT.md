# Prompts for Claude Code

This file is for you, not for Claude Code. Keep it outside the project folder, or leave it in; it does no harm.

## Before the first run

1. Put these in an empty folder `bmserv` (the root):
   ```
   bmserv/
     CLAUDE.md  PRD.md  ARCHITECTURE.md  DESIGN.md  PHASES.md  RULES.md  MEMORY.md
     BMServ - Logo.png  BMServ - Logo 1.png  BMServ - Logo 2.png
   ```
2. Have these ready. Do **not** paste them into the chat; Claude Code will create `.env.example` and you fill in `.env` yourself:
   - Turso database URL and auth token
   - R2 account ID, access key ID, secret access key, bucket name
   - Resend API key, and a From address on a domain verified in Resend
   - Your email address (all emails go only to you until go-live)
   - First Admin: name, username, email, phone, password
   - The public web address it will run at
3. Decide where it will run (any host that keeps a Node or Docker app running all the time with HTTPS: a VPS, Railway, Render paid plan, Fly.io).
4. Open Claude Code in `bmserv` and paste Prompt 1 with the host filled in.

---

## Prompt 1 — Phase 1

```
You are building BMServ in this folder. All spec files and the three logo PNGs are in the root folder.

Read CLAUDE.md, then MEMORY.md and RULES.md in full. Then read PRD.md, ARCHITECTURE.md, DESIGN.md and PHASES.md once in full so you know the whole product before writing code. Look at the three logo images to tell which is which (DESIGN.md section 14).

Build Phase 1 from PHASES.md, and only Phase 1.

Hosting: <write your host here, e.g. "Railway" or "my Ubuntu VPS at 1.2.3.4 with Docker">

How to work:
- First create .env.example with every value from ARCHITECTURE.md section 11, then stop and ask me to fill in .env. Do not ask me to paste secrets into the chat, and never print .env.
- Once I confirm, run the services check (Turso, R2, Resend) and the R2 CORS script before building anything else. If a check fails, tell me exactly which value or setting to fix.
- Use only the live Turso database, R2 bucket and Resend. No local database file, no local file storage. Automated tests use in-memory libSQL only.
- Keep EMAIL_REDIRECT_TO set to my address so no real service provider gets an email.
- Before using Better Auth, Drizzle with Turso, R2 presigned links, Resend or vite-plugin-pwa, check their current documentation; record the versions you install in MEMORY.md.
- Follow RULES.md exactly. Build what the specs describe and nothing extra. If something unclear changes what gets built, ask me; small details, decide and record in MEMORY.md under Decisions.
- The interface follows DESIGN.md: logo colours, the three typefaces, rows instead of cards, plain wording from shared/src/terms.ts. No generic dashboard look.

These spec files are your long-term memory. I will come back later to change things and add features, and future sessions will start from them instead of reading the code. So when the phase is finished, before reporting:
1. Run npm run check, deploy, and try it on the live address as Admin.
2. Update MEMORY.md (current state, live address, file map, decisions, versions, gotchas, change log) and tick the boxes in PHASES.md.
3. Update PRD.md, ARCHITECTURE.md or DESIGN.md wherever what you built differs from or adds to them. Edit in place so each stays short and true.
4. Commit code and docs together.

Then stop and report in the format from RULES.md section 10.
```

---

## Prompt 2 — Phases 2, 3 and 4

Start a fresh session (or clear the conversation) before each phase. The spec files carry the context.

```
Read CLAUDE.md, MEMORY.md and RULES.md. Then build the next unfinished phase in PHASES.md, and only that phase. Open other spec sections and code files only as the phase needs them, using the file map in MEMORY.md instead of scanning the project.

Use the live Turso, R2 and Resend already configured in .env. Keep EMAIL_REDIRECT_TO as it is unless this is Phase 4 and I have confirmed go-live.

When finished: run npm run check, deploy, try it on the live address as Admin, Lead and Engineer, update the docs as RULES.md section 2 requires, commit, and report in the section 10 format. Then stop.
```

For Phase 4, add one line at the end once you are ready for real emails to go out:
```
Go-live confirmed: empty EMAIL_REDIRECT_TO after the final checks. Real hospital details: <name, address, department email, phone>.
```

---

## Prompt 3 — change something or add a feature later

```
Read CLAUDE.md, MEMORY.md and RULES.md.

Change wanted:
<describe it in plain words>

Before writing code:
1. Tell me in a few lines which spec sections and which files this touches, and anything in the specs it conflicts with.
2. Update PRD.md with the new behaviour and add a phase for it at the bottom of PHASES.md.

Then build it, opening only the files involved via the file map in MEMORY.md. Any database change must be a new migration that keeps existing live data; if data would be lost, stop and ask me. When finished, update the docs as RULES.md section 2 requires, deploy, commit, and report in the section 10 format.
```

---

## Prompt 4 — fix a problem

```
Read CLAUDE.md, MEMORY.md and RULES.md.

Problem:
<what you did, what you expected, what happened>

Find the cause before changing anything and tell me what it is. Fix it, add a test that would have caught it, add a line to Gotchas in MEMORY.md if it could happen again, update the change log, deploy and commit.
```
