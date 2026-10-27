# Gamut Repair — Full Plan

Repair and quality tracking for a home-appliance factory.
Desktop app on several PCs, central server inside the factory.
Languages: **French, Arabic, English**. First appliance: **washing machine**.

---

## 1. Summary

Every unit coming off the production line (one line) goes to the **test room**,
where it is **scanned and tested** — no exceptions. The serial number tells the
app the **model and the color**, so nothing has to be typed.

- **Test OK** → the unit passes through. The pass is recorded.
- **Test not OK** → the tester records what failed. A **repair ticket** opens
  automatically and the unit goes to a **repairman**.
- The repairman logs the repair (what he did, on which part, which spare parts)
  and sends the unit **back to the test room**.
- The unit is tested again. Pass → released. Fail → back to repair, as many
  times as needed.

Everything is recorded: every test, every repair, who did it, when, and on
which PC. Open any serial number and you see its **full history**. Open any
repairman or tester and you see **everything they did**.

Products are **not in the ERP**, so models and colors are **added manually** in
the app (once). After that, every scan is recognized automatically.

---

## 2. The flow

```
 PRODUCTION LINE
       ↓
 [ TEST ROOM ]  scan serial → test
       ↓
   OK? ── yes ──► PASSED → released ✅
       │
       no  (failed checks + defect)
       ↓
 [ REPAIR ]  repair ticket opens automatically
   repairman: diagnose → repair → log parts
       ↓  "Send back to test room"
 [ TEST ROOM ]  retest
       ↓
   OK? ── yes ──► PASSED after repair → released ✅
       │
       no ──► back to the same repairman (attempt 2, 3…)

 Supervisor can SCRAP a unit at any point (reason required).
```

Rules:
- The test room is the **only** place that can pass or fail a unit.
- A repairman **cannot** pass a unit — it must always go back to the test room.
- A unit has **at most one open repair ticket** at a time.
- After **3 failed retests** (configurable), the supervisor is alerted.
- If a unit that already passed comes back again later, the app shows a
  **"Repeat repair"** warning with its earlier history.

---

## 3. The three interfaces

Each PC is set up once as one type of station. After login it opens directly on
its own interface. Supervisors and admins also get **Reports** and **Settings**.

### 3.1 Quality interface — test room PC

The busiest screen: it must be **fast** (scan → result in a few seconds).

- **Scan box** always active (barcode scanner).
- After scan:
  - **New serial** → unit is created; **model and color are read from the serial**
    (see §3.4). If the model or color code is unknown, the app asks to add it
    (supervisor/admin) — that's how new products get added manually.
  - **Known serial** → shows whether it's a first test or a **retest after
    repair**, and what the repairman did.
- **Checklist** with big ✓ / ✗ buttons (and number fields for measurements).
- **PASS** button (one click when everything is OK).
- **FAIL** → pick failed checks + defect code + optional note/photo →
  repair ticket is created automatically.
- Side panels: **retest queue** (units coming back from repair), today's counts
  (tested / passed / failed), my last 20 scans (to correct a mistake quickly).

### 3.2 Repairman interface — repair PCs

