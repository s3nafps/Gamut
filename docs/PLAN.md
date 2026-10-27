# Gamut Repair — Full Plan

Desktop repair-tracking system for a home-appliance factory.
Starting appliance: **washing machine**.

---

## 1. What the app must do (in one paragraph)

When a washing machine arrives at the repair area, someone **registers it**
(scans or types its serial number; if the model is new, adds the model by hand).
A **repair ticket** is opened with the reported problem. A **technician** picks it
up, diagnoses it, and logs every **repair action** (what component, what was done,
which parts were used, how long it took). The unit is **tested**. If it passes,
the ticket is closed; if it fails, it goes back to repair. Every step is recorded,
so you can open any unit and see its **complete repair history**, or open any
technician and see **everything they repaired**.

---

## 2. Core questions the app answers

| Question | Where it's answered |
|---|---|
| Who repaired this unit? | Unit page → history timeline |
| What exactly was done to it? | Ticket → repair actions list |
| What was the fault? | Ticket → diagnosis (fault code + notes) |
| Has this unit been repaired before? | Unit page → all tickets (repeat repair warning) |
| What did technician X work on today / this month? | Technician page |
| Which faults happen most on model Y? | Reports → top faults by model |
| How many units are waiting right now, and where? | Dashboard → status board |
| How long do repairs take? | Reports → average repair time |

---

## 3. Users and roles

| Role | Can do |
|---|---|
| **Technician** | Open/claim tickets, log diagnosis and repair actions, mark ready for test |
| **QC / Tester** | Record test results (pass / fail + reason) |
| **Supervisor** | Everything above + assign tickets, close/scrap units, see all reports |
| **Admin** | Manage users, appliance categories, models, fault codes, components, parts |

Phase 1 can start with a simple "pick your name + PIN" login. Real passwords and
permissions come in a later phase.

---

## 4. Main concepts (the data model)

The design is **generic**: "Washing machine" is just the first *category*.
Adding fridges later = adding data, not rewriting code.

```
Category (Washing Machine)
  └── Model (e.g. WM-8KG-FL-1400)        ← added manually
        └── Unit (one physical machine, by serial number)
              └── Repair Ticket (one visit to the repair area)
                    ├── Diagnosis (fault codes found)
                    ├── Repair Actions (what was done, by whom)
                    │     └── Parts Used
                    ├── Test Results
                    ├── Attachments (photos)
                    └── Status History (every status change, who, when)
```

### 4.1 Tables

**categories** — appliance types
- `id`, `name` (Washing Machine), `code` (WM), `active`

**category_attributes** — extra fields per category (so each appliance type can have its own specs)
- `id`, `category_id`, `name` (e.g. "Capacity (kg)"), `type` (text / number / list), `options` (for lists), `required`
- Washing machine examples: Load type (Front / Top), Capacity (kg), Max spin (rpm), Energy class, Inverter motor (yes/no)

**models** — product models, entered manually
- `id`, `category_id`, `brand`, `model_number`, `name`, `notes`, `active`, `created_by`, `created_at`
- `attribute_values` (the values for the category attributes above)

**units** — each individual machine
- `id`, `model_id`, `serial_number` (unique), `production_date` (optional), `source`
  (Production line reject / End-of-line test fail / Customer return / Warehouse damage / Other),
  `current_status`, `created_by`, `created_at`, `notes`

**technicians / users**
- `id`, `employee_id`, `full_name`, `role`, `skill_level`, `shift`, `pin_hash`, `active`

**repair_tickets** — one per repair visit
- `id`, `ticket_number` (e.g. R-2026-000123), `unit_id`
- `reported_problem` (free text), `reported_by`, `received_at`
- `priority` (Low / Normal / High / Urgent)
- `assigned_to` (technician), `status`
- `opened_at`, `closed_at`, `outcome` (Repaired / Scrapped / Returned unrepaired / No fault found)

**fault_codes** — catalog of known faults per category
- `id`, `category_id`, `code`, `description`, `component_group`

