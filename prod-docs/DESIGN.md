# BMServ — Design

How BMServ looks, reads and behaves. Follow it exactly. When something is not covered, pick the quieter option and add the decision here.

## 1. Who it is for, how it should feel

A biomedical engineer next to a ventilator in the ICU, phone in one hand, needing the service manual or recording a breakdown. A department head at a desk checking what is down and what is due. They need one piece of equipment, its state, and one action, in seconds.

It should feel like a well-kept equipment logbook: calm, exact, nothing decorative. The serial number and the status are the most important things on any screen.

## 2. Principles

1. **One screen, one job.**
2. **Rows, not cards.** Plain rows divided by a thin line. No grids of boxes, no shadows.
3. **Status is always a word.** Colour supports the word, never replaces it.
4. **The serial number is sacred.** Always in full, in the serial typeface.
5. **Colour is rare.** Navy and white carry the interface; teal marks what is active; red, amber, green only for status.
6. **Everything in two taps** from the bottom bar or a scan.

## 3. Colour

From the BMServ logo (navy `#19445B`, teal `#2DD4BF`).

| Token | Value | Use |
|---|---|---|
| `--navy` | `#19445B` | Top bar, sidebar, primary buttons, headings |
| `--ink` | `#12303F` | Body text |
| `--muted` | `#52656F` | Secondary text, field labels |
| `--teal` | `#2DD4BF` | Active navigation marker, selected state, focus ring on navy, label corner. Fill only. |
| `--teal-deep` | `#0B6F66` | Links and small accents on white |
| `--teal-wash` | `#E3F8F5` | Selected row, saved flash |
| `--paper` | `#FFFFFF` | Rows, page on phone |
| `--surface` | `#F3F7F8` | Page on desktop, input background |
| `--line` | `#D6DFE4` | Separators, input borders |

Status (text on its background):

| Status | Text | Background |
|---|---|---|
| Working, Fixed, Done | `#1B6E43` | `#E6F4EC` |
| Breakdown, Open, Overdue | `#A3231B` | `#FCEBE9` |
| With service provider, Due soon, Daily emails paused | `#8A4B00` | `#FFF0D2` |
| Out of service, Not done, Cannot be repaired | `#44545C` | `#E9EEF0` |

- **Teal is never text on white** (1.9:1). Navy text on teal is fine (5.6:1). Teal-coloured text uses `--teal-deep`.
- All pairs above pass WCAG AA. No new colours without a contrast check.
- No gradients, no tinted shadows, no dark mode in this version.

## 4. Type

| Role | Typeface |
|---|---|
| Headings, screen titles, navigation | Barlow Semi Condensed 600 (echoes the condensed logo letters) |
| Everything else | Barlow 400 / 500 |
| Serial numbers, hospital tag, BD numbers | IBM Plex Mono 500, so 0/O and 1/I/l are never confused against the device plate. Nothing else. |

Bundled with the app (`@fontsource/*`) so they work offline.

Sizes (px): 13 small, 15 secondary, 16 body and inputs, 18 row title, 22 screen title, 28 sign-in title. Line height 1.45 text, 1.2 titles. Sentence case. No all-capitals labels, no letter-spacing.

## 5. Shape and spacing

- Spacing: 4, 8, 12, 16, 24, 32.
- Corners: 6 px buttons and inputs, 10 px sheets and dialogs, round only on status pills.
- 1 px `--line` borders. Shadow only under a sheet or dialog covering the page.
- Tap targets ≥ 44 × 44 px; rows ≥ 56 px.
- Desktop widths: lists ≤ 880 px, forms ≤ 560 px, left-aligned beside the sidebar.

## 6. Layout and navigation

Phone:

```
+----------------------------------+
| [logo]               [Scan] [Me] |  navy top bar
+----------------------------------+
| Equipment                        |
| [ Search type, model or S.N.  ]  |
| Department v  Status v           |
|----------------------------------|
| Ventilator                Working|
| Dräger Savina 300                |
| S.N. ASKL-0093   ICU             |
|----------------------------------|
| Infusion pump           Breakdown|
| B. Braun Perfusor Space          |
| S.N. 778120   Emergency, home IPD|
|----------------------------------|
+----------------------------------+
| Home  Equipment  Breakdowns  PMS  More |
+----------------------------------+
```

- Bottom bar: Home, Equipment, Breakdowns, PMS, More. Active item: teal bar above its label.
- More: Manuals, Hospital setup, Reports, Settings, My account, Sign out.
- Desktop (≥ 960 px): navy left sidebar: Home, Equipment, Breakdowns, PMS, Manuals, Scan; then Hospital setup, Reports, Settings.
- **Hospital setup**: one item; its screens (Models, Departments, Service providers, Team for Admin and Lead) have "Hospital setup" as the title with that screen's add button, and tab links under it (same look as other tabs: teal underline on the current one). Pages use the full width beside the sidebar up to 1440 px (`--w-page`); forms stay 560 px wide.
- **Hospital staff** see only: Report a problem, Equipment (their departments), My reports, My account (bottom bar on phone, sidebar on desktop; content width 880 px).
- **Scan** always in the top bar; opens the camera to read a BMServ label.
- Add/edit: full screen on phone, side sheet on desktop.

**Equipment page**, top to bottom:
1. Type, manufacturer and model, status pill.
2. Serial number (large, serial typeface), hospital tag.
3. Actions: Report breakdown, Move, Manuals (count). "More" menu: Print label, Edit, Out of service.
4. Facts: Department (and "Belongs to …" when away), Service provider, Designated service engineers (name, tap-to-call), Installed on, Coverage, Last PMS, Next PMS.
5. Manuals of its model (title, type, size; open or download; "Open model" link). Uploading and removing manuals happens on the model page.
6. Documents.
7. Coverage (current and earlier; Lead/Admin add, edit, end early) with its PMS dates (Mark as done, Change date, Send reminder again).
8. Service history.

**Breakdown page**: number and status; equipment line; time down; responsible engineer. Primary action depends on status: Open → "Ask service provider for help" and "Mark as fixed"; With service provider → "Mark as fixed", plus "Pause daily emails" or "Resume daily emails", and "Send now". Below: Who receives emails (editable), Notes (with "Add note"), Emails sent, History.

**Ask service provider for help** screen: recipients as a checklist grouped "Service department" and "Designated service engineers", then "Add another service engineer" and "Add an email address"; a preview of the email; button "Send email to {n} recipients".

**Pause daily emails** sheet: reason (radio list), note, Resume on (optional date), button "Pause daily emails". The breakdown then shows an amber strip: "Daily emails paused since 12 Mangsir (3 days): Waiting for spare parts. Resume daily emails".

**Service provider page**: company details; Service department (phones and emails, tap to call or email, WhatsApp button on phones); Service engineers (name, phone, email, WhatsApp, "Add service engineer"); Equipment; Emails sent.

**Add service provider** sheet: Company name; a bordered group "Service department" (phone with country code, email, "Add another phone/email"); a bordered group "Service engineer" (name, phone, email); then company phone and email, address, notes (optional).

**Breakdown page** (unresolved): a "Message on WhatsApp" section after Who receives emails: the service provider's desk and engineers (designated first) and the Biomedical team, each with a WhatsApp button.

**Model page**: back to Models; type as title, Edit (Lead/Admin); 96 px photo with manufacturer and model, PMS frequency, category; Manuals ("Upload manual", a line saying they are stored once and shown on every equipment of this model); Equipment of this model.

**Models screen**: search field; each row opens the model page; rows "Ventilator, Dräger Savina 300", second line the PMS frequency (amber "PMS frequency not set" when missing) and category, third line its equipment and manual counts. "Add model" opens the model sheet (type, manufacturer, model, category, PMS frequency, photo), then the new model's page.

