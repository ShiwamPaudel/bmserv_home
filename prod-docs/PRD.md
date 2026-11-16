# BMServ — Product Requirements (PRD)

What the product must do. How it is built: ARCHITECTURE.md. How it looks and reads: DESIGN.md.

## 1. The problem

1. **No digital record.** The hospital keeps equipment and service records on paper and in files. Finding when a ventilator was last serviced, or who serviced it, means searching cupboards.
2. **Manuals are hard to find.** Biomedical engineers scroll through WhatsApp and search online for a device's service manual or operation manual when they need it at the bedside.
3. **Equipment moves without a trace.** Equipment is taken from one department to another with no record. When the home department needs it back, nobody knows where it went.
4. **No proper channel to the service provider.** Breakdowns are reported by WhatsApp messages that stay unread for days. Late visits by the service provider's engineer can cost lives.

## 2. What BMServ does about it

- One digital register of every piece of equipment, with its full service history. (Problem 1)
- A manuals library: service, operation and other manuals stored once per model and opened from the equipment page in seconds. Files are kept in Cloudflare R2. (Problem 2)
- Every move is recorded, temporary or permanent. Every equipment page says where it is now and where it belongs. QR labels make recording a move a 10-second job. (Problem 3)
- Breakdowns are emailed to the service provider's service department and their designated service engineers, and **emailed again once a day (08:00 Nepal time) until it is fixed**, unless an engineer pauses the daily emails (for example while waiting for spare parts). PMS reminders go out 3 days ahead. Every email is logged. (Problem 4)

One install serves one hospital. This build is configured for **ABC Hospital**. Every other hospital gets its own separate install (own database, storage and web address) from the same code. Built by Infobytes Nepal.

## 3. People and what they can do

**Admin** runs the install. **Lead** is the Biomedical Department Head. **Engineer** is a hospital biomedical engineer. Together they are the **Biomedical team**. **Hospital staff** (nurses, ward staff) only report problems by scanning a label (F16) and follow their own reports; they see nothing else.

| Action | Admin | Lead | Engineer |
|---|---|---|---|
| View everything | Yes | Yes | Yes |
| Report a problem from a label (also Hospital staff) | Yes | Yes | Yes |
| Record a breakdown, add notes, ask the service provider for help, change who receives its emails, pause or resume daily emails, mark as fixed | Yes | Yes | Yes |
| Mark a PMS as done, send a PMS reminder again | Yes | Yes | Yes |
| Move equipment temporarily, and return it | Yes | Yes | Yes |
| Upload manuals and documents | Yes | Yes | Yes |
| Add or update a service provider's service engineers; choose the designated service engineers of an equipment | Yes | Yes | Yes |
| Print QR labels | Yes | Yes | Yes |
| Add or edit equipment and models; import equipment | Yes | Yes | No |
| Move equipment permanently | Yes | Yes | No |
| Add or edit departments | Yes | Yes | No |
| Add or edit service providers and their service department contacts | Yes | Yes | No |
| Add or edit coverage (warranty, contracts) and PMS dates | Yes | Yes | No |
| Remove a manual or document; mark equipment out of service; close a breakdown as cannot be repaired | Yes | Yes | No |
| Add engineers and hospital staff, reset their passwords, deactivate them | Yes | Yes | No |
| Add or change Admin and Lead accounts | Yes | No | No |
| Change hospital settings (all tabs of Settings) | Yes | No | No |

Nobody signs themselves up. Admin or Lead creates every account.

## 4. Words we use

These exact words appear on screens, in emails and in these docs. Code names never reach the screen.

