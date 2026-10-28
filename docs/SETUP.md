# Gamut Repair — Setup guide

Three parts:

| Part | Where | What it is |
|---|---|---|
| **Server** | One server inside the factory | Database + the program that serves the screens to every PC |
| **Desktop app** | Every PC (test room, repair benches, line screen) | Opens the screens full-screen. Asks for the server address once. |
| **Browser** (optional) | Any PC | The same screens also work in Chrome/Edge at `http://<server>:8080` |

Updating the server updates every PC at once: the screens come from the server.

---

## 1. Install the server

### Option A — Docker (recommended, works on Linux **and** Windows Server)

1. Install Docker (Linux: Docker Engine · Windows: Docker Desktop with WSL2).
2. Copy this repository to the server.
3. In the `deploy` folder:
   ```bash
   cp .env.example .env      # then edit .env: DB_PASSWORD, TZ, BACKUP_DIR
   docker compose up -d --build
   ```
4. Open `http://<server-address>:8080` from a PC. You should see **“Configurer ce PC”**.

This starts three containers:
- `db` — PostgreSQL 16 (its port is not opened to the network)
- `app` — Gamut server on port 8080
- `backup` — a backup at start, then one every night at `BACKUP_HOUR`, kept `KEEP_DAYS` days, in `BACKUP_DIR`

**Restore a backup** (erases current data): `sh backup/restore.sh backups/gamut-YYYY-MM-DD_HHMM.dump`

**Update to a new version:** get the new code, then `docker compose up -d --build`. The database is upgraded automatically on start.

### Option B — Without Docker (Windows or Linux)

1. Install **Node.js 22** and **PostgreSQL 16**. Create a database `gamut` and a user.
2. In the repository folder:
   ```bash
   npm ci
   npm run build
   ```
3. Start the server (keep it running as a Windows service / systemd service):
   ```bash
   set DATABASE_URL=postgres://gamut:PASSWORD@localhost:5432/gamut   (Windows)
   export DATABASE_URL=postgres://gamut:PASSWORD@localhost:5432/gamut (Linux)
   npm start
   ```
4. Back up the database every night with `pg_dump -Fc`.

### Settings (environment variables)

| Variable | Meaning | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection | empty = built-in test database in `./data` |
| `PORT` | Port the PCs use | `8080` |
| `TZ` | Factory time zone (“today” starts at midnight here) | system |
| `SEED_DEMO` | `true` = fill a **new** database with example models and users | `false` with a real database |

### Network (for IT)
- Give the server a **fixed address** (static IP or a name like `gamut.usine.local`).
- Open **one port** (8080) from the factory PCs to the server. Nothing else.
- No internet access is needed — fonts and everything else are included.

---

## 2. Install the desktop app on each PC

1. Build the installer once (on any Windows PC with Node.js 22):
   ```bash
   npm ci
   npm run dist:win -w @gamut/desktop
   ```
   The installer appears in `apps/desktop/release/`.
2. Install it on each PC.
3. On first start, type the server address (e.g. `http://gamut.usine.local:8080`).
4. Then choose what this PC is: **Test room**, **Repair 1**, **Repair 2**, or **Line dashboard**.
   (The admin can rename or add stations in Settings → Stations.)

Shortcuts in the app: **F5** reload · **F11** full screen · menu *Gamut → Change server address*.

**Line dashboard PC:** choose the *Line dashboard* station. It shows the live screen without anyone
signing in. Put it on a TV near the line.

---

## 3. First steps after installing

Sign in with **employee ID `admin`, PIN `1234`**, then:

1. **Settings → People:** change the admin PIN right away. Add your quality testers, repairmen and
   supervisors (employee ID, name, role, language, PIN).
2. **Settings → Models:** add your washing machine models by hand. “Code in the serial” = the part of
   the serial number that identifies the model.
3. **Settings → Colors:** add colors and their code in the serial number.
4. **Settings → Serial number:** add the rule that reads model / color / date from the serial.
   Use “Try a serial number” to check it. *Until a rule exists, the tester simply picks the model and
   color from a list — the app works without it.*
5. Check the starter lists (and translations) under **Defect codes**, **Test checklist**,
   **Machine parts**, **Repair actions**. Replace the examples with your real ones.
6. **Settings → General:** first-pass yield target, alert after N failed retests, auto sign-out time.

Nothing is ever deleted: to stop using a model, defect, person… switch off **Active**.

### Adding another product type later (dryer, fridge, AC…)
**Settings → Product types → Add**, then add its models, defect codes, machine parts and checklist.
No code change needed.

---

## 4. Who sees what

| Role | Screens |
|---|---|
| Quality tester | Test room, unit search, own activity |
| Repairman | Repair, unit search, own activity |
| Supervisor | Everything above + line dashboard, assign repairs, scrap units, anyone's activity |
| Admin | Everything + Settings |

Rules the app enforces:
- Only the test room can pass or fail a unit. A repairman can never pass a unit.
- Nobody can pass a unit they repaired themselves.
- A repair can only go back to the test room after at least one repair is logged.
- After N failed retests (Settings → General) the supervisor is alerted.
- 5 wrong PINs lock that employee ID for 5 minutes. Idle PCs sign out automatically.

---

## 5. For developers

```bash
npm ci
npm run dev:server     # API on :8080 with a built-in database and demo data
npm run dev:web        # screens on http://localhost:5173 (hot reload)
npm run check          # typecheck + translations + tests + build
```

Demo accounts (only with demo data): `T001`/1111 tester · `R001`/2222 and `R002`/3333 repairmen ·
`S001`/4444 supervisor · `admin`/1234. Demo serial rule: `WM8FW2610000123` = model WM8F, color W,
10/2026.

Tests against a real PostgreSQL: `TEST_DATABASE_URL=postgres://… npm run test -w @gamut/server`
(use an empty database).

Database changes: edit `apps/server/src/db/schema.ts`, then `npm run db:generate` to create the
migration. Migrations run automatically when the server starts.

Project layout:
```
packages/core        shared rules: statuses, who can do what, serial number reading
apps/server          API, database, live updates (PostgreSQL / built-in PGlite for dev)
apps/web             the screens (React + Mantine), FR / AR / EN with right-to-left Arabic
apps/desktop         Electron app for the factory PCs
deploy               Docker Compose for the factory server + backups
```