**Settings**: tabs Hospital, Calendar and phone, Emails, Home alerts, Staff reports, Notifications. Desktop: tab list on the left (teal left bar on the active tab), the tab's form on the right; phone: tabs scroll sideways above the form. Each tab has one "Save changes" and shows when settings were last saved. On/off settings are switches.

**My account**: a navy profile band (initials in a teal circle, name, username, role pill); then cards: Password, Notifications (status on this device, Turn on / Send a test / Turn off; iPhone hint), Your details, Sign out. Two columns from 1100 px.

**Report a problem** (hospital staff): intro line, one large "Scan a label" button, "Call the Biomedical Department", the last three reports. From a label: the equipment in a teal-edged box, one "What is wrong?" box, "Send to Biomedical team". After sending: confirmation, breakdown number, WhatsApp buttons for team members, "Report another problem".

**Equipment** (hospital staff): one intro line, search field, department select (only with more than one department), equipment rows with photo and status pill; a third line "Already reported, BD-0001" when unresolved. A row opens Report a problem for it. No department: grey notice and "Scan a label".

**Team, Hospital staff**: the person sheet shows "Departments" checkboxes (two columns where wide) when the role is Hospital staff; staff rows show "Departments: ICU, Emergency" or "No department yet".

**Department page**: Here now; Belongs here but elsewhere.

**Manuals screen**: one search field; results as rows "Service manual: Dräger Savina 300", second line size and date added; tap opens.

**Home**: an **Overview** first, then "Needs attention" with short lists under plain headings ("Down now", "Daily emails paused for a long time", "PMS overdue", "PMS in the next N days", "To be returned", "Coverage ending").
- Overview: a row of number tiles (2 per row on phone, 3 on tablet, 5 on wide desktop): white, 1 px border, 4 px coloured left edge (navy, or the status colour when it needs attention), label 13 muted, number 28 navy, one muted line below. A tile opens its list.
- Then chart cards (1, 2 or 3 per row): Equipment status and Coverage now and PMS in the last 90 days as one segmented bar with a legend that always shows count and percent; Breakdowns per month as columns in navy (latest and highest labelled, others on hover); Equipment by department and Most breakdowns as ranked bars (navy, the down part in red).
- Chart colours (`tokens.css`): status fills `--chart-ok/bad/wait/off` with the word always beside them; coverage uses `--chart-1/2/3` (blue, teal, amber; checked for colour-blind separation and 3:1 on white) and `--chart-none` grey for no coverage; counts use one hue `--chart-bar`. Text never takes a series colour. Hover or keyboard focus shows a small dark tooltip.

## 7. Components