| We say | Meaning | We never say |
|---|---|---|
| Equipment | One physical device with its own serial number | Asset, item, record |
| Model | Manufacturer and model shared by identical equipment (Dräger Savina 300) | Product, SKU |
| Serial number (S.N.) | The maker's number on the device plate | Identifier |
| Department | A hospital unit: ICU, Emergency, IPD, Gastro | Location, cost centre |
| Home department | Where the equipment belongs | Owner location |
| Engineer | A hospital biomedical engineer who signs in to BMServ | User, technician |
| Team | Everyone who can sign in | Users, accounts |
| Biomedical team | Admins, Leads and Engineers | Technical staff |
| Hospital staff | Nurses and ward staff who report problems from a label | Requesters, end users |
| Report a problem | What hospital staff do from a label; it becomes a breakdown | Raise a ticket |
| PMS frequency | How often a model needs PMS: every N days, months or years | PM interval |
| Service provider | The company in Nepal that supplies and services the equipment | Vendor, supplier (on screen) |
| Service department | The service provider's service desk: its phone numbers and emails | Support channel |
| Service engineer | An engineer who works for the service provider | Field tech, provider user |
| Designated service engineer | The service engineer responsible for a particular equipment | Assignee |
| Breakdown | The equipment is not working properly | Ticket, incident, work order, issue |
| Daily emails | The repeat email to the service provider each morning while a breakdown is with them | Escalation, follow-up job |
| PMS | Planned maintenance visit by the service provider | PM task, job |
| Coverage | Warranty, AMC or CMC that entitles the equipment to service | Entitlement, SLA |
| Manual | Service manual, operation manual or other manual of a model | Attachment, asset file |
| Document | A file about one equipment: installation report, service report, contract, photo | Attachment |
| Service history | Everything that happened to the equipment, newest first | Audit trail, log |

Coverage types: **Warranty**, **AMC** (Annual Maintenance Contract, visits and labour), **CMC** (Comprehensive Maintenance Contract, labour and parts).

## 5. Features

### F1. Sign in, team, my account
- Sign in with username and password; stays signed in on the device.
- Each person: full name, username, **phone (required)**, email (required), role, active or not.
- Admin or Lead sets a temporary password; the person changes it under My account.
- Deactivated people cannot sign in; their name stays on past records.
- Sign-in is limited to 5 tries a minute.
- Done when: wrong password shows a plain message; a deactivated person is refused; an Engineer cannot open Team.

### F2. Hospital settings (Admin)
One screen with tabs; each tab saves on its own.
- **Hospital**: name (ABC Hospital), address, department name, department email, department phone.
- **Calendar and phone**: date display, Nepali calendar (BS) or English calendar (AD), for everyone, on screens, date pickers, labels and emails (default Nepali; dates are stored the same either way). Default country code for phone numbers and WhatsApp (default +977 Nepal; each number can use another code, for example +91 India).
- **Emails**: daily email time (default 08:00 Nepal time; breakdown daily emails and PMS reminders go out once a day at this time); PMS reminder days before due date (default 3); extra addresses copied on every email to service providers; email the Biomedical team when hospital staff report a problem (default on).
- **Home alerts**: PMS due soon window (default 7 days), coverage ending warning (default 30 days), daily emails paused too long (default 14 days).
- **Staff reports**: hospital staff can report problems (default on); who is responsible for problems they report (default: first active Lead, then Admin).
- **Notifications**: notify the Biomedical team of every new breakdown (default on); notify the person who reported a problem when it is fixed (default on); show WhatsApp buttons (default on).

### F3. Departments
- Name (unique), optional short name; can be made inactive, never deleted while equipment is there.
- Department page shows two lists: **Here now** (including equipment borrowed from elsewhere, marked) and **Belongs here but elsewhere** (where it is, since when, who moved it, expected return).

### F4. Service providers
- Company: name (required), address, company phone (optional), company email (optional), notes.
- **Service department contacts**: phone numbers and email addresses, each with an optional label ("Service desk", "After hours"). **A new service provider needs at least one service department phone and one email.**
- **Service engineers**: any number. Each has name, phone and email (all required), notes, active or not. A new service provider is added with its first service engineer.
- Phone numbers have a country code chosen from a list (default from Settings, +977) or typed.
- **WhatsApp**: next to service department phones and service engineers, a WhatsApp button opens WhatsApp (wa.me) with a short message ready; nothing is sent by BMServ. Any team member can add, update or deactivate a service engineer, because the hospital often learns of changes first.
- Provider page: company details with tap-to-call phone numbers and tap-to-email addresses, service department contacts, service engineers, the equipment they look after, and the emails sent to them.