**ticket_faults** — faults found during diagnosis
- `id`, `ticket_id`, `fault_code_id`, `notes`, `diagnosed_by`, `diagnosed_at`

**components** — catalog of components per category (what gets repaired)
- `id`, `category_id`, `name` (Drain pump, Door lock, Motor, Main PCB…)

**action_types** — Replaced / Repaired / Adjusted / Cleaned / Re-wired / Software reflash / Tightened / Inspected only

**repair_actions** — the core log: *who did what on what*
- `id`, `ticket_id`, `technician_id`, `component_id`, `action_type_id`
- `description` (free text), `started_at`, `ended_at`, `duration_min`

**parts** — spare parts list (optional stock in later phase)
- `id`, `part_number`, `name`, `category_id`, `component_id`, `unit_cost` (optional)

**parts_used**
- `id`, `repair_action_id`, `part_id`, `quantity`, `old_part_serial` (optional), `new_part_serial` (optional)

**test_results**
- `id`, `ticket_id`, `tested_by`, `tested_at`, `result` (Pass / Fail), `checklist` (which checks passed), `notes`

**attachments**
- `id`, `ticket_id`, `storage_key` (file kept on the server), `caption`, `uploaded_by`, `uploaded_at`

**status_history** — automatic, never edited
- `id`, `ticket_id`, `from_status`, `to_status`, `changed_by`, `changed_at`, `comment`

**audit_log** — automatic record of any create/edit/delete (who, what, when, old value, new value)

> Every editable table also has `updated_at`, `updated_by` and a `version` number
> (used to stop two PCs from overwriting each other — see §9.2).

> Rule: repair records are **never hard-deleted**. Mistakes are corrected with a new
> entry or a "void" flag, so history stays trustworthy.

---

## 5. Repair workflow (ticket statuses)

```
 RECEIVED ──► DIAGNOSING ──► WAITING FOR PARTS ──┐
                  │                              │
                  └──────────► IN REPAIR ◄───────┘
                                  │
                                  ▼
                               TESTING ──── fail ───► back to IN REPAIR
                                  │
                                pass
                                  ▼
                               CLOSED (Repaired)

 Any status ──► SCRAPPED  (supervisor only, reason required)
 DIAGNOSING ──► CLOSED (No fault found)
```

- Every status change is saved in `status_history` with who/when.
- A unit can have **only one open ticket at a time**.
- If a unit comes back after being closed, a **new ticket** is opened and the app
  shows a **"Repeat repair"** warning with the previous tickets.

---

## 6. Washing machine starter data

You'll refine these with your technicians — they are a starting point so the
app isn't empty on day one.

### 6.1 Components
Door lock / interlock · Door seal (gasket) · Door hinge · Drum · Tub ·
Bearings & seal · Spider arm · Drive belt · Motor (universal / inverter) ·
Carbon brushes · Tacho / hall sensor · Drain pump · Drain hose · Inlet valve ·
Inlet hose · Pressure switch / level sensor · Heater element · NTC temperature sensor ·
Main PCB (control board) · Display / user-interface board · Wiring harness ·
Shock absorbers · Suspension springs · Counterweight · Detergent drawer ·
Filter · Power cord / EMI filter · Cabinet / panels · Feet / leveling

### 6.2 Fault codes (example list — replace with your brand's real codes)
| Code | Description | Component group |
|---|---|---|
| WM-DL01 | Door does not lock | Door lock |
| WM-DR01 | Water does not drain | Drain pump / filter / hose |
| WM-IN01 | Water does not fill | Inlet valve / pressure switch |
| WM-LK01 | Water leak | Seal / hoses / tub |
| WM-HT01 | Water not heating | Heater / NTC |
| WM-MT01 | Drum does not turn | Motor / belt / PCB |
| WM-SP01 | Does not spin | Motor / tacho / unbalance |
| WM-NV01 | Excessive noise / vibration | Bearings / shocks / counterweight |
| WM-EL01 | No power / dead | Power cord / PCB / EMI filter |
| WM-UI01 | Display / buttons fault | UI board |
| WM-CS01 | Cosmetic damage | Cabinet / panels |
| WM-NF00 | No fault found | — |