- **Status pill**: word on status background, 13 px 500; one per row.
- **Row**: title 18, one or two secondary lines 15 `--muted`, pill top right; whole row tappable.
- **Fact**: label 13 `--muted` above value 16 `--ink`. Phones and emails are links (`tel:`, `mailto:`).
- **Buttons**: Primary navy fill white text; Secondary white with 1 px navy border; Danger white with red text and border. One primary per screen. Verb labels saying exactly what happens. Icon-only only for Scan, Back and the show/hide password eye, with accessible names. Settings tabs and Account cards carry a small outline icon beside their words.
- **Fields**: label above, help below in `--muted`, error below in red replacing help. Required unless marked "optional".
- **Repeatable list field** (contacts, extra addresses): one input per line with "Add another phone" / "Add another email" and a remove control per line.
- **Phone field**: country code select ("+977 Nepal" first, then India and others, "Other code" to type one) beside the number. Default from Settings.
- **PMS frequency field**: "Every [ 6 ] [ Months ▾ ]" with Days, Months, Years; Months by default.
- **File row** (manuals, documents): a 44 px teal-wash square with a file icon (PDF or image) at the start; title; kind (and model link on Manuals); "PDF, 37 KB" and the added date. Outlined buttons with icons on the right: Open, Download, and Remove (red outline) where allowed; on phones (< 720 px) they sit under the text. The row itself is not a link.
- **Section header actions** ("Upload manual", "Add coverage", "Print service history"): small outlined navy buttons, never bare text.
- **Buttons** have a hover state (light grey fill; primary slightly lighter; danger red wash) and move down 1 px when pressed.
- **Install popup** (phones and tablets, after sign-in): centred white card on a dimmed page, 400 px wide; app icon 64 px, "Install BMServ", hospital and department; one line; three points with teal-wash round icons; full-width "Install app" and "Not now". iPhone: numbered steps (Share, Add to Home Screen, Add) and "Got it". Close button top right; Escape closes.
- **Chips** (Reports period): pill buttons, white with a grey border; the chosen one navy.
- **Reports screen**: title with "Download PDF" (outlined) and "Download PowerPoint" (primary); period chips; the report: navy cover (logo on a white tile, hospital name, "Biomedical Department report", period, prepared date), then sections with a teal underline: Key figures (stat tiles, 4 across on wide screens), Highlights (bullets), Breakdowns (paired monthly columns navy + teal, ranked bars, small tables), Service providers (table), PMS, Warranty and contracts, Equipment, Other activity. Print: A4, no app frame, sections never split.
- **Add equipment, Warranty box**: bordered box "Warranty" with "Under warranty" ticked; start date and length side by side; a teal-wash line "Warranty until 30 Sep 2027" with the PMS frequency from the model.
- **Coverage line** on equipment list rows: "Warranty until …" in ink, amber when ending soon, "Not covered" muted.
- **Hospital logo field** (Settings, Hospital): 160 × 96 dashed preview, "Choose logo" / "Change logo", "Remove logo"; saves at once.
- **Month heading in a list** (PMS Upcoming): small navy bold text above that month's rows.
- **Switch**: label and help on the left, a 48 × 28 px pill switch on the right (navy when on); for on/off settings.
- **WhatsApp button**: secondary button with a message icon and the word WhatsApp, in WhatsApp green (`--whatsapp`) on white; opens wa.me in a new tab. Hidden when Settings turn WhatsApp buttons off.
- **Card** (My account, Home charts): white, 1 px border, 10 px corners, no shadow.
- **Model photo**: square, 6 px corners, 1 px border, cropped to fill; 44 px at the start of equipment and model rows (52 px on Models), 96 px on the equipment page, 72 px on Report a problem. No photo: a grey outline package icon in the same square. In the model form: an 88 px preview with "Choose photo" / "Change photo".
- **Error screen**: if a screen fails, "Something went wrong" with Reload and Go to Home, never a technical page.
- **Date field**: in the calendar chosen in Settings: Nepali (BS) as three selects (Day, Month, Year), or English (AD) as the browser's date field.
- **File upload**: choose file → progress bar with size → done row. Shows the limit before choosing ("PDF up to 200 MB").
- **History entry**: date left; what happened and who right; breakdown entries expand.
- **Notice strip**: under the top bar for "You are offline" and the paused-emails strip on a breakdown.
- **Confirm** only before: sending a first request, closing a breakdown, permanent move, out of service, removing a file, deactivating a person.
- Icons: one outline set, 1.5 px stroke, 20 px, only where they speed recognition. Never decorative.

## 8. QR label (print)

A4 portrait, no app margins, 8 cells (2 across × 4 down). **Each label 105 × 74.25 mm (A7): 12.5 % of the sheet.** One label uses one cell; the rest stays blank.

```
+------------------------------------------------------+ 105 mm
|\  ABC Hospital                                       |
| \ Biomedical Department                              |
|                                                      |
|  +-----------+   Ventilator                          |
|  |           |   Dräger Savina 300                   |
|  | QR 36 mm  |                                       |
|  |           |   S.N. ASKL-0093                      |
|  +-----------+   Home department: ICU                |
|                                                      |
|  Scan to see service history or report a problem     |
+------------------------------------------------------+ 74 mm
```