### F5. Models and equipment
**Model**: equipment type (Ventilator), manufacturer, model, category (optional), **PMS frequency** (every N days, months or years; months by default; required for a new model), **photo** (optional; Lead or Admin). Unique by manufacturer + model. The photo shows as a small picture beside the model or equipment name in every list, on the equipment page and on Report a problem; changing it replaces the old photo, which is deleted from storage at once. Holds the manuals (F6). Added and edited on the **Models** screen, or inline while adding equipment. Each model has its own page: photo, PMS frequency, its **manuals** (uploaded and removed there, stored once for the model and shown on every equipment of that model, whatever the serial number) and the list of its equipment. The equipment page shows the model's manuals to open or download, with a link to the model page.

**Equipment** fields entered:
- Model (choose or add), serial number (required, unique, compared without case or spaces), hospital tag number (optional, unique).
- Service provider, home department, installed on (date) — required.
- **Designated service engineers**: zero or more of that provider's service engineers. Any team member can change them.
- Photo, notes, documents.

Shown, never typed: current department, status, coverage, last PMS, next PMS, service history.

Status: **Working**, **Breakdown** (has an unresolved breakdown), **Out of service** (set by Lead or Admin; no PMS, no emails).

Adding equipment already in use: optional "Last PMS done on" so earlier history is kept, saved as "From earlier records".

Done when: a duplicate serial number is refused with a link to the existing equipment; the equipment page shows last and next PMS with nobody typing them.

### F6. Manuals and documents
- **Manuals belong to the model**, so a manual uploaded once appears on every equipment of that model. Types: Service manual, Operation manual, Other manual. Each has a title and optional language or version note.
- **Documents belong to one equipment**: Installation report, Service report, Contract, Photo, Other.
- Any team member uploads; Lead or Admin removes (removed files stop showing; they are kept in storage for 30 days).
- Equipment page shows its manuals at the top, one tap to open. Open in the phone's viewer or download.
- **Manuals screen**: search all manuals by equipment type, manufacturer, model or title.
- Files: PDF, JPG, PNG, WEBP. Manuals up to 200 MB, other files up to 20 MB. Stored in Cloudflare R2, private, opened through short-lived links.
- Done when: a service manual uploaded on one Savina 300 opens from every Savina 300; a 150 MB PDF uploads from a phone with a progress bar.

### F7. QR labels
- Every equipment has its own QR code, made automatically. Scanning with any phone camera opens that equipment in BMServ (sign in first if needed).
- From the scanned page, one tap to: report breakdown, move, open manuals.
- Print from the equipment page ("Print label") or several at once from the equipment list.
- Paper A4. **One label is 105 × 74 mm (A7): one eighth of A4, 12.5 % of the page.** Up to 8 per sheet (2 across, 4 down).
- Before printing, choose the start position (1–8) to reuse a partly used sticker sheet.
- Label shows: hospital name, department name, QR code, equipment type and model, serial number, home department, "Scan to see service history or report a problem".
- After a permanent move the equipment shows "Label needs reprinting" until printed again.
- Done when: a single label prints at exactly 105 × 74 mm with the rest of the page blank; 8 selected labels fill one page; the printed QR opens the right equipment.

### F8. Moving equipment
- **Temporary move**: to department, reason, optional expected return date. Home department stays. Later "Return to [home]".
- **Permanent move**: home department changes. Lead or Admin.
- Record a move from the scanned QR page in under 10 seconds: To department, Reason, Save.
- Every move shows in service history with who and when.
- Equipment away from home is marked wherever it is listed. Past its expected return date it appears on Home.

### F9. Coverage
- Type (Warranty, AMC, CMC), service provider, start date, end date, contract number (optional), contract document (optional), "PMS every N months" (1, 2, 3, 4, 6, 12, or no PMS).
- One active coverage per equipment at a time; can end early.
- Equipment page shows "Under warranty until …", "Under AMC until …" or "Not under warranty or contract".
- Home lists coverage ending in the next 30 days.

### F10. PMS
- **PMS exists only while the equipment is under warranty or contract.** No coverage, no PMS dates, no reminders.
- Coverage takes its PMS frequency from the model (can be changed or left empty for no PMS). Saving coverage creates the PMS dates from start to end every N days, months or years, numbered per coverage and shown as **"PMS 2 of 4"** (at most 400 per coverage).
- Lead or Admin can change one PMS date.
- **Reminder email** to the service department and the designated service engineers, the set number of days before (default 3), at the daily email time. One email per provider per due date lists all equipment due that day.
- Mark as done: date done, service engineer's name, remarks, optional service report. Last PMS and next PMS update by themselves.
- Not done by its date: **Overdue** until done. A team member can send the reminder again.
- When coverage ends, remaining PMS become **Not done**.
- Done when: equipment with expired coverage shows no upcoming PMS; the reminder goes once automatically; marking PMS 2 done makes PMS 3 the next PMS.