### 6.3 Post-repair test checklist
Power on · Door lock / unlock · Water fill · Heating (temp rise) · Wash rotation
both directions · Drain · Spin at max rpm · Noise/vibration OK · No leaks ·
Error memory cleared · Visual / cosmetic check.

---

## 7. Screens

1. **Login** — select name, enter PIN.
2. **Dashboard** — counts per status (board / kanban style), my open tickets,
   overdue tickets, today's closed repairs.
3. **Receive unit** (the fastest screen — used all day)
   - Scan or type serial → if known, show model + history; if new, pick model
     (or **"+ Add new model"** inline) → enter problem → create ticket.
4. **Ticket page**
   - Header: ticket #, unit serial, model, status, assigned technician, priority.
   - Tabs: Diagnosis · Repair actions · Parts used · Tests · Photos · Timeline.
   - Big buttons for the next allowed status ("Start repair", "Send to test", …).
5. **Unit page** — specs, every ticket ever opened, full timeline, repeat-repair badge.
6. **Technician page** — tickets worked, actions logged, time spent, filter by date.
7. **Search** — by serial, ticket #, model, technician, fault, date range.
8. **Reports** (see §8).
9. **Admin / Settings** — categories & attributes, models, fault codes, components,
   action types, parts, users, backup.

Design notes for the factory floor:
- Large fonts and buttons (gloves, distance from screen).
- Keyboard + barcode-scanner friendly (a USB scanner types like a keyboard, so the
  serial field just needs focus).
- Minimum typing: pick from lists, free text only for notes.
- Runs entirely on the factory network — no internet needed.

---

## 8. Reports & KPIs

- **Open repairs by status** (live)
- **Repairs closed** per day / week / month
- **Average repair time** (received → closed) and **hands-on time** (sum of actions)
- **Top faults** — overall, by model, by period
- **Top replaced components / parts**
- **Repeat repair rate** — units that came back within N days
- **First-time pass rate** — tickets that passed the first test
- **Technician summary** — tickets closed, avg time, re-work rate
- **Scrap rate** and scrap reasons
- Export everything to **Excel / CSV**; print a ticket / unit history as **PDF**.

---

## 9. Architecture — central server, many PCs

The app runs on **several PCs** in the factory. The **database, the catalogs
(categories, models, fault codes, components, parts) and all repair data live on
one server inside the factory**. Every PC sees the same data at the same time.
No internet is needed — everything stays on the company network.

```
   Repair bench PC 1 ─┐
   Repair bench PC 2 ─┤                 FACTORY SERVER
   QC / test PC     ──┼──── LAN ────►  ┌──────────────────────────┐
   Supervisor PC    ──┤                │  API server (Gamut API)  │
   Receiving PC     ─┘                 │        │                 │
                                       │  PostgreSQL database     │
     (desktop app on each PC)          │  Photo / file storage    │
                                       │  Nightly backups         │
                                       └──────────────────────────┘
```

### 9.1 Why an API server in the middle (instead of each PC talking to the database directly)
- **Security:** the database password lives only on the server, not on every PC.
- **One set of rules:** "one open ticket per unit", allowed status changes,
  required fields and the audit log are enforced in one place — no PC can bypass them.
- **Easy updates:** most changes happen on the server; PCs just get a new app version.
- **Live updates:** the server pushes changes to every PC, so the dashboard and
  status board refresh automatically when someone else updates a ticket.
- **Files:** photos are uploaded to the server, so every PC can see them.

### 9.2 Multi-user rules
- **Two people editing the same ticket:** each record has a `version` number.
  If someone else saved first, the app says *"This ticket was changed by Ahmed
  2 minutes ago — reload"* instead of silently overwriting.
- **Claiming:** a technician "claims" a ticket so two people don't work on the same unit.
- **Unique numbers:** ticket numbers (R-2026-000123) are generated by the server,
  so two PCs can never create the same number.