- **My queue**: tickets assigned to me, **returned from test again** shown first in red.
- **Waiting for a repairman**: new failed units to **claim**.
- **Waiting for parts**.
- **Repair screen** (scan or click a unit):
  - Top: what the test room found (failed checks, defect, tester's note, photos).
  - Unit's past history (earlier repairs, repeat-repair warning).
  - Log **diagnosis** (actual fault found).
  - Log **repair actions**: part of the machine → what was done (replaced,
    adjusted, cleaned…) → spare parts used → time.
  - Button **"Send back to test room"** (needs at least one repair action).
- My day: units repaired, average time, how many failed the retest.

### 3.3 Production line dashboard — big screen near the line (read-only)

Live view, refreshes automatically, readable from a distance. No login needed
(the PC is set up as a display station).

- **Today / this shift**: units tested, passed first time, failed, repaired and
  passed, scrapped.
- **First-pass yield %** (passed on first test ÷ tested) vs **target**, colored
  green / orange / red.
- **Units by hour** chart (tested vs failed).
- **Top 5 defects** today — so the line can fix the root cause.
- **Currently in repair** and **waiting for retest** counts; oldest unit in repair.
- **By model and color** running on the line today.
- One dashboard for the line (one production line). Language chosen on the
  screen; can rotate between FR / AR / EN.

### 3.4 Reading the serial number (model + color)

The serial number contains the **model code** and the **color code**. An admin sets
the rule once, for example:

```
Serial:   WM8F  14  W  26 10 000123
          │     │   │  │  │  └── running number
          │     │   │  │  └──── month
          │     │   │  └─────── year
          │     │   └────────── color code   (W = White)
          │     └────────────── variant
          └──────────────────── model code   (WM8F = 8 kg front-load)
```
*(Example only — we'll use your real serial format.)*

- The rule is **configurable** (positions or pattern), so a format change doesn't
  need a new app version.
- **Model code → model**, **color code → color**, both from tables you fill in
  manually (with names in FR / AR / EN).
- If the serial also holds the **production date**, we read it too.
- **Unknown model or color code** → the scan is held with a clear message
  ("Model code WM9X not found — add it?"), so no unit is saved with a wrong model.
- **Invalid serial** (wrong length / bad scan) → rejected with a beep, so the
  tester rescans.
- The same serial **can't be created twice**; scanning it again finds the existing unit.

### 3.5 Supervisor / admin (any PC, by login)

- **Reports** (§8) and **search** by serial, ticket, model, person, defect, date.
- **Unit page**: full timeline of tests and repairs.
- **Person page**: what each repairman / tester did, with filters.
- **Settings**: users, stations, models, colors, serial number rule, categories, defect codes, components,
  repair actions, spare parts, test checklist, targets, translations.

---

## 4. Roles

| Role | Works at | Can do | Cannot do |
|---|---|---|---|
| **Quality tester** | Test room PC | Scan, test, pass / fail, add defect + photos | Log repairs |
| **Repairman** | Repair PCs | Claim tickets, diagnose, log repairs and parts, send back to test | Pass or fail a unit |
| **Supervisor** | Any PC | Everything above, reassign, scrap, reports | — |
| **Admin** | Any PC | Users, stations, catalogs, translations, targets | — |
| *(Line display)* | Big screen | View only | Everything else |

Login: **employee ID + PIN** (or employee badge scan). The app locks itself after
inactivity so the next person doesn't work under someone else's name.

---

## 5. Three languages: French, Arabic, English

- Each user picks a language; it's saved with their profile. The login screen
  has a quick FR / ع / EN switch.
- **Arabic shows right-to-left**: the whole layout flips (menus, tables, forms).
  This is built in from the start, not added later.
- **All lists are translated**, not only the buttons: defect codes, components,
  repair action types, checklist items, statuses. Each has a name in FR, AR, EN.
  So a tester can fail a unit in Arabic and the repairman reads it in French.
- **Codes stay the same in every language** (e.g. `WM-DR01`), so people can always
  talk about the same defect.
- **Free-text notes** stay in whatever language they were typed.
- **Exports and printed reports** come out in the language of the person who prints them.
- Numbers use 0–9 digits in all languages; dates in DD/MM/YYYY.
- Fonts that support Arabic and French accents (e.g. Noto Sans + Noto Sans Arabic).
- An admin screen to **edit translations** without a new app version.

---

## 6. Data model

```
Category (Washing Machine)
  └── Model (added manually)
        └── Unit (one machine, by serial number → model + color)
              ├── Tests (every test: first test, retests)
              │     └── Check results (each checklist item)
              └── Repair tickets (opened when a test fails)
                    ├── Diagnosis
                    ├── Repair actions → Parts used
                    ├── Photos
                    └── Status history
```

### 6.1 Tables

**categories** — `id`, `code` (WM), `name` (FR/AR/EN), `active`

**category_attributes** — extra fields per category
- `id`, `category_id`, `name` (FR/AR/EN), `type` (text / number / list), `options`, `required`
- Washing machine: load type (front / top), capacity (kg), max spin (rpm), energy class, inverter (yes/no)

**models** — added manually
- `id`, `category_id`, `brand`, `model_number`, `name`, `serial_model_code` (the code inside the serial), `attribute_values`, `active`

**colors** — added manually
- `id`, `serial_color_code` (e.g. W), `name` (FR/AR/EN — e.g. Blanc / أبيض / White), `active`

**serial_rules** — how to read a serial (set by admin)
- `id`, `category_id`, `pattern` (positions or pattern for model code, color code, date, number), `example`, `active_from`

**units** — created the first time a serial is scanned in the test room
- `id`, `serial_number` (unique), `model_id`, `color_id` (both read from the serial), `production_date` (from serial, if present)
- `status` (In test / Passed / In repair / Waiting for retest / Scrapped)
- `first_scanned_at`, `released_at`, `first_pass` (yes/no — passed on first test)

**stations** — every PC
- `id`, `name` ("Test room", "Repair 1", "Line display 1"), `type` (Quality / Repair / Display), `language` (for displays), `active`

**users** — `id`, `employee_id`, `full_name`, `roles`, `language`, `shift`, `pin_hash`, `active`

**tests** — one row per test
- `id`, `unit_id`, `attempt_no` (1 = first test, 2+ = retest), `tested_by`, `station_id`, `tested_at`
- `result` (Pass / Fail), `defect_code_id` (if fail), `notes`
- `repair_ticket_id` (the ticket this test opened, or the ticket being re-tested)

**checklist_items** — test checklist per category
- `id`, `category_id`, `name` (FR/AR/EN), `type` (OK/Not OK or measured), `min`, `max`, `unit`, `order`

**check_results** — `id`, `test_id`, `checklist_item_id`, `ok`, `value`

**defect_codes** — `id`, `category_id`, `code`, `name` (FR/AR/EN), `component_group`

**repair_tickets** — opened automatically by a failed test
- `id`, `ticket_number` (R-2026-000123), `unit_id`, `opened_by_test_id`
- `assigned_to`, `status`, `opened_at`, `closed_at`
- `outcome` (Repaired & passed / Scrapped)

**diagnoses** — actual fault found by the repairman
- `id`, `ticket_id`, `defect_code_id`, `notes`, `diagnosed_by`, `diagnosed_at`

**components** — `id`, `category_id`, `name` (FR/AR/EN)

**action_types** — Replaced / Repaired / Adjusted / Cleaned / Re-wired / Software reflash / Tightened / Inspected only (FR/AR/EN)

**repair_actions** — *who did what on what*
- `id`, `ticket_id`, `repairman_id`, `station_id`, `component_id`, `action_type_id`
- `description`, `started_at`, `ended_at`, `duration_min`

**parts** — `id`, `part_number`, `name` (FR/AR/EN), `component_id`

**parts_used** — `id`, `repair_action_id`, `part_id`, `quantity`, `old_part_serial`, `new_part_serial`

**attachments** — `id`, `unit_id`, `test_id` or `ticket_id`, `storage_key` (file on server), `caption`, `uploaded_by`, `uploaded_at`

**status_history** — automatic, never edited: `ticket_id`/`unit_id`, `from`, `to`, `changed_by`, `changed_at`, `comment`

**audit_log** — automatic record of every create / edit (who, what, when, old → new)

**targets** — e.g. first-pass yield target per line / model

**translations** — interface texts in FR / AR / EN (editable by admin)

Every editable table also has `updated_at`, `updated_by` and a `version` number
(stops two PCs from overwriting each other).

> Records are **never deleted**. A mistake is corrected with a new entry or a
> "void" flag (with reason), so history stays trustworthy.

### 6.2 Ticket statuses

`WAITING FOR REPAIRMAN` → `IN REPAIR` ⇄ `WAITING FOR PARTS` → `WAITING FOR RETEST`
→ (test room) → `CLOSED – PASSED` or back to `IN REPAIR` · any → `SCRAPPED` (supervisor)

---

## 7. Washing machine starter data

Starting point only — to be replaced with your real lists (and translated).

### 7.1 Components
Door lock · Door seal · Door hinge · Drum · Tub · Bearings & seal · Spider arm ·
Drive belt · Motor · Carbon brushes · Tacho / hall sensor · Drain pump · Drain hose ·
Inlet valve · Inlet hose · Pressure switch / level sensor · Heater · NTC sensor ·
Main PCB · Display / UI board · Wiring harness · Shock absorbers · Springs ·
Counterweight · Detergent drawer · Filter · Power cord / EMI filter · Cabinet / panels · Feet

### 7.2 Defect codes (examples)
| Code | English | Français | العربية |
|---|---|---|---|
| WM-DL01 | Door does not lock | La porte ne se verrouille pas | الباب لا يُقفل |
| WM-DR01 | Does not drain | Ne vidange pas | لا يصرّف الماء |
| WM-IN01 | Does not fill | Ne se remplit pas | لا يمتلئ بالماء |
| WM-LK01 | Water leak | Fuite d'eau | تسرّب الماء |
| WM-HT01 | Not heating | Ne chauffe pas | لا يسخّن |
| WM-MT01 | Drum does not turn | Le tambour ne tourne pas | الحوض لا يدور |
| WM-SP01 | Does not spin | N'essore pas | لا يعصر |
| WM-NV01 | Noise / vibration | Bruit / vibration | ضجيج / اهتزاز |
| WM-EL01 | No power | Pas d'alimentation | لا يشتغل |
| WM-UI01 | Display / buttons fault | Défaut afficheur / boutons | عطل في الشاشة / الأزرار |
| WM-CS01 | Cosmetic damage | Défaut d'aspect | عيب في المظهر |

*(Arabic/French wording to be checked by your team — factory terms vary.)*

### 7.3 Test checklist
Power on · Door lock / unlock · Water fill · Heating · Rotation both directions ·
Drain · Spin at max rpm · Noise / vibration · No leaks · No error codes ·
Visual / cosmetic.

---

## 8. Reports & KPIs

- **First-pass yield (FPY)** — % of units that pass on the first test, by day / shift / model / color
- **Units tested / passed / failed / scrapped** per hour, shift, day, month
- **Top defects** — overall, by model, by color, by period (Pareto chart)
- **Top replaced components and spare parts**
- **Retest fail rate** — repairs that failed the retest, by repairman
- **Repair time** — waiting for repairman, hands-on time, total time in repair
- **Waiting for retest** — how long repaired units wait for the test room
- **Repeat repairs** — units repaired more than once
- **Per person** — tester: units tested; repairman: units repaired, avg time, retest fails
- Export to **Excel / CSV**; print unit history or reports as **PDF** (in the user's language)

---

## 9. Architecture — central server, many PCs

```
  Test room PC        ─┐
  Repair PC 1, 2, …   ─┤                  FACTORY SERVER
  Line dashboard (TV) ─┼──── network ──►  ┌────────────────────────┐
  Supervisor PC       ─┘                  │ Gamut API server       │
                                          │ PostgreSQL database    │
     desktop app on each PC               │ Photos / files         │
                                          │ Nightly backups        │
                                          └────────────────────────┘
```

- PCs talk only to the **API server**, never directly to the database:
  the database password stays on the server, and all rules are enforced in one place.
- **Live updates**: a fail in the test room appears instantly in the repair
  queue; the line dashboard updates on its own.
- **Two people on the same record**: version check → "changed by someone else, reload".
- **Server unreachable**: red banner, saving blocked — nothing gets lost or split.
- **Linux or Windows server**: still to decide. Everything runs in **Docker**,
  so it works on both. Linux (Ubuntu Server) is recommended: free, lighter,
  Docker runs natively. Windows Server works too (Docker Desktop / WSL2) if your
  IT team prefers to manage Windows.

---

## 10. Tech stack

| Layer | Choice |
|---|---|
| Desktop app | **Electron + React + TypeScript** (Windows PCs) |
| UI components | **Mantine** (built-in right-to-left support for Arabic) |
| Languages | **i18next** (FR / AR / EN), translations stored on the server |
| API server | **Node.js + Fastify + TypeScript** |
| Database | **PostgreSQL 16** |
| Data access | **Drizzle ORM** + versioned migrations |
| Validation | **Zod** (shared by app and server) |
| Live updates | WebSocket / Server-Sent Events |
| Charts (dashboard, reports) | ECharts |
| Server install | **Docker Compose** (API + database + backup job) |
| Backups | Nightly database dump + photos, kept 30 days, copied to a second disk / NAS |
| Exports | `exceljs` (Excel), print-to-PDF |
| Labels (later) | QR / barcode via `bwip-js` |
| Tests | Vitest (rules, API), Playwright (screens, including Arabic layout) |
| Installer & updates | electron-builder; updates come **from the factory server** |

---

## 11. Project structure

```
gamut/
├── apps/
│   ├── desktop/               # Electron app installed on each PC
│   │   ├── electron/          # window, station setup, printing, auto-update
│   │   └── src/
│   │       ├── quality/       # test room interface
│   │       ├── repair/        # repairman interface
│   │       ├── line-dashboard/# production line big screen
│   │       ├── supervisor/    # reports, search, settings
│   │       └── i18n/          # fr.json, ar.json, en.json
│   └── server/                # API, login, live updates, file uploads
├── packages/
│   ├── core/                  # rules: flow, statuses, who can do what (shared)
│   └── db/                    # database schema, migrations, starter data
├── deploy/
│   ├── docker-compose.yml
│   └── backup/
└── docs/
```

---

## 12. Build roadmap

### Phase 0 — Setup (1 week)
- [ ] Project skeleton (desktop app + server + shared packages)
- [ ] Database schema + starter washing machine data (FR / AR / EN)
- [ ] Three-language setup with Arabic right-to-left working from day one
- [ ] Docker setup; CI checks on every push

### Phase 1 — Core flow (3–4 weeks)
- [ ] Login (employee ID + PIN), auto-lock, station setup per PC
- [ ] Admin: users, stations, **models and colors (manual entry)**, defect codes, components, actions
- [ ] **Serial number rule** → model + color detected on every scan
- [ ] **Quality interface**: scan → pass / fail with defect (simple checklist)
- [ ] Failed test → **repair ticket opens automatically**
- [ ] **Repairman interface**: queue, claim, diagnosis, repair actions, send back to test
- [ ] Retest loop + alert after 3 fails
- [ ] Unit history page + person page + search
- [ ] Live updates between PCs; edit-conflict protection
- [ ] Nightly backup + tested restore
- [ ] **Pilot** on the server + test room PC + 1–2 repair PCs for 1 week

✅ End of Phase 1: every unit tested, every repair logged, who did what, full history — in 3 languages.

### Phase 2 — Line dashboard & details (2 weeks)
- [ ] **Production line dashboard** (live FPY, hourly chart, top defects, in repair)
- [ ] Full checklist with measured values (min/max)
- [ ] Spare parts used
- [ ] Photos from test room and repair
- [ ] Repeat-repair warning

### Phase 3 — Reports & roll-out (2 weeks)
- [ ] All KPI reports (§8), Excel / PDF export in each language
- [ ] Translation editor for admins
- [ ] Targets (FPY) per model
- [ ] Audit log viewer
- [ ] Installer + auto-update from the server; roll out to all PCs
- [ ] Short training guide in FR / AR / EN

### Phase 4 — Later
- [ ] More appliance categories (dryer, dishwasher, fridge, AC…) — data only
- [ ] Spare-parts stock and low-stock alerts
- [ ] Repair tag / label printing
- [ ] Login with company accounts (Active Directory)
- [ ] Link with the ERP if products get added there

---

## 13. What YOU need to prepare

### Data
1. **Washing machine models** — brand, model number, load type, capacity, spin rpm
   (Excel sheet is fine; we'll import it).
2. **Serial number format** — **10–20 real serials** (different models and colors)
   and an explanation of each part: where the model code is, where the color code
   is, and whether the date is inside. A photo of the barcode label helps too.
3. **List of model codes** (code in the serial → model) and **color codes**
   (code → color name in FR / AR / EN).
4. **People** — employee ID, name, shift, role (tester / repairman / supervisor).
5. **Your real defect codes** with names in FR / AR / EN.
6. **Your test checklist** — and min/max for any measured values.
7. **Component list and spare parts** (part number + name).
8. **Current paper forms / Excel** used in the test room and repair area today.
9. **FPY target** for the line (e.g. 95% pass on first test) and shift times.

### Server & network (with IT)
10. **Server or VM**: 4 CPU cores, 8 GB RAM, 100 GB SSD. **Choose Linux or Windows.**
11. A **fixed address** for the server (static IP or name like `gamut.factory.local`).
12. **Firewall**: one port open from the PCs to the server.
13. **Backup location**: second disk, NAS or network share.
14. Who has **admin access** to the server.

### Hardware
15. **Test room PC** + **USB barcode scanner** (essential — every unit is scanned).
    A scanner with a stand (hands-free) is faster for high volume.
16. **Repair PCs** — how many; a scanner at each is recommended.
17. **One big screen (TV) + mini-PC** for the production line dashboard.
18. Windows 10/11 PCs, 8 GB RAM, 22"+ screens.
19. Optional: webcam / tablet for photos.

---

## 14. Decisions

| # | Decision | Status |
|---|---|---|
| 1 | Several PCs, central server in the factory | ✅ |
| 2 | PCs → API server → database (no direct database access) | ✅ |
| 3 | Units enter through the **test room**; fail → repair → retest | ✅ |
| 4 | Three interfaces: **quality, repairman, production line dashboard** (+ supervisor/admin) | ✅ |
| 5 | Languages **FR / AR / EN**, Arabic right-to-left | ✅ |
| 6 | Server OS: Linux or Windows | ⏳ Open — works on both (Docker); Linux recommended |
| 7 | Every unit goes through the test room | ✅ |
| 8 | Serial number contains **model + color** → read automatically | ✅ (need your real format) |
| 9 | One production line → one line dashboard | ✅ |
| 10 | Failed retest goes back to the same repairman | ✅ Default (supervisor can reassign) |
| 11 | Offline mode if server down | Not planned — saving blocked with a warning |

---

## 15. Definition of done (Phase 1)

- In the test room, a tester scans a unit and passes it in **under 10 seconds**,
  with model and color filled in automatically from the serial.
- A fail creates a repair ticket that shows up **instantly** on the repair PCs.
- A repairman logs the repair and sends it back; it appears in the test room's retest queue.
- Searching a serial shows every test, every repair, every person and every
  status change for that unit.
- The whole app works in **French, Arabic (right-to-left) and English**, including
  defect codes and checklist items.
- No record can be silently deleted; every change is traceable.
- The database is backed up every night, and a restore has been tested.