### F11. Breakdowns and daily emails
1. **Record**: equipment (search or scan), what is wrong, reported by (name, from the department), when. Number BD-0001, status **Open**. Equipment becomes Breakdown. The engineer who records it is responsible unless given to someone else.
2. **Work on it**: dated, named notes at any time.
3. **Fixed by us**: mark as fixed with work done and parts replaced. Status **Fixed**.
4. **Ask service provider for help**:
   - BMServ shows who will receive the email: the provider's service department emails and the equipment's designated service engineers, all ticked. The engineer can untick, add another service engineer of that provider, or add an extra address. These recipients are saved on the breakdown and used for every email about it; they can be changed later.
   - Send. Status **With service provider**.
5. **Daily emails**: while a breakdown is With service provider, BMServ emails the same recipients **once a day at the daily email time (default 08:00)**, stating how many days it has been down, until it is marked fixed or closed. No daily email goes out within 12 hours of the first request.
6. **Pause daily emails**: any team member can pause them. Reason is required: Waiting for spare parts, Waiting for quotation or approval, Service engineer is working on it, or Other (written). Optional "Resume on" date. While paused the breakdown shows "Daily emails paused since … : reason". **Resume** at any time; on the resume date they restart automatically. Every pause and resume is in the breakdown's history. Paused for more than 14 days shows on Home.
7. **Send now**: any team member can send the email immediately (at most once an hour), also while daily emails are paused; it counts as that day's daily email.
8. **Fixed by service provider**: mark as fixed with service engineer's name, work done, parts replaced, optional service report. A short closed notice is emailed to the same recipients. Daily emails stop.
9. **Cannot be repaired**: Lead or Admin. Equipment becomes Out of service. Daily emails stop.

- Last unresolved breakdown closed as fixed: equipment returns to Working.
- Lists: Open, With service provider, Fixed; filter Mine, Paused.
- Downtime shown in days and hours; stops when fixed.
- Done when: first request sends once; a daily email goes once per day while unpaused; pausing stops them the same day; the resume date restarts them; fixing stops them and sends the closed notice.

### F12. Service history
One list per equipment, newest first: installation, breakdowns (notes, pauses, emails, outcome), PMS done, moves, coverage start and end, label printing, documents added. Each entry: date, what happened, who. Printable.

### F13. Home
**Overview** first: headline numbers (equipment and how many are under coverage, share working now, open breakdowns, PMS overdue and due in 30 days, average time to fix over 90 days) and small charts (equipment status, coverage now, breakdowns per month for 6 months, PMS in the last 90 days, equipment by department with how many are down, models with most breakdowns in 12 months). Each number or part opens the matching list where one exists.

Then **what needs attention**, in this order (day windows set in Settings, Home alerts):
1. Breakdowns open or with service provider (mine first for Engineers).
2. Breakdowns with daily emails paused for more than 14 days.
3. PMS overdue.
4. PMS due in the next 7 days.
5. Equipment past its expected return date.
6. Coverage ending in the next 30 days.

Each line opens what it describes. Nothing to show: say so plainly.

### F14. Find, import, export
- Search equipment by type, manufacturer, model, serial number, hospital tag. Filter by department, status, coverage, service provider.
- **Import equipment from a spreadsheet (CSV)** with a template, a row-by-row preview of problems, nothing saved until confirmed. Creates models and links departments and providers by name.
- Download equipment, breakdowns and PMS lists as CSV.

### F15. Installable app
- Installs to the home screen on Android, iOS and desktop.
- Offline: opens and shows what was last loaded, read-only, with "You are offline". Saving and opening manuals need a connection.
- **Notifications (Web Push)**: each person turns them on per device under My account (iPhone: after adding BMServ to the Home Screen) and can send a test. The Biomedical team is notified of every new breakdown (except the one who recorded it); the person who recorded or reported a breakdown is notified when it is fixed or cannot be repaired. Settings can turn each off.