- **Server unreachable:** the app shows a clear red banner ("No connection to
  server — changes not saved") and blocks saving, so no data is lost or split.
  (Offline mode with later sync is possible but adds a lot of complexity — not planned.)
- **Login is per person, not per PC:** any technician can log in on any bench.
  The app auto-locks after inactivity so the next person doesn't log actions
  under someone else's name.

---

## 10. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Desktop app | **Electron + React + TypeScript** | Windows PCs on the floor, easy installer, fast to build forms/tables |
| UI components | Mantine (or shadcn/ui) | Ready-made tables, forms, dialogs |
| API server | **Node.js + Fastify + TypeScript** | Same language as the app; business rules shared |
| Database | **PostgreSQL 16** | Reliable, multi-user, free |
| Data access | **Drizzle ORM** + versioned migrations | Type-safe, controlled schema changes |
| Validation | **Zod** (shared between app and server) | Same rules on both sides |
| Live updates | WebSocket / Server-Sent Events | Dashboards refresh on every PC |
| Auth | Employee ID + PIN/password, sessions with tokens, roles | |
| Files/photos | Folder on the server (or MinIO later) | |
| Deployment on server | **Docker Compose** (API + Postgres + backup job) | One command to install/upgrade; easy for IT |
| Backups | Nightly `pg_dump` + photo folder copy, kept 30 days, copied to a second disk/NAS | |
| Reports export | `exceljs` (Excel), print-to-PDF | |
| Labels | QR / Code128 via `bwip-js` on a label printer | Repair tag on the unit |
| Tests | Vitest (rules, API), Playwright (screens) | |
| App installer & updates | electron-builder; updates downloaded **from the factory server** | No internet needed |

---

## 11. Project structure (when we start coding)

```
gamut/
├── apps/
│   ├── desktop/             # Electron + React app installed on each PC
│   │   ├── electron/        # window, settings (server address), printing, auto-update
│   │   └── src/pages/       # Dashboard, Receive, Ticket, Unit, Technician, Reports, Admin
│   └── server/              # Fastify API: routes, auth, live updates, file uploads
├── packages/
│   ├── core/                # business rules: statuses, allowed transitions, validation (shared)
│   └── db/                  # Drizzle schema, migrations, seed data (washing machine catalog)
├── deploy/
│   ├── docker-compose.yml   # API + PostgreSQL + backup job
│   └── backup/              # backup & restore scripts
├── docs/
└── package.json
```

The desktop app never touches the database. It calls the API
(e.g. `POST /tickets`, `POST /tickets/:id/actions`, `POST /tickets/:id/tests`),
and the server applies the rules from `core` and writes the audit log.

---

## 12. Build roadmap

### Phase 0 — Setup (1 week)
- [ ] Create the project (desktop app + API server + shared packages)
- [ ] PostgreSQL + Drizzle schema, first migration
- [ ] Seed: Washing Machine category, attributes, components, fault codes, action types
- [ ] Docker Compose for the server; run everything locally for development
- [ ] CI: lint, typecheck, tests on every push

### Phase 1 — MVP: track repairs (3–4 weeks)
- [ ] Login with employee ID + PIN, auto-lock after inactivity
- [ ] Desktop app setting: server address (one-time per PC)
- [ ] Manage technicians/users
- [ ] **Add / edit models manually** (with washing-machine attributes)
- [ ] **Register units** by serial number (scanner-ready field)
- [ ] **Open repair ticket** with reported problem and priority; claim / assign
- [ ] **Diagnosis**: pick fault codes + notes
- [ ] **Repair actions**: technician, component, action type, description, time
- [ ] Status workflow with history (who/when)
- [ ] Edit conflict protection (version check)
- [ ] **Unit history** page and **technician** page
- [ ] Search by serial / ticket / technician
- [ ] Nightly automatic backup on the server + tested restore
- [ ] **Pilot**: install the server + 2 PCs, run with real units for 1 week

✅ At the end of Phase 1, any PC can answer: *who repaired what, what they did, and the full history.*

### Phase 2 — Quality & parts (2 weeks)
- [ ] Test/QC step with the checklist, pass/fail, fail → back to repair
- [ ] Parts catalog + parts used per action
- [ ] Photo attachments (stored on the server)
- [ ] Repeat-repair warning
- [ ] Live dashboard / status board on every PC (can also run on a big TV screen)

### Phase 3 — Reports & polish (2 weeks)
- [ ] KPI reports (§8) with date filters
- [ ] Excel export, PDF print of ticket / unit history
- [ ] QR repair-tag printing
- [ ] Full roles & permissions (technician / QC / supervisor / admin)
- [ ] Audit log viewer
- [ ] Windows installer + auto-update from the factory server
- [ ] Roll out to all PCs

### Phase 4 — Grow (later)
- [ ] More categories (dryer, dishwasher, fridge, AC…) — data only
- [ ] Spare-parts stock levels & low-stock alerts
- [ ] Optional: link to ERP if those products ever get there
- [ ] Optional: Arabic/English UI switch
- [ ] Optional: login with company accounts (Active Directory)

---

## 13. What YOU need to prepare

### Data (for Phase 1)
1. **List of washing machine models** you repair — brand, model number,
   load type, capacity, spin rpm. (An Excel sheet is perfect; we'll import it.)
2. **List of technicians** — employee ID, name, shift, role.
3. **Real fault codes** used by your machines / your team (replace the examples in §6.2).
4. **Component list** your technicians actually use (check §6.1).
5. **Spare parts list** — part number + name (Phase 2).
6. **Current paper forms or Excel sheets** used for repairs today.
7. **Serial number format** — sample serials, and whether units have a barcode/QR label.
8. **Test checklist** your QC uses after repair (check §6.3).
9. **Where units come from** (production reject, customer return, etc.).

### Server & network (ask your IT team)
10. **A server or VM** on the factory network:
    - Minimum: 4 CPU cores, 8 GB RAM, 100 GB SSD (photos are the main space user)
    - OS: **Linux (Ubuntu Server 24.04) recommended**, or Windows Server with Docker
11. **A fixed address** for the server — a static IP or a name like `gamut.factory.local`.
12. **Firewall:** allow the repair PCs to reach the server on one port (e.g. 443 or 8443).
    The database port stays closed to everyone except the server itself.
13. **Backup target:** a second disk, NAS or network share for the nightly backups.
14. **HTTPS certificate** from IT (or we create an internal one).
15. **Who has admin access** to the server for installs/upgrades.

### Hardware at the benches
16. **Number of PCs** and where (receiving, each repair bench, QC, supervisor office).
17. PCs: Windows 10/11, 8 GB RAM, screen 22"+ recommended.
18. **USB barcode scanner** per bench (if units have barcodes).
19. **Label printer** (e.g. Zebra) for QR repair tags — Phase 3.
20. Optional: **webcam / phone** for repair photos; a TV for the live status board.

---

## 14. Decisions

| # | Decision | Status |
|---|---|---|
| 1 | One PC or several? | ✅ **Several PCs, central server inside the factory** |
| 2 | How PCs reach the data | ✅ Through an API server (not direct DB access) |
| 3 | Login | Employee ID + PIN in Phase 1; company accounts later (optional) |
| 4 | Track spare-parts **stock**, or just usage? | Usage only at first |
| 5 | Interface language(s) | English first — tell me if Arabic or others are needed |
| 6 | Track labor time per action? | Yes — needed for repair-time KPIs |
| 7 | Floor PC operating system | Assumed Windows |
| 8 | Server operating system | Linux recommended — confirm with IT |
| 9 | Offline mode when server is down | Not planned — app blocks saving and shows a warning |

---

## 15. Definition of done for the MVP

- From **any** PC, a technician can register a washing machine, open a ticket,
  log diagnosis and repair actions, and close it — in under 2 minutes for a simple repair.
- A change made on one PC shows up on the others within a few seconds.
- Searching a serial number shows every ticket, every action, every technician
  and every status change for that unit.
- A technician's page lists everything they repaired in a chosen date range.
- No repair record can be silently deleted; every change is traceable.
- Two people can't overwrite each other's changes without a warning.
- The server database is backed up every night, and a restore has been tested.