- Inner padding 6 mm; light dashed cut line (0.2 mm) around each cell.
- QR 36 × 36 mm including quiet zone, black on white, error correction M.
- Hospital name Barlow Semi Condensed 600 12 pt; equipment type 14 pt; serial IBM Plex Mono 500 12 pt; other lines 9 pt.
- Small navy diagonal corner mark top-left (section 10). Everything else black for black-and-white printers.
- **Print labels screen** sits inside the app (sidebar, top and bottom bars; none of it prints). Desktop ≥ 1100 px: a 300 px white panel (sticky) beside a grey preview area; phone: panel above preview. Panel: label count in navy with the number of A4 sheets; "Start at position" as a small A4 sheet (2 × 4, A4 proportions): used positions grey and struck through, positions the new labels fill in teal wash, the start in navy, the rest white, with a three-item legend; full-width "Print" with a printer icon and the note "Print at 100 % (actual size)" under it; after printing, "Did the labels print correctly?". Preview: header "Preview" and sheet count; each A4 sheet white with a 1 px border, shrunk to fit; empty positions show their number in light grey (screen only).

## 9. Words

All wording from `shared/terms.ts`, vocabulary from PRD.md section 4.

- Plain, short, active: "Ask service provider for help", "Pause daily emails", "Resume daily emails", "Send now", "Mark as fixed", "Move to another department", "Return to ICU", "Upload manual", "Print label".
- Button and result match: "Pause daily emails" → "Daily emails paused".
- Never show: asset, ticket, work order, vendor, supplier, record, ID (say "number"), null, invalid, error codes, code status names.
- Dates: one calendar for the whole system, chosen in Settings: "12 Mangsir 2083" (Nepali, default) or "28 Nov 2026" (English). Moments add Nepal time: "12 Mangsir 2083, 09:15". Near dates: Today, Tomorrow, In 3 days, 2 days overdue, Down for 4 days.
- Errors say what happened and what to do: "Shrestha Medical has no service email yet. Add one on their page, or add an email address here."
- Empty screens point to the next step: "No manuals for this model yet. Upload manual."
- Meta lines as label and value ("S.N. 778120"), not strings joined by dots or dashes.
- No exclamation marks, no "Oops", no "successfully".

## 10. The one distinctive element

The logo's rising diagonal cut, in two places only:
- **Sign-in**: the owner's photo (BMServ on phone, tablet and desktop in a Biomedical Department) fills the left half on desktop, or a band across the top on phone and tablet (the wider photo there). Beside or below it, one rising diagonal, white above and navy below, behind the form box with the colour logo.
- **Printed label**: a small navy diagonal corner mark.

Nowhere else.

## 11. Motion

Sheets slide in 160 ms, dialogs fade 120 ms, a saved row flashes `--teal-wash` once. Nothing moves on its own. Respect reduced motion.

## 12. Access

Keyboard reachable; visible focus (2 px navy outline, 2 px offset; teal on navy). Real labels on fields. Pills always carry the word. Works from 320 px; text enlarges to 200 % without loss.

## 13. Do not

No charts beyond the Home overview, and no chart library. No dual axes, pies or 3D. No shadow cards, glass, gradients, emoji. No all-capitals labels, no arrows inside buttons or links. No placeholder used as label. No modal over a modal. No new colour, typeface or corner size without adding it here first.

## 14. Logo files

Three original PNGs in `assets/logos/`, identified by look (the app uses copies cropped to the artwork):
- Colour on white (navy letters, teal cut, "by Infobytes Nepal") → sign-in screen.
- White on transparent → top bar and sidebar on navy.
- White on a navy circle → PWA icons (with safe padding), favicon.

Copies in `web/public/brand/`: `logo-colour.png`, `logo-white.png` (cropped), `logo-circle.png`, PWA icons (`icon-192`, `icon-512`, `icon-maskable-512`, `apple-touch-icon`), `favicon-48.png`; `web/public/favicon.ico`. Sign-in photos: originals in `assets/images/`, compressed copies `signin-hero.jpg` (tall, desktop) and `signin-hero-wide.jpg` (phone, tablet). Leave the originals where they are.