### F16. Hospital staff report a problem
- Admin or Lead adds hospital staff under Team with the role **Hospital staff** (name, username, phone, email, temporary password).
- The QR label opens BMServ; hospital staff signed in see **Report a problem** for that equipment: what it is, where it is, and one box "What is wrong?". The team opening the same label sees the equipment page.
- Sending creates a breakdown (Open), reported by and recorded by that person, responsible: the person set in Settings, else the first active Lead, else Admin. If the equipment already has an unresolved breakdown, the report is added to it as a note instead.
- The Biomedical team is notified (push, and an email to every active Admin, Lead and Engineer, settings allowing). After sending, WhatsApp buttons for team members open WhatsApp with a short message and a link to the breakdown.
- **My reports** lists what the person reported, its status and when it was fixed. Out-of-service equipment cannot be reported.
- Done when: a nurse scans a label, reports, the team gets a notification and email, and the nurse sees it fixed under My reports.

## 6. Emails

Plain, short, factual. From the hospital's sending address; replies go to the department email. Dates in the calendar chosen in Settings (F2). Every email is logged and shown on the breakdown, PMS and service provider pages with sent or failed.

**Recipients**: To = the breakdown's recipients (service department emails + designated service engineers + any added). CC = hospital extra addresses from settings. For PMS: the provider's service department emails + designated service engineers of each equipment.

### 6.1 Breakdown, help needed (first request)
Subject: `Breakdown: {type} {model}, S.N. {serial} at {hospital} needs service`

```
Dear {service provider} service team,

The equipment below at {hospital} is not working and needs your service support.

Equipment:      {type} {manufacturer} {model}
Serial number:  {serial}
Department:     {current department}
Installed on:   {date}
Coverage:       {Under AMC until … | Not under warranty or contract}
Breakdown no.:  {BD-0042}
Reported on:    {date and time}

Problem
{what is wrong}

Checked by our team so far
{latest notes, or "Nothing recorded yet."}

Please reply with the date and time your engineer will attend.
We will send this email daily until the equipment is working again.

Contact: {responsible engineer}, {phone}
{department name}, {hospital}, {department phone}
```

### 6.2 Breakdown, daily email
Subject: `Day {N}: {type} {model}, S.N. {serial} at {hospital} still not working`
First line: "This equipment has been down for {N} days and is still waiting for service." Then the same details, plus "Latest update from our team" with notes since the last email. Same closing.

### 6.3 Breakdown, closed
Subject: `Working again: {type} {model}, S.N. {serial}, breakdown {BD-0042}`
One paragraph: closed on {date}, fixed by {name}, total downtime {N days}; daily emails have stopped; thanks.

### 6.4 PMS due
Subject: `PMS due on {date}: {type} {model}, S.N. {serial} at {hospital}` (grouped: `PMS due on {date}: {n} equipment at {hospital}`)

```
Dear {service provider} service team,

The planned maintenance below is due at {hospital}. Please arrange for your engineer to visit on or before the due date.

{for each}
{type} {manufacturer} {model}, S.N. {serial}
Department: {current department}
PMS {2} of {4}, {AMC until …}
Due on: {date}
{end}

Please reply with the visit date and time.

Contact: {department name}, {department phone}
{hospital}
```

### 6.5 Problem reported (to the Biomedical team)
Sent once when hospital staff report a problem from a label (setting on), to every active Admin, Lead and Engineer; no copy to the service-provider copy list. Respects EMAIL_REDIRECT_TO.

```
Subject: Problem reported: {Type} {Model} at {Department}, {BD-number}

{Name} reported a problem from the BMServ label.

Equipment, Serial number, Department, Breakdown no., Reported on, Reported by (name, phone), Responsible

Problem:
{what they typed}

Open in BMServ: {link}
```

## 7. Not in this version
- Several hospitals in one install.
- Service providers signing in.
- Department staff reporting without an account (staff need an account, F16).
- Spare parts stock, costs, invoices.
- Calibration schedules separate from PMS.
- SMS or WhatsApp sent by BMServ (WhatsApp buttons only open WhatsApp with a message ready).
- Saving while offline.

## 8. Likely next
- Replies from service providers shown on the breakdown (Resend inbound email, needs the verified domain).
- Calibration and electrical safety test dates.
- Uptime and downtime reports by department and by service provider.
- Link to a service provider's own system (for example Serviol).
